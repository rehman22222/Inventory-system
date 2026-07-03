import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { FiImage } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import FormattedTime from "../lib/FormattedTime ";
import {
  Addproduct,
  gettingallproducts,
  Searchproduct,
  Removeproduct,
  EditProduct,
} from "../features/productSlice";
import { gettingallCategory } from "../features/categorySlice";
import ReportButton from "../Components/ReportButton";
import toast from "react-hot-toast";

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
  const { getallproduct, editedProduct, isproductadd, searchdata } = useSelector(
    (state) => state.product
  );
  const { getallCategory } = useSelector((state) => state.category);
  const dispatch = useDispatch();
  const [query, setquery] = useState("");
  const [name, setName] = useState("");
  const [Category, setCategory] = useState("");
  const [Price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [Desciption, setDesciption] = useState("");
  const [barcode, setBarcode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    dispatch(gettingallproducts());
    dispatch(gettingallCategory());
  }, [dispatch, editedProduct, isproductadd]);

  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(Searchproduct(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(gettingallproducts());
    }
  }, [query, dispatch]);

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
    const formData = new FormData();
    formData.append("name", name);
    formData.append("Category", Category);
    formData.append("Price", Price);
    if (costPrice !== "") formData.append("costPrice", costPrice);
    formData.append("quantity", quantity);
    formData.append("Desciption", Desciption);
    if (barcode) formData.append("barcode", barcode);
    if (expiryDate) formData.append("expiryDate", expiryDate);
    if (imageFile) formData.append("image", imageFile);
    return formData;
  };

  const handleremove = async (productId) => {
    dispatch(Removeproduct(productId))
      .unwrap()
      .then(() => toast.success(t("products.removed")))
      .catch((error) => toast.error(error || t("products.removeFail")));
  };

  const handleEditSubmit = (event) => {
    event.preventDefault();
    if (!selectedProduct) return;

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
    setQuantity("");
    setDesciption("");
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
    setCostPrice(product.costPrice ?? "");
    setQuantity(product.quantity);
    setDesciption(product.Desciption);
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

  const displayProducts = query.trim() !== "" ? searchdata : getallproduct;

  const totalValue =
    getallproduct?.reduce((sum, p) => sum + Number(p.Price || 0) * Number(p.quantity || 0), 0) || 0;

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
            <p className="mt-2 text-2xl font-bold">${totalValue.toFixed(2)}</p>
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
          <button
            onClick={openAddForm}
            className="flex h-12 items-center justify-center rounded-lg bg-blue-800 px-6 text-white transition hover:bg-blue-700"
          >
            <IoMdAdd className="mr-2 text-xl" /> {t("products.addProduct")}
          </button>
          <ReportButton
            reportKey="inventory"
            label={t("products.inventoryReport")}
            className="h-12"
          />
        </div>

        {/* Form drawer */}
        {isFormVisible && (
          <div className="fixed right-0 top-0 z-50 h-svh w-full max-w-sm overflow-y-auto border-l-2 border-base-300 bg-base-100 p-6 shadow-xl">
            <div className="text-right">
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="ml-auto cursor-pointer text-2xl"
              />
            </div>

            <h1 className="mb-4 text-xl font-semibold">
              {selectedProduct ? t("products.editProduct") : t("products.addProduct")}
            </h1>

            <form onSubmit={selectedProduct ? handleEditSubmit : submitProduct}>
              {/* Image */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">{t("products.productImage")}</label>
                <div className="flex items-center gap-4">
                  <ProductThumb
                    url={imagePreview}
                    alt="Preview"
                    className="h-16 w-16 border border-base-300"
                  />
                  <label className="cursor-pointer rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm hover:bg-base-300">
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

              <div className="mb-4">
                <label>{t("common.name")}</label>
                <input
                  value={name}
                  placeholder={t("products.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  required
                />
              </div>

              <div className="mb-4">
                <label>{t("common.category")}</label>
                <select
                  value={Category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  required
                >
                  <option value="">{t("products.selectCategory")}</option>
                  {getallCategory?.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label>{t("common.description")}</label>
                <input
                  value={Desciption}
                  placeholder={t("products.descPlaceholder")}
                  onChange={(e) => setDesciption(e.target.value)}
                  type="text"
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  required
                />
              </div>

              <div className="mb-4">
                <label>{t("common.barcode")}</label>
                <input
                  value={barcode}
                  placeholder={t("products.barcodePlaceholder")}
                  onChange={(e) => setBarcode(e.target.value)}
                  type="text"
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                />
              </div>

              <div className="mb-4">
                <label>{t("products.sellingPrice")}</label>
                <input
                  type="number"
                  placeholder={t("products.sellingPricePlaceholder")}
                  value={Price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  required
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="mb-4">
                <label>{t("products.costPrice")}</label>
                <input
                  type="number"
                  placeholder={t("products.costPricePlaceholder")}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="mb-4">
                <label>{t("common.quantity")}</label>
                <input
                  type="number"
                  placeholder={t("products.quantityPlaceholder")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  required
                  min="0"
                />
              </div>

              <div className="mb-4">
                <label>{t("products.expiryDate")}</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                />
              </div>

              <button
                type="submit"
                className="mt-4 h-12 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
              >
                {selectedProduct ? t("products.updateProduct") : t("products.addProduct")}
              </button>
            </form>
          </div>
        )}

        {/* Product list */}
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">{t("products.productList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full rounded-lg border border-base-300 bg-base-100 shadow-md">
              <thead className="bg-base-200">
                <tr>
                  <th className="border px-3 py-2">#</th>
                  <th className="border px-3 py-2">{t("common.image")}</th>
                  <th className="border px-3 py-2">{t("common.name")}</th>
                  <th className="border px-3 py-2">{t("common.category")}</th>
                  <th className="border px-3 py-2">{t("common.barcode")}</th>
                  <th className="border px-3 py-2">{t("common.quantity")}</th>
                  <th className="border px-3 py-2">{t("common.price")}</th>
                  <th className="border px-3 py-2">{t("products.expiry")}</th>
                  <th className="w-56 border px-3 py-2">{t("common.operations")}</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(displayProducts) && displayProducts.length > 0 ? (
                  displayProducts.map((product, index) => (
                    <tr key={product._id}>
                      <td className="border px-3 py-2">{index + 1}</td>
                      <td className="border px-3 py-2">
                        <ProductThumb
                          url={product.image?.url}
                          alt={product.name}
                          className="h-12 w-12"
                        />
                      </td>
                      <td className="border px-3 py-2">{product.name}</td>
                      <td className="border px-3 py-2">
                        {product.Category?.name || t("products.noCategory")}
                      </td>
                      <td className="border px-3 py-2">{product.barcode || "—"}</td>
                      <td className="border px-3 py-2">{product.quantity}</td>
                      <td className="border px-3 py-2">${product.Price}</td>
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
                    <td colSpan="9" className="py-4 text-center">
                      {t("products.noProducts")}
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

export default Productpage;
