import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import {
  CreateSupplier,
  gettingallSupplier,
  deleteSupplier,
  SearchSupplier,
  EditSupplier,
} from "../features/SupplierSlice";
import { gettingallproducts } from "../features/productSlice";
import toast from "react-hot-toast";
import { RaiseRequest } from "../features/approvalSlice";
import FormattedTime from "../lib/FormattedTime ";

function Supplierpage() {
  const { t } = useTranslation();
  const { getallSupplier, searchdata, editedsupplier } = useSelector(
    (state) => state.supplier
  );
  const { getallproduct } = useSelector((state) => state.product);
  const { Authuser } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  // Only the owner adds a supplier outright; everyone else asks.
  const canCreateDirectly = Authuser?.role === "superadmin";
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [Phone, setPhone] = useState("");
  const [Address, setAddress] = useState("");
  const [Email, setEmail] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  // A supplier supplies many products, so this is a list of ids.
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");

  const allProducts = Array.isArray(getallproduct) ? getallproduct : [];

  const toggleProduct = (id) =>
    setProducts((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );

  const productMatches = allProducts.filter((product) => {
    const value = productQuery.trim().toLowerCase();
    if (!value) return true;
    return (
      product.name?.toLowerCase().includes(value) ||
      product.barcode?.toLowerCase().includes(value)
    );
  });

  useEffect(() => {
    dispatch(gettingallSupplier());
    // The product picker in the form needs the catalogue loaded, otherwise it
    // shows "No products match" for everything. This page never fetched it.
    dispatch(gettingallproducts());
  }, [dispatch, editedsupplier]);

  useEffect(() => {
    if (query.trim() !== "") {
      const timeoutId = setTimeout(() => {
        dispatch(SearchSupplier(query));
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      dispatch(gettingallSupplier());
    }
  }, [query, dispatch]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setAddress("");
    setEmail("");
    setProducts([]);
    setProductQuery("");
    setSelectedSupplier(null);
  };

  const handleEditSubmit = (event) => {
    event.preventDefault();

    if (!selectedSupplier) return;

    const updatedData = {
      name,
      contactInfo: {
        phone: Phone,
        email: Email,
        address: Address,
      },
      productsSupplied: products,
    };

    dispatch(EditSupplier({ supplierId: selectedSupplier._id, updatedData }))
      .unwrap()
      .then(() => {
        toast.success(t("suppliers.updated"));
        setIsFormVisible(false);
        setSelectedSupplier(null);
        resetForm();
      })
      .catch(() => {
        toast.error(t("suppliers.updateFail"));
      });
  };

  const handleEditClick = (supplier) => {
    setSelectedSupplier(supplier);
    setName(supplier.name);
    setPhone(supplier.contactInfo?.phone);
    setEmail(supplier.contactInfo?.email);
    setAddress(supplier.contactInfo?.address);
    // Now a list, and populated — map back to plain ids for the picker. Older
    // rows may still hold a single value, so normalise either shape.
    const supplied = supplier?.productsSupplied;
    const list = Array.isArray(supplied) ? supplied : supplied ? [supplied] : [];
    setProducts(list.map((entry) => String(entry?._id || entry)));
    setProductQuery("");
    setIsFormVisible(true);
  };

  const handleRemove = async (SupplierId) => {
    dispatch(deleteSupplier(SupplierId))
      .unwrap()
      .then(() => {
        toast.success(t("suppliers.removed"));
      })
      .catch((error) => {
        toast.error(error || t("suppliers.removeFail"));
      });
  };

  const submitSupplier = async (event) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error(t("suppliers.nameRequired"));
      return;
    }

    const supplierInfo = {
      name: name.trim(),
      contactInfo: {
        phone: Phone,
        email: Email,
        address: Address,
      },
      productsSupplied: products,
    };

    // Adding a supplier is the owner's call. Everyone else sends the details for
    // approval — the superadmin's approval is what actually creates it, so there
    // is nothing left to do here afterwards.
    if (!canCreateDirectly) {
      dispatch(RaiseRequest({ type: "create_supplier", payload: supplierInfo }))
        .unwrap()
        .then((response) => {
          toast.success(
            t("suppliers.requested", { ref: response?.request?.reference || "" })
          );
          resetForm();
          setIsFormVisible(false);
        })
        .catch((error) => toast.error(error || t("suppliers.requestFail")));
      return;
    }

    dispatch(CreateSupplier(supplierInfo))
      .unwrap()
      .then(() => {
        toast.success(t("suppliers.added"));
        resetForm();
        dispatch(gettingallSupplier());
      })
      .catch((error) => {
        toast.error(error || t("suppliers.addFail"));
      });
  };

  const displaySuppliers = query.trim() !== "" ? searchdata : getallSupplier;

  if (!getallSupplier) {
    return <div>{t("suppliers.loading")}</div>;
  }

  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />
      <div className="mt-10 ml-5 mb-10">
      <div className="bg-blue-950 w-56 rounded-xl  ml-10 block h-24">
          <h1 className="text-white ml-12 block pt-5 font-bold">{t("suppliers.totalSupplier")}</h1>
          <p className="text-white font-bold  pt-2  ml-24">{getallSupplier?.length || "0"}</p>

        </div>
        <div className="flex items-center space-x-4  mt-10">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("suppliers.searchPlaceholder")}
          />
          <button
            onClick={() => {
              setIsFormVisible(true);
              setSelectedSupplier(null);
              resetForm();
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("suppliers.addSupplier")}
          </button>
        </div>

        {isFormVisible && (
          <div className="fixed right-0 top-0 z-50 flex h-svh w-full max-w-2xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedSupplier ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form
              onSubmit={selectedSupplier ? handleEditSubmit : submitSupplier}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {/* Say up front that this goes to the owner — finding out only after
                    pressing the button is a nasty surprise. */}
                {!selectedSupplier && !canCreateDirectly && (
                  <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    {t("suppliers.needsApproval")}
                  </p>
                )}

                {/* Four short fields side by side so nothing runs off the screen. */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <label className="text-sm">{t("common.name")}</label>
                    <input
                      value={name}
                      placeholder={t("suppliers.namePlaceholder")}
                      onChange={(e) => setName(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.phone")}</label>
                    <input
                      value={Phone}
                      placeholder={t("suppliers.phonePlaceholder")}
                      onChange={(e) => setPhone(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.email")}</label>
                    <input
                      value={Email}
                      placeholder={t("suppliers.emailPlaceholder")}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.address")}</label>
                    <input
                      type="text"
                      placeholder={t("suppliers.addressPlaceholder")}
                      value={Address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>
                </div>

                {/* A supplier supplies many products — tick as many as apply.
                    Searchable, because the catalogue runs to thousands. */}
                <div className="mt-3">
                  <label className="text-sm">
                    {t("suppliers.products")}
                    {products.length > 0 && (
                      <span className="ml-2 rounded bg-blue-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {products.length}
                      </span>
                    )}
                  </label>

                  <input
                    type="text"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder={t("suppliers.searchProducts")}
                    className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  />

                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border-2 border-base-300">
                    {productMatches.length === 0 ? (
                      <p className="py-6 text-center text-sm text-base-content/50">
                        {t("suppliers.noProducts")}
                      </p>
                    ) : (
                      productMatches.map((product) => {
                        const checked = products.includes(product._id);
                        // Already supplied by someone else — a product has one
                        // supplier, so ticking it here takes it off them.
                        const takenBy =
                          product.supplier &&
                          String(product.supplier?._id || product.supplier) !==
                            String(selectedSupplier?._id) &&
                          !checked;

                        return (
                          <label
                            key={product._id}
                            className={`flex cursor-pointer items-center gap-2 border-b border-base-200 px-3 py-2 text-sm last:border-b-0 hover:bg-base-200 ${
                              checked ? "bg-blue-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProduct(product._id)}
                              className="h-4 w-4 accent-blue-800"
                            />
                            <span className="min-w-0 flex-1 truncate">{product.name}</span>
                            {takenBy && (
                              <span
                                title={t("suppliers.alreadySupplied")}
                                className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700"
                              >
                                {t("suppliers.taken")}
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1 text-xs text-base-content/50">{t("suppliers.productsHint")}</p>
                </div>
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedSupplier
                    ? t("suppliers.updateSupplier")
                    : canCreateDirectly
                    ? t("suppliers.addSupplier")
                    : t("suppliers.sendForApproval")}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">{t("suppliers.supplierList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr>
                  <th className="px-3 py-2 border">#</th>
                  <th className="px-3 py-2 border">{t("common.name")}</th>
                  <th className="px-3 py-2 border">{t("common.phone")}</th>
                  <th className="px-3 py-2 border">{t("common.email")}</th>
                  <th className="px-3 py-2 border">{t("common.address")}</th>
                  <th className="px-3 py-2 border">{t("suppliers.products")}</th>
                  <th className="px-3 py-2 border">{t("suppliers.addTime")}</th>
                  <th className="px-3 py-2 border">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(displaySuppliers) &&
                displaySuppliers.length > 0 ? (
                  displaySuppliers?.map((supplier, index) => (
                    <tr key={supplier._id} className="">
                      <td className="px-3 py-2 border">{index + 1}</td>
                      <td className="px-3 py-2 border">{supplier.name}</td>
                      <td className="px-3 py-2 border">
                        {supplier.contactInfo?.phone}
                      </td>
                      <td className="px-3 py-2 border">
                        {supplier.contactInfo?.email}
                      </td>
                      <td className="px-3 py-2 border">
                        {supplier.contactInfo?.address}
                      </td>
                      {/* What they actually supply. Older rows may hold a single
                          value rather than a list, so handle either. */}
                      <td className="px-3 py-2 border">
                        {(() => {
                          const supplied = supplier.productsSupplied;
                          const list = Array.isArray(supplied)
                            ? supplied
                            : supplied
                            ? [supplied]
                            : [];

                          if (list.length === 0) {
                            return <span className="text-base-content/40">—</span>;
                          }

                          return (
                            <div className="flex flex-wrap gap-1">
                              {list.slice(0, 3).map((product) => (
                                <span
                                  key={product?._id || product}
                                  className="rounded bg-base-200 px-1.5 py-0.5 text-xs"
                                >
                                  {product?.name || "?"}
                                </span>
                              ))}
                              {list.length > 3 && (
                                <span className="rounded bg-blue-800 px-1.5 py-0.5 text-xs font-semibold text-white">
                                  +{list.length - 3}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 border">
                        <FormattedTime timestamp={supplier.createdAt} />
                      </td>
                      <td className="px-4 py-2 border">
                        <button
                          onClick={() => handleRemove(supplier?._id)}
                          className="h-10 w-24 bg-red-500 hover:bg-red-700 rounded-md text-white"
                        >
                          {t("common.remove")}
                        </button>
                        <button
                          onClick={() => handleEditClick(supplier)}
                          className="h-10 w-24 bg-green-500 hover:bg-green-700 rounded-md text-white ml-2"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      {t("suppliers.noSupplier")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Supplierpage;
