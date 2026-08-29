import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import TopNavbar from "../Components/TopNavbar";
import { currency } from "../Components/pos/posUtils";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import FormattedTime from "../lib/FormattedTime ";
import OrderStatusChart from "../lib/OrderStatusChart"
import {
  createdOrder,
  Removedorder,
  updatestatusOrder,
  gettingallOrder,
  SearchOrder,
  SendOrder,
  ReceiveOrder,
} from "../features/orderSlice";

import { gettingallproducts } from "../features/productSlice";
import { gettingallSupplier } from "../features/SupplierSlice";

function Orderpage() {
  const { t } = useTranslation();
  const {
    getorder,
    editorder,
    searchdata,
  } = useSelector((state) => state.order);
  const { getallproduct } = useSelector((state) => state.product);
  const { getallSupplier } = useSelector((state) => state.supplier);
  const { Authuser } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [query, setquery] = useState("");
  // Which supplier we're ordering from — a purchase order is placed with one.
  const [supplier, setSupplier] = useState("");
  const [Product, setProduct] = useState("");
  const [Price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  // The basket being built: [{ productId, name, price, quantity, stock }].
  const [lines, setLines] = useState([]);
  const [Description, setDescription] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedOrder, setselectedOrder] = useState(null);

  // Only the chosen supplier's products can go on the order — you buy from the
  // supplier that provides them. Product.supplier is the inverse of the
  // supplier's productsSupplied, kept in step by the backend.
  const supplierProducts = (Array.isArray(getallproduct) ? getallproduct : []).filter(
    (p) => supplier && String(p.supplier?._id || p.supplier || "") === String(supplier)
  );

  // The price is the catalogue's, not something to be typed: picking a product
  // fills it in, and it stays read-only.
  const chosenProduct = supplierProducts.find((entry) => entry._id === Product);

  useEffect(() => {
    setPrice(chosenProduct ? String(chosenProduct.Price ?? "") : "");
  }, [chosenProduct]);

  const linesTotal = lines.reduce(
    (sum, line) => sum + line.price * (Number(line.quantity) || 0),
    0
  );

  // Add the currently-picked product to the basket. Re-picking the same product
  // just raises its quantity rather than adding a second row.
  const addLine = () => {
    if (!chosenProduct) {
      toast.error(t("orders.pickProduct"));
      return;
    }

    const wanted = Number(quantity);
    if (!Number.isFinite(wanted) || wanted <= 0) {
      toast.error(t("orders.pickQuantity"));
      return;
    }

    // No stock ceiling: this is a purchase order — you can order any quantity
    // from the supplier regardless of what's currently on the shelf.
    const stock = Number(chosenProduct.quantity || 0);

    setLines((current) => {
      const existing = current.find((line) => line.productId === chosenProduct._id);
      if (existing) {
        return current.map((line) =>
          line.productId === chosenProduct._id
            ? { ...line, quantity: Number(line.quantity || 0) + wanted }
            : line
        );
      }
      return [
        ...current,
        {
          productId: chosenProduct._id,
          name: chosenProduct.name,
          price: Number(chosenProduct.Price || 0),
          quantity: wanted,
          stock,
        },
      ];
    });

    setProduct("");
    setQuantity("");
  };

  const removeLine = (productId) =>
    setLines((current) => current.filter((line) => line.productId !== productId));

  // Edit a line's quantity inline. Kept as raw text while typing (so the field
  // can be cleared to retype) and coerced to a number on submit.
  const updateLineQuantity = (productId, value) =>
    setLines((current) =>
      current.map((line) =>
        line.productId === productId
          ? { ...line, quantity: value === "" ? "" : Math.max(1, Number(value) || 1) }
          : line
      )
    );

  useEffect(() => {
    dispatch(gettingallOrder());
    dispatch(gettingallproducts({ view: "supplier" }));
    dispatch(gettingallSupplier());

  }, [dispatch,Authuser]);

  useEffect(() => {
    dispatch(gettingallOrder());
 
  }, [dispatch,  editorder]);











  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(SearchOrder(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(gettingallOrder());
    }
  }, [query, dispatch]);

  const handleEditSubmit = (event) => {
    event.preventDefault();


    if (!selectedOrder) return;

    if (lines.length === 0) {
      toast.error(t("orders.requiredFields"));
      return;
    }

    // Quantities are editable; prices come from the catalogue on the server, so
    // we only send the product and the (new) quantity for each line.
    const updatedData = {
      Description,
      Products: lines.map((line) => ({
        product: line.productId,
        quantity: Number(line.quantity) || 1,
      })),
    };

    dispatch( updatestatusOrder({ OrderId: selectedOrder._id,  updatedData }))
      .unwrap()
      .then(() => {
        toast.success(t("orders.updated"));
        setIsFormVisible(false);
        setselectedOrder(null);
        resetForm();
      })
      .catch(() => {
        toast.error(t("orders.updateFail"));
      });
  };

  const submitOrder = async (event) => {
    event.preventDefault();

    if (!supplier) {
      toast.error(t("orders.pickSupplier"));
      return;
    }
    if (lines.length === 0) {
      toast.error(t("orders.requiredFields"));
      return;
    }

    const orderData = {
      user: Authuser?.id || "",
      supplier,
      Description,
      // Price is deliberately not sent — the server reads it from the catalogue.
      Products: lines.map((line) => ({
        product: line.productId,
        quantity: Number(line.quantity),
      })),
    };

    try {
      await dispatch(createdOrder(orderData)).unwrap();
      // Pull the fresh list so the new order shows immediately (no manual refresh).
      dispatch(gettingallOrder());
      toast.success(t("orders.created"));
      resetForm();
      setIsFormVisible(false);
    } catch (error) {
      toast.error(error?.message || error || t("orders.createFail"));
    }
  };

  const resetForm = () => {
    setSupplier("");
    setProduct("");
    setPrice("");
    setQuantity("");
    setLines([]);
    setDescription("");
  };

  const handleEditClick = (order) => {
    setselectedOrder(order);
    // Set the supplier so more of that supplier's products can be added while
    // editing; existing lines' quantities can be changed and lines removed.
    setSupplier(String(order.supplier?._id || order.supplier || ""));
    setProduct("");
    setQuantity("");
    setLines(
      (order.Products || []).map((line) => ({
        productId: line.product?._id || String(line.product),
        name: line.product?.name || "",
        price: Number(line.price || 0),
        quantity: Number(line.quantity || 0),
      }))
    );
    setDescription(order.Description|| "");
    setIsFormVisible(true);
  };

  const handleremove = async (OrderId) => {
    dispatch( Removedorder(OrderId))
      .unwrap()
      .then(() => {
        toast.success(t("orders.removed"));
      })
      .catch((error) => {
        toast.error(error || t("orders.removeFail"));
      });
  };

  // The deliberate "send" — asks first, then emails the supplier.
  const handleSend = async (order) => {
    if (!window.confirm(t("orders.sendConfirm", { supplier: order.supplierName || "supplier" }))) return;
    try {
      await dispatch(SendOrder(order._id)).unwrap();
      toast.success(t("orders.sent"));
      dispatch(gettingallOrder());
    } catch (error) {
      toast.error(error || t("orders.sendFail"));
    }
  };

  // The admin confirms the goods arrived — asks first, then the server adds the
  // ordered quantities into inventory. Nothing touches stock before this.
  const handleReceive = async (order) => {
    if (!window.confirm(t("orders.receiveConfirm"))) return;
    try {
      await dispatch(ReceiveOrder(order._id)).unwrap();
      toast.success(t("orders.received"));
      dispatch(gettingallOrder());
      // Reflect the new stock levels straight away.
      dispatch(gettingallproducts({ view: "supplier" }));
    } catch (error) {
      toast.error(error || t("orders.receiveFail"));
    }
  };

  const displayOrder = query.trim() !== "" ? searchdata : getorder;




  


  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />

      < OrderStatusChart className="mt-10 mb-10 mx-auto"/>

      <div className="mt-12 ml-5">
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setquery(e.target.value)}
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("orders.searchPlaceholder")}
          />
          <button
            onClick={() => {
              setIsFormVisible(true);
              setselectedOrder(null);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("orders.addOrder")}
          </button>
        </div>

        {isFormVisible && (
          <div className="admin-drawer fixed right-0 top-0 z-50 flex h-svh w-full max-w-2xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedOrder ? t("orders.editOrder") : t("orders.addOrder")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form
              onSubmit={selectedOrder ? handleEditSubmit : submitOrder}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* A purchase order is placed with one supplier — pick it first;
                  the products below are the ones that supplier provides. */}
              {!selectedOrder && (
                <div className="mb-4">
                  <label className="text-sm">{t("orders.supplier")}</label>
                  <select
                    value={supplier}
                    onChange={(e) => {
                      setSupplier(e.target.value);
                      setProduct("");
                    }}
                    className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  >
                    <option value="">{t("orders.selectSupplier")}</option>
                    {(Array.isArray(getallSupplier) ? getallSupplier : []).map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                        {s.contactInfo?.email ? "" : ` — ${t("orders.noEmail")}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-4">
                <label className="text-sm">{t("common.description")}</label>
                <input
                  value={Description}
                  placeholder={t("orders.descPlaceholder")}
                  onChange={(e) => setDescription(e.target.value)}
                  type="text"
                  className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                />
              </div>

              {/* Add more of the supplier's products to the basket — available
                  when creating and when editing an existing order. */}
              {(
                <div className="mb-4 rounded-lg border-2 border-base-300 p-3">
                  <label className="text-sm font-semibold">{t("orders.product")}</label>

                  <select
                    value={Product}
                    onChange={(e) => setProduct(e.target.value)}
                    disabled={!supplier}
                    className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content disabled:opacity-50"
                  >
                    <option value="">
                      {!supplier
                        ? t("orders.selectSupplierFirst")
                        : supplierProducts.length === 0
                        ? t("orders.supplierNoProducts")
                        : t("orders.selectProduct")}
                    </option>
                    {supplierProducts.map((product) => (
                      <option key={product._id} value={product._id}>
                        {product.name}
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-base-content/60">{t("common.price")}</label>
                      <input
                        type="text"
                        readOnly
                        value={Price === "" ? "—" : `$${Number(Price).toFixed(2)}`}
                        title={t("orders.priceAuto")}
                        className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-1 bg-base-200 text-base-content/70 cursor-not-allowed"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-base-content/60">{t("common.quantity")}</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="0.0"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-1 bg-base-100 text-base-content"
                      />
                    </div>
                  </div>

                  {chosenProduct && (
                    <p className="mt-1 text-xs text-base-content/50">
                      {t("orders.inStock", { count: Number(chosenProduct.quantity || 0) })}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={addLine}
                    className="mt-2 h-9 w-full rounded-lg border-2 border-blue-800 text-sm font-semibold text-blue-800 transition hover:bg-blue-800 hover:text-white"
                  >
                    + {t("orders.addProductToOrder")}
                  </button>
                </div>
              )}

              {lines.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  {lines.map((line) => (
                    <div
                      key={line.productId}
                      className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/40 px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{line.name}</span>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLineQuantity(line.productId, e.target.value)}
                        className="h-8 w-16 rounded-md border border-base-300 bg-base-100 px-2 text-center tabular-nums text-base-content"
                        aria-label={t("common.quantity")}
                      />
                      <span className="tabular-nums text-base-content/50">
                        × ${line.price.toFixed(2)}
                      </span>
                      <span className="w-16 text-end font-semibold tabular-nums">
                        ${((Number(line.quantity) || 0) * line.price).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.productId)}
                        className="px-1 text-red-500 hover:text-red-700"
                        aria-label={t("common.remove")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-base-300 px-2 pt-2 text-sm font-bold">
                    <span>{t("orders.orderTotal")}</span>
                    <span className="tabular-nums">{currency(linesTotal)}</span>
                  </div>
                </div>
              )}
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedOrder ? t("orders.updateOrder") : t("orders.addOrderBtn")}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">{t("orders.orderList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr className="bg-base-100">
                  <th className="px-3 py-2 bg-base-100 border w-5">#</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.product")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.quantity")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.description")}</th>
                  <th className="px-3 py-2  bg-base-100  border">{t("orders.totalAmount")}</th>
                  <th className="px-3 py-2 bg-base-100  border">{t("orders.supplier")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.createdBy")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.timestamp")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.operations")}</th>
                </tr>
              </thead>

              
              <tbody className="bg-base-100">
                {Array.isArray(displayOrder) && displayOrder.length > 0 ? (
           
                  displayOrder.map((order, index) => (
                  

                    <tr key={order?._id} className="bg-base-100">
                      <td className="px-3 py-2 border">{index + 1}</td>
                      {/* An order is a basket now, so list every line with the
                          price it was placed at. */}
                      <td className="px-3 py-2 border">
                        <div className="space-y-0.5">
                          {(order.Products || []).map((line, i) => (
                            <div key={i} className="whitespace-nowrap text-sm">
                              {line.product?.name || "—"}
                              <span className="ml-1 text-base-content/50">
                                {line.quantity} × ${Number(line.price || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 border text-center">
                        {(order.Products || []).reduce(
                          (sum, line) => sum + Number(line.quantity || 0),
                          0
                        )}
                      </td>
                      <td className="px-3 py-2 border">{order?.Description}</td>
                 
                      <td className="px-3 py-2 border">{order?.totalAmount}</td>
                      <td className="px-3 py-2 border">{order?.supplierName || "—"}</td>
                      <td className="px-3 py-2 border">{order.user?.name}</td>
                      <td className="px-3 py-2 border">
                        <FormattedTime timestamp={order?.createdAt} />
                      </td>
                      <td className="min-w-[190px] px-4 py-2 border">
                        <div className="flex flex-col gap-2">
                          {/* Deliberate send — nothing reaches the supplier until
                              this is pressed. Shows "Sent" once it has gone. */}
                          {order.emailSentAt ? (
                            <span className="rounded-md bg-green-100 px-2 py-1 text-center text-xs font-semibold text-green-700">
                              {t("orders.emailed")}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSend(order)}
                              disabled={!order.supplierEmail}
                              title={!order.supplierEmail ? t("orders.noEmail") : ""}
                              className="h-9 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
                            >
                              {t("orders.sendToSupplier")}
                            </button>
                          )}
                          {/* Goods arrival: inventory is only touched here. Once
                              confirmed, the ordered quantities are added to stock. */}
                          {order.receivedAt ? (
                            <span
                              className="rounded-md bg-emerald-100 px-2 py-1 text-center text-xs font-semibold text-emerald-700"
                              title={order.receivedByName || ""}
                            >
                              {t("orders.received")}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleReceive(order)}
                              title={t("orders.markReceivedHint")}
                              className="h-9 whitespace-nowrap rounded-md border-2 border-emerald-600 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                            >
                              {t("orders.markReceived")}
                            </button>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditClick(order)}
                              className="h-9 flex-1 rounded-md bg-green-500 text-sm text-white hover:bg-green-700"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              onClick={() => handleremove(order._id)}
                              className="h-9 flex-1 rounded-md bg-red-500 text-sm text-white hover:bg-red-700"
                            >
                              {t("common.remove")}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="bg-base-100 text-center py-4">
                      {t("orders.noOrder")}
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

export default Orderpage;
