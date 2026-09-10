import React, { useEffect, useMemo, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { currency } from "../Components/pos/posUtils";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { FiImage } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  Addproduct,
  gettingallproducts,
  Searchproduct,
  Removeproduct,
  EditProduct,
} from "../features/productSlice";
import { gettingallCategory } from "../features/categorySlice";
import { gettingStore } from "../features/storeSlice";
import GenerateBarcodesModal from "../Components/GenerateBarcodesModal";
import ConfirmDeleteProductModal from "../Components/ConfirmDeleteProductModal";
import DealsModal from "../Components/DealsModal";
import ReportButton from "../Components/ReportButton";
import toast from "react-hot-toast";

// Currencies a supplier might invoice in. Mirrors the server's list in
// libs/cost.js, which mirrors the shop's own currency options.
const COST_CURRENCIES = ["EUR", "GBP", "USD", "AED", "PKR", "INR", "BDT"];
const PRODUCT_PAGE_SIZE = 75;

// Clean thumbnail with a placeholder fallback when a product has no image.
function ProductThumb({ url, alt, className = "" }) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className={`rounded-md object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-md bg-base-200 text-base-content/30 ${className}`}
    >
      <FiImage className="text-lg" />
    </div>
  );
}

const toDateInput = (value) =>
  value ? new Date(value).toISOString().split("T")[0] : "";

function Productpage() {
  const { t } = useTranslation();
  const {
    getallproduct,
    editedProduct,
    isproductadd,
    isallproductget,
    issearchdata,
    searchdata,
  } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { Authuser } = useSelector((state) => state.auth);
  // What the shop trades in. Costs are stored in this, whatever the supplier bills.
  const shopCurrency = useSelector((state) => state.store?.store?.currency) || "EUR";
  // Rates the owner saved in Settings, so a foreign cost converts without
  // anyone re-typing the rate on every product.
  const savedRates = useSelector((state) => state.store?.store?.exchangeRates) || {};
  const isAdmin = Authuser?.role === "admin";
  // Deals are a merchandising tool — admin and manager can both build them.
  const canManageDeals = ["admin", "manager", "superadmin"].includes(Authuser?.role);
  // Adding to the catalogue is the owner side's job; a manager edits and removes.
  // (The till's unknown-barcode quick add is a separate, open path.)
  const canAddProduct = ["admin", "superadmin"].includes(Authuser?.role);
  const dispatch = useDispatch();
  const [query, setquery] = useState("");
  const [name, setName] = useState("");
  const [Category, setCategory] = useState("");
  const [Price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  // A supplier abroad bills in its own money. The cost is stored converted, so
  // these two only describe how that figure was reached.
  const [costCurrency, setCostCurrency] = useState("");
  const [costRate, setCostRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [Desciption, setDesciption] = useState("");
  const [shelfLabel, setShelfLabel] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [barcode, setBarcode] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [showDeals, setShowDeals] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productPage, setProductPage] = useState(1);
  // Which channel's catalogue to show. "all" is the default and the honest one:
  // the two channels share rows, so narrowing is a lens, not a partition.
  const [channel, setChannel] = useState("all");

  useEffect(() => {
    dispatch(gettingallproducts(channel === "all" ? {} : { channel }));
    dispatch(gettingallCategory());
  }, [dispatch, editedProduct, isproductadd, channel]);

  // A narrower catalogue can be shorter than the page you were on.
  useEffect(() => {
    setProductPage(1);
  }, [channel]);

  // The cost field needs the shop's own currency and its saved exchange rates;
  // this page is reachable without passing through the till, which is the only
  // other place that loads them.
  useEffect(() => {
    dispatch(gettingStore());
  }, [dispatch]);

  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(Searchproduct(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    }
  }, [query, dispatch]);

  useEffect(() => {
    setProductPage(1);
  }, [query, getallproduct, searchdata]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("products.selectImageError"));
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const buildFormData = () => {
    // Only name and price are mandatory; everything else is sent only when set.
    const formData = new FormData();
    formData.append("name", name);
    formData.append("Price", Price);
    if (Category) formData.append("Category", Category);
    if (Desciption) formData.append("Desciption", Desciption);
    if (shelfLabel) formData.append("shelfLabel", shelfLabel);
    if (costPrice !== "") {
      formData.append("costPrice", costPrice);
      // Sent only for a foreign supplier; the server converts and records both.
      if (costCurrency && costCurrency !== shopCurrency) {
        formData.append("costCurrency", costCurrency);
        formData.append("costRate", costRate);
      }
    }
    if (quantity !== "") formData.append("quantity", quantity);
    if (lowStockThreshold !== "") formData.append("lowStockThreshold", lowStockThreshold);
    if (barcode) formData.append("barcode", barcode);
    if (expiryDate) formData.append("expiryDate", expiryDate);
    if (imageFile) formData.append("image", imageFile);
    return formData;
  };

  // The rate this cost will actually convert at: what was typed, else the one
  // saved in Settings. Mirrors resolveCost() on the server.
  const effectiveRate =
    Number(costRate) > 0 ? Number(costRate) : Number(savedRates[costCurrency]) || 0;

  // Shelf label is optional, but if given it must be letters/numbers.
  const shelfLabelValid = shelfLabel === "" || /^[A-Za-z0-9][A-Za-z0-9\- ]*$/.test(shelfLabel);

  // A product nothing points at goes straight away. One that is still on the
  // storefront, in a deal, or on past sales comes back as a 409 describing what
  // else would go with it — that becomes the confirmation dialog rather than a
  // toast the user can only read and lose.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const removeProduct = async (productId, confirm) => {
    setDeleting(true);
    try {
      const result = await dispatch(
        Removeproduct(confirm ? { productId, confirm } : productId),
      ).unwrap();
      setPendingDelete(null);
      toast.success(t("products.removed"));
      // Deleting a master product takes its whole shop page with it, so any
      // OTHER product that was only a flavour on that page stops being sold
      // online too. Those rows are still on screen under the "Online" lens —
      // which is built from the listings themselves, not from the products —
      // so that one lens has to ask again. The others show the same rows
      // either way, and the deleted row is already gone from the store.
      if (
        channel === "online" &&
        (result?.cleaned?.listingsDeleted || result?.cleaned?.variantsPulled)
      ) {
        dispatch(gettingallproducts({ channel }));
      }
    } catch (error) {
      if (error?.needsConfirmation) {
        setPendingDelete({ ...error, productId });
      } else {
        toast.error(error?.message || t("products.removeFail"));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleremove = (productId) => removeProduct(productId);

  const handleEditSubmit = (event) => {
    event.preventDefault();
    if (!selectedProduct) return;
    if (!shelfLabelValid) {
      toast.error(t("products.shelfLabelInvalid"));
      return;
    }

    dispatch(EditProduct({ id: selectedProduct._id, formData: buildFormData() }))
      .unwrap()
      .then(() => {
        toast.success(t("products.updated"));
        setIsFormVisible(false);
        setSelectedProduct(null);
        resetForm();
      })
      .catch((err) => toast.error(err || t("products.updateFail")));
  };

  const submitProduct = async (event) => {
    event.preventDefault();
    if (!shelfLabelValid) {
      toast.error(t("products.shelfLabelInvalid"));
      return;
    }
    dispatch(Addproduct(buildFormData()))
      .unwrap()
      .then(() => {
        toast.success(t("products.added"));
        resetForm();
        setIsFormVisible(false);
      })
      .catch((err) => toast.error(err || t("products.addFail")));
  };

  const resetForm = () => {
    setName("");
    setCategory("");
    setPrice("");
    setCostPrice("");
    setCostCurrency("");
    setCostRate("");
    setQuantity("");
    setDesciption("");
    setShelfLabel("");
    setLowStockThreshold("");
    setBarcode("");
    setExpiryDate("");
    setImageFile(null);
    setImagePreview("");
  };

  const handleEditClick = (product) => {
    setSelectedProduct(product);
    setName(product.name);
    setCategory(product.Category?._id || "");
    setPrice(product.Price);
    // Show the invoice's own figure where there was one, so re-saving without
    // touching the field reproduces exactly the same converted cost.
    setCostPrice(product.costSource?.amount ?? product.costPrice ?? "");
    setCostCurrency(product.costSource?.currency || "");
    setCostRate(product.costSource?.rate ?? "");
    setQuantity(product.quantity);
    setDesciption(product.Desciption || "");
    setShelfLabel(product.shelfLabel || "");
    setLowStockThreshold(product.lowStockThreshold ?? "");
    setBarcode(product.barcode || "");
    setExpiryDate(toDateInput(product.expiryDate));
    setImageFile(null);
    setImagePreview(product.image?.url || "");
    setIsFormVisible(true);
  };

  const openAddForm = () => {
    resetForm();
    setSelectedProduct(null);
    setIsFormVisible(true);
  };

  const displayProducts = useMemo(() => {
    const source = query.trim() !== "" ? searchdata : getallproduct;
    return Array.isArray(source) ? source : [];
  }, [getallproduct, query, searchdata]);

  const productPageCount = Math.max(
    1,
    Math.ceil(displayProducts.length / PRODUCT_PAGE_SIZE),
  );
  const safeProductPage = Math.min(productPage, productPageCount);
  const visibleProducts = useMemo(() => {
    const start = (safeProductPage - 1) * PRODUCT_PAGE_SIZE;
    return displayProducts.slice(start, start + PRODUCT_PAGE_SIZE);
  }, [displayProducts, safeProductPage]);
  const productStart = displayProducts.length
    ? (safeProductPage - 1) * PRODUCT_PAGE_SIZE + 1
    : 0;
  const productEnd = Math.min(
    safeProductPage * PRODUCT_PAGE_SIZE,
    displayProducts.length,
  );
  const productListLoading =
    query.trim() !== "" ? issearchdata : isallproductget && !getallproduct?.length;

  const totalValue = useMemo(
    () =>
      getallproduct?.reduce(
        (sum, p) => sum + Number(p.Price || 0) * Number(p.quantity || 0),
        0,
      ) || 0,
    [getallproduct],
  );

  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />

      <div className="px-4 py-6 sm:px-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
            <h1 className="text-sm font-semibold text-slate-300">{t("products.totalProducts")}</h1>
            <p className="mt-2 text-2xl font-bold">{getallproduct?.length || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
            <h1 className="text-sm font-semibold text-slate-300">{t("products.totalStoreValue")}</h1>
            <p className="mt-2 text-2xl font-bold">{currency(totalValue)}</p>
          </div>
          <div className="rounded-xl bg-slate-950 p-5 text-white shadow-sm">
            <h1 className="text-sm font-semibold text-slate-300">{t("products.totalCategories")}</h1>
            <p className="mt-2 text-2xl font-bold">{getallCategory?.length || 0}</p>
          </div>
        </div>

        {/* Search + Add */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setquery(e.target.value)}
            className="h-12 w-full flex-1 rounded-lg border-2 border-base-300 bg-base-100 pl-4 pr-4 text-base-content sm:max-w-md"
            placeholder={t("products.searchPlaceholder")}
          />
          {canAddProduct && (
            <button
              onClick={openAddForm}
              className="flex h-12 items-center justify-center rounded-lg bg-blue-800 px-6 text-white transition hover:bg-blue-700"
            >
              <IoMdAdd className="mr-2 text-xl" /> {t("products.addProduct")}
            </button>
          )}
          {canManageDeals && (
            <button
              onClick={() => setShowDeals(true)}
              className="flex h-12 items-center justify-center rounded-lg border-2 border-blue-800 px-6 font-semibold text-blue-800 transition hover:bg-blue-800 hover:text-white"
            >
              {t("deals.button")}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowGenerate(true)}
              className="flex h-12 items-center justify-center rounded-lg border-2 border-blue-800 px-6 font-semibold text-blue-800 transition hover:bg-blue-800 hover:text-white"
            >
              {t("generate.button")}
            </button>
          )}
          {/* The report answers the question the SCREEN is answering: narrow
              the catalogue to POS or Online and the download narrows with it.
              Reading 1,808 products here and finding another number in the
              file is the kind of gap nobody can explain afterwards.

              "all" sends nothing, so the report keeps the shape it has always
              had for anyone who never touches the switch. */}
          <ReportButton
            reportKey="inventory"
            label={t("products.inventoryReport")}
            params={channel === "all" ? undefined : { channel }}
            className="h-12"
          />
        </div>

        {/* Form drawer */}
        {isFormVisible && (
          <div className="admin-drawer fixed right-0 top-0 z-50 flex h-svh w-full max-w-2xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedProduct ? t("products.editProduct") : t("products.addProduct")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            {/* Compact two-column form so the whole thing fits a 12-13" screen
                without scrolling; only Name and Description run full width. */}
            <form
              onSubmit={selectedProduct ? handleEditSubmit : submitProduct}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {/* Image */}
                <div className="mb-3 flex items-center gap-4">
                  <ProductThumb
                    url={imagePreview}
                    alt="Preview"
                    className="h-14 w-14 border border-base-300"
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("products.productImage")}</label>
                    <label className="cursor-pointer rounded-lg border border-base-300 bg-base-200 px-3 py-1.5 text-sm hover:bg-base-300">
                      {imagePreview ? t("products.change") : t("products.upload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-sm">{t("common.name")} *</label>
                  <input
                    value={name}
                    placeholder={t("products.namePlaceholder")}
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <label className="text-sm">{t("common.category")}</label>
                    <select
                      value={Category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    >
                      <option value="">{t("products.selectCategory")}</option>
                      {getallCategory?.map((category) => (
                        <option key={category._id} value={category._id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("products.shelfLabel")}</label>
                    <input
                      value={shelfLabel}
                      placeholder={t("products.shelfLabelPlaceholder")}
                      onChange={(e) => setShelfLabel(e.target.value.toUpperCase())}
                      type="text"
                      className={`mt-1 h-10 w-full rounded-lg border-2 bg-base-100 px-2 uppercase text-base-content ${
                        shelfLabelValid ? "border-base-300" : "border-red-500"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("products.sellingPrice")} *</label>
                    <input
                      type="number"
                      placeholder={t("products.sellingPricePlaceholder")}
                      value={Price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("products.costPrice")}</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        placeholder={t("products.costPricePlaceholder")}
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        className="h-10 w-full min-w-0 rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                        min="0"
                        step="0.01"
                      />
                      {/* Suppliers abroad bill in their own money. Naming it here
                          keeps the figure on the invoice enterable as-is. */}
                      <select
                        value={costCurrency || shopCurrency}
                        onChange={(e) => setCostCurrency(e.target.value)}
                        className="h-10 shrink-0 rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                        aria-label={t("products.costCurrency")}
                      >
                        {COST_CURRENCIES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>

                    {costCurrency && costCurrency !== shopCurrency && (
                      <div className="mt-2 rounded-lg border-2 border-base-300 bg-base-200/40 p-2">
                        <label className="text-xs">
                          {t("products.costRate", { from: costCurrency, to: shopCurrency })}
                        </label>
                        <input
                          type="number"
                          // Blank uses the rate from Settings; typing here
                          // overrides it for this one product.
                          placeholder={
                            effectiveRate
                              ? t("products.costRateFromSettings", { rate: effectiveRate })
                              : t("products.costRatePlaceholder")
                          }
                          value={costRate}
                          onChange={(e) => setCostRate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                          min="0"
                          step="0.0001"
                          required={!savedRates[costCurrency]}
                        />
                        <p className="mt-1 text-xs opacity-70">
                          {Number(costPrice) > 0 && effectiveRate > 0
                            ? t("products.costConverted", {
                                amount: Number(costPrice).toFixed(2),
                                from: costCurrency,
                                result: (Number(costPrice) * effectiveRate).toFixed(2),
                                to: shopCurrency,
                              })
                            : t("products.costRateMissing", { currency: costCurrency })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm">{t("common.quantity")}</label>
                    <input
                      type="number"
                      placeholder={t("products.quantityPlaceholder")}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("products.lowStockThreshold")}</label>
                    <input
                      type="number"
                      placeholder="0.0"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.barcode")}</label>
                    <input
                      value={barcode}
                      placeholder={t("products.barcodePlaceholder")}
                      onChange={(e) => setBarcode(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("products.expiryDate")}</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("common.description")}</label>
                    <input
                      value={Desciption}
                      placeholder={t("products.descPlaceholder")}
                      onChange={(e) => setDesciption(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>
                </div>

                {!shelfLabelValid && (
                  <p className="mt-2 text-xs text-red-500">{t("products.shelfLabelInvalid")}</p>
                )}
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedProduct ? t("products.updateProduct") : t("products.addProduct")}
                </button>
              </div>
            </form>
          </div>
        )}

        {showGenerate && isAdmin && (
          <GenerateBarcodesModal onClose={() => setShowGenerate(false)} />
        )}

        {showDeals && canManageDeals && (
          <DealsModal onClose={() => setShowDeals(false)} />
        )}

        {pendingDelete && (
          <ConfirmDeleteProductModal
            details={pendingDelete}
            busy={deleting}
            onConfirm={(word) => removeProduct(pendingDelete.productId, word)}
            onClose={() => setPendingDelete(null)}
          />
        )}

        {/* Product list */}
        <div className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{t("products.productList")}</h2>
              <p className="mt-1 text-sm text-base-content/60">
                {productListLoading
                  ? t("common.loading", "Loading...")
                  : `${productStart}-${productEnd} of ${displayProducts.length} products`}
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-base-300 p-1">
              {[
                { key: "all", label: "All" },
                { key: "pos", label: "POS" },
                { key: "online", label: "Online" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={channel === option.key}
                  onClick={() => setChannel(option.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    channel === option.key
                      ? "bg-blue-800 text-white"
                      : "text-base-content/70 hover:bg-base-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative overflow-x-auto">
            {productListLoading && (
              <div className="absolute inset-x-0 top-0 z-10 border border-base-300 bg-base-100/95 px-4 py-3 text-sm font-medium shadow-sm">
                {t("common.loading", "Loading...")}
              </div>
            )}
            <table className="min-w-full rounded-lg border border-base-300 bg-base-100 shadow-md">
              <thead className="bg-base-200">
                <tr>
                  <th className="border px-3 py-2">#</th>
                  <th className="border px-3 py-2">{t("common.image")}</th>
                  <th className="border px-3 py-2">{t("common.name")}</th>
                  <th className="border px-3 py-2">{t("products.shelfLabel")}</th>
                  <th className="border px-3 py-2">{t("common.category")}</th>
                  <th className="border px-3 py-2">{t("common.barcode")}</th>
                  <th className="border px-3 py-2">{t("common.quantity")}</th>
                  <th className="border px-3 py-2">{t("common.price")}</th>
                  <th className="border px-3 py-2">{t("products.expiry")}</th>
                  <th className="w-56 border px-3 py-2">{t("common.operations")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.length > 0 ? (
                  visibleProducts.map((product, index) => (
                    <tr key={product._id}>
                      <td className="border px-3 py-2">
                        {(safeProductPage - 1) * PRODUCT_PAGE_SIZE + index + 1}
                      </td>
                      <td className="border px-3 py-2">
                        <ProductThumb
                          url={product.image?.url}
                          alt={product.name}
                          className="h-12 w-12"
                        />
                      </td>
                      <td className="border px-3 py-2">{product.name}</td>
                      <td className="border px-3 py-2 font-mono">{product.shelfLabel || "—"}</td>
                      <td className="border px-3 py-2">
                        {product.Category?.name || t("products.noCategory")}
                      </td>
                      <td className="border px-3 py-2">{product.barcode || "—"}</td>
                      <td className="border px-3 py-2">{product.quantity}</td>
                      <td className="border px-3 py-2">{currency(product.Price)}</td>
                      <td className="border px-3 py-2">
                        {product.expiryDate
                          ? new Date(product.expiryDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="border px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleremove(product._id)}
                            className="h-10 flex-1 rounded-md bg-red-500 text-white hover:bg-red-700"
                          >
                            {t("common.remove")}
                          </button>
                          <button
                            onClick={() => handleEditClick(product)}
                            className="h-10 flex-1 rounded-md bg-green-500 text-white hover:bg-green-700"
                          >
                            {t("common.edit")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="py-4 text-center">
                      {t("products.noProducts")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paging sits under the table: with 75 rows a page, whoever needs the
              next page has just scrolled past all of them, and sending them back
              to the top to move on is the one thing this control must not do. */}
          {displayProducts.length > PRODUCT_PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-base-content/60">
                {`${productStart}-${productEnd} of ${displayProducts.length} products`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-base-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                  disabled={safeProductPage <= 1}
                  onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span className="text-sm text-base-content/60">
                  Page {safeProductPage} / {productPageCount}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-base-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                  disabled={safeProductPage >= productPageCount}
                  onClick={() =>
                    setProductPage((page) => Math.min(productPageCount, page + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Productpage;
