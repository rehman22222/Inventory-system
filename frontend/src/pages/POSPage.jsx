import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiCreditCard,
  FiImage,
  FiMinus,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiShoppingBag,
  FiTrash2,
} from "react-icons/fi";
import TopNavbar from "../Components/TopNavbar";
import axiosInstance from "../lib/axios";
import useBarcodeScanner from "../lib/useBarcodeScanner";
import { gettingallproducts } from "../features/productSlice";

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "creditcard" },
  { label: "Bank", value: "banktransfer" },
  { label: "Easypaisa", value: "easypaisa" },
  { label: "JazzCash", value: "jazzcash" },
];

function POSPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const barcodeRef = useRef(null);
  const { getallproduct } = useSelector((state) => state.product);
  const { Authuser } = useSelector((state) => state.auth);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    dispatch(gettingallproducts());
  }, [dispatch]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const products = useMemo(
    () => (Array.isArray(getallproduct) ? getallproduct : []),
    [getallproduct]
  );

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products;
    return products.filter((product) => {
      const categoryName = product.Category?.name || "";
      return (
        product.name?.toLowerCase().includes(value) ||
        product.Desciption?.toLowerCase().includes(value) ||
        product.barcode?.toLowerCase().includes(value) ||
        categoryName.toLowerCase().includes(value)
      );
    });
  }, [products, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const safeDiscount = Math.min(Number(discount || 0), subtotal);
  const taxRate = 0.08;
  const tax = taxEnabled ? (subtotal - safeDiscount) * taxRate : 0;
  const total = subtotal - safeDiscount + tax;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = (product) => {
    if (Number(product.quantity) <= 0) {
      toast.error("This product is out of stock");
      return;
    }
    setReceipt(null);
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.productId === product._id);
      if (existingItem) {
        if (existingItem.quantity >= Number(product.quantity)) {
          toast.error(`Only ${product.quantity} items available in stock`);
          return currentCart;
        }
        return currentCart.map((item) =>
          item.productId === product._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...currentCart,
        {
          productId: product._id,
          barcode: product.barcode,
          name: product.name,
          category: product.Category?.name || "Uncategorized",
          price: Number(product.Price || 0),
          quantity: 1,
          stock: Number(product.quantity || 0),
        },
      ];
    });
  };

  // Shared lookup used by BOTH the barcode input's Enter submit and the global
  // scanner capture. Finds by barcode (or SKU if present), then adds to cart.
  const handleScanCode = (rawCode) => {
    const value = String(rawCode || "").trim();
    if (!value) return;
    const product = products.find(
      (item) => item.barcode === value || item.sku === value
    );
    if (!product) {
      toast.error(`Barcode not found: ${value}`);
      return;
    }
    addToCart(product);
    toast.success(`${product.name} added`);
  };

  const scanBarcode = (event) => {
    event.preventDefault();
    handleScanCode(barcode);
    setBarcode("");
    barcodeRef.current?.focus();
  };

  // Global scanner capture — active only on the Staff POS route. Works even when
  // the barcode input isn't focused; ignores typing in any editable field.
  const scannerEnabled = location.pathname
    .toLowerCase()
    .startsWith("/staffdashboard/pos");

  useBarcodeScanner(
    (code) => {
      handleScanCode(code);
      // Return focus to the barcode input so subsequent manual scans stay fast.
      barcodeRef.current?.focus();
    },
    { enabled: scannerEnabled }
  );

  const updateQuantity = (productId, nextQuantity) => {
    setReceipt(null);
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.productId !== productId) return item;
          const safeQuantity = Math.max(0, Math.min(nextQuantity, item.stock));
          if (nextQuantity > item.stock) toast.error(`Only ${item.stock} items available`);
          return { ...item, quantity: safeQuantity };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setReceipt(null);
    setCart((currentCart) => currentCart.filter((item) => item.productId !== productId));
  };

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error("Add at least one product to the cart");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setIsCheckingOut(true);
    try {
      const response = await axiosInstance.post("pos/checkout", {
        customerName: customerName.trim(),
        cashierId: Authuser?.id || Authuser?._id,
        cashierName: Authuser?.name || "Demo Cashier",
        paymentMethod,
        discount: safeDiscount,
        taxEnabled,
        taxRate,
        items: cart.map((item) => ({
          product: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      });
      setReceipt(response.data.receipt);
      toast.success(`Receipt ${response.data.receipt.receiptNo} completed`);
      setCart([]);
      setCustomerName("Walk-in Customer");
      setDiscount(0);
      setTaxEnabled(false);
      dispatch(gettingallproducts());
      barcodeRef.current?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to complete checkout");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const printReceipt = () => {
    if (!receipt) {
      toast.error("Complete a sale first to print receipt");
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-base-200">
      <TopNavbar />

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 xl:grid-cols-[1fr_430px]">
        {/* Left — product catalog */}
        <section>
          {/* Hero banner — always dark by design */}
          <div className="mb-6 rounded-xl bg-slate-950 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  Point of Sale
                </p>
                <h1 className="mt-3 text-3xl font-bold">Professional checkout counter</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Scan barcode, validate stock, complete payment, generate receipt, and update
                  stock.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-slate-300">Cart items</p>
                  <p className="mt-1 text-2xl font-bold">{totalItems}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-slate-300">Payable</p>
                  <p className="mt-1 text-2xl font-bold">${total.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Barcode scanner */}
          <form
            onSubmit={scanBarcode}
            className="mb-4 flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm focus-within:border-cyan-500 transition"
          >
            <FiShoppingBag className="shrink-0 text-cyan-600 dark:text-cyan-400" />
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              className="h-10 flex-1 bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/40"
              placeholder="Barcode scanner input, example: 6291107451234"
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 transition"
            >
              Add
            </button>
          </form>

          {/* Product search */}
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm focus-within:border-cyan-500 transition">
            <FiSearch className="shrink-0 text-base-content/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 flex-1 bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/40"
              placeholder="Search product name, barcode, category, or description"
            />
          </div>

          {/* Product grid */}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const stock = Number(product.quantity || 0);
              const isLowStock = stock <= 10;

              return (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-xl border border-base-300 bg-base-100 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-500 hover:shadow-md"
                >
                  {/* Product image (with placeholder fallback) */}
                  <div className="mb-4 h-28 w-full overflow-hidden rounded-lg bg-base-200">
                    {product.image?.url ? (
                      <img
                        src={product.image.url}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base-content/30">
                        <FiImage className="text-3xl" />
                      </div>
                    )}
                  </div>

                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-base-content">{product.name}</h2>
                      <p className="mt-1 text-sm text-base-content/60">
                        {product.Category?.name || "Uncategorized"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isLowStock
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}
                    >
                      {stock} in stock
                    </span>
                  </div>

                  <p className="line-clamp-2 min-h-10 text-sm text-base-content/60">
                    {product.Desciption}
                  </p>
                  <p className="mt-3 text-xs font-medium text-base-content/40">
                    Barcode: {product.barcode || "Not set"}
                  </p>

                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-2xl font-bold text-base-content">
                      ${Number(product.Price || 0).toFixed(2)}
                    </p>
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400">
                      <FiPlus />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right — receipt panel */}
        <aside className="rounded-xl border border-base-300 bg-base-100 shadow-sm xl:sticky xl:top-6 xl:self-start">
          <div className="border-b border-base-300 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-base-content/50">
                  Current Sale
                </p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">
                  {receipt ? receipt.receiptNo : "Receipt"}
                </h2>
              </div>
              <FiShoppingBag className="text-2xl text-cyan-600 dark:text-cyan-400" />
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* Customer */}
            <div>
              <label className="mb-2 block text-sm font-medium text-base-content/80">
                Customer
              </label>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className="h-11 w-full rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-base-content outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition"
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="mb-2 block text-sm font-medium text-base-content/80">
                Payment method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                      paymentMethod === method.value
                        ? "border-cyan-600 bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-500"
                        : "border-base-300 text-base-content/70 hover:border-base-content/30 hover:bg-base-200"
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cart / Receipt */}
            <div className="max-h-[310px] space-y-3 overflow-y-auto pr-1">
              {cart.length > 0 ? (
                cart.map((item) => (
                  <div
                    key={item.productId}
                    className="rounded-lg border border-base-300 bg-base-200 p-3"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-base-content">{item.name}</p>
                        <p className="text-xs text-base-content/50">
                          {item.barcode || item.category}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId)}
                        className="rounded-lg p-2 text-base-content/40 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        aria-label="Remove item"
                      >
                        <FiTrash2 />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-base-300 bg-base-100">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="flex h-9 w-9 items-center justify-center text-base-content/50 hover:bg-base-200 transition rounded-l-lg"
                          aria-label="Decrease quantity"
                        >
                          <FiMinus />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold text-base-content">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="flex h-9 w-9 items-center justify-center text-base-content/50 hover:bg-base-200 transition rounded-r-lg"
                          aria-label="Increase quantity"
                        >
                          <FiPlus />
                        </button>
                      </div>
                      <p className="font-semibold text-base-content">
                        ${(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))
              ) : receipt ? (
                <div
                  className="rounded-lg border border-base-300 bg-base-100 p-4 text-sm"
                  id="receipt"
                >
                  <div className="mb-4 text-center">
                    <p className="text-lg font-bold text-base-content">Inventory POS</p>
                    <p className="text-xs text-base-content/50">Receipt No: {receipt.receiptNo}</p>
                    <p className="text-xs text-base-content/50">
                      {new Date(receipt.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="mb-3 space-y-1 text-xs text-base-content/70">
                    <p>Cashier: {receipt.cashierName}</p>
                    <p>Customer: {receipt.customerName}</p>
                    <p>Payment: {receipt.paymentMethod}</p>
                  </div>
                  <div className="space-y-2 border-y border-base-300 py-3 text-base-content">
                    {receipt.items.map((item) => (
                      <div
                        key={`${receipt.receiptNo}-${item.product}`}
                        className="flex justify-between gap-3"
                      >
                        <span>
                          {item.name} x {item.quantity}
                        </span>
                        <span>${item.lineTotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-xs text-base-content/50">
                    Age verification completed where required. Thank you!
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-base-200 p-6 text-center">
                  <FiShoppingBag className="mx-auto mb-3 text-3xl text-base-content/30" />
                  <p className="font-medium text-base-content/70">Cart is empty</p>
                  <p className="mt-1 text-sm text-base-content/50">
                    Scan barcode or select products.
                  </p>
                </div>
              )}
            </div>

            {/* Discount + Tax */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-base-content/80">
                  Discount
                </label>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  className="h-10 w-full rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-base-content outline-none focus:border-cyan-500 transition"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-base-content/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(event) => setTaxEnabled(event.target.checked)}
                  className="h-4 w-4"
                />
                Tax 8%
              </label>
            </div>

            {/* Totals */}
            <div className="space-y-3 rounded-xl bg-base-200 p-4 text-sm">
              <div className="flex justify-between text-base-content/70">
                <span>Subtotal</span>
                <span>${(receipt?.subtotal ?? subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base-content/70">
                <span>Discount</span>
                <span>-${(receipt?.discount ?? safeDiscount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base-content/70">
                <span>Tax</span>
                <span>${(receipt?.tax ?? tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-base-300 pt-3 text-lg font-bold text-base-content">
                <span>Total</span>
                <span>${(receipt?.total ?? total).toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <button
                type="button"
                onClick={checkout}
                disabled={isCheckingOut || cart.length === 0}
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-cyan-700 font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-base-300 disabled:text-base-content/40"
              >
                <FiCreditCard />
                {isCheckingOut ? "Processing…" : "Complete Sale"}
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className="flex h-12 w-12 items-center justify-center rounded-lg border border-base-300 text-base-content/60 transition hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                aria-label="Print receipt"
              >
                <FiPrinter />
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default POSPage;
