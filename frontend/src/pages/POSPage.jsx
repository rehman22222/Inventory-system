import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiClock,
  FiCreditCard,
  FiImage,
  FiLogOut,
  FiMinus,
  FiPause,
  FiPlus,
  FiPlusCircle,
  FiPrinter,
  FiSearch,
  FiShoppingBag,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import axiosInstance from "../lib/axios";
import useBarcodeScanner from "../lib/useBarcodeScanner";
import ThemeToggle from "../lib/ThemeToggle";
import LanguageSwitcher from "../Components/LanguageSwitcher";
import { gettingallproducts } from "../features/productSlice";
import e360Logo from "../images/e360-logo.png";
import e360LogoWhite from "../images/e360-logo-white.png";

const dashboardByRole = {
  admin: "/AdminDashboard",
  manager: "/ManagerDashboard",
  staff: "/StaffDashboard",
};

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "creditcard" },
  { label: "Bank", value: "banktransfer" },
  { label: "Easypaisa", value: "easypaisa" },
  { label: "JazzCash", value: "jazzcash" },
];

const HELD_KEY = "pos_held_sales";
const TAX_RATE = 0.08;

function POSPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const location = useLocation();
  const barcodeRef = useRef(null);
  const { getallproduct } = useSelector((state) => state.product);
  const { Authuser } = useSelector((state) => state.auth);
  const dashboardPath = dashboardByRole[Authuser?.role] || "/StaffDashboard";
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState(t("pos.walkIn"));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState("amount"); // "amount" | "percent"
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [amountTendered, setAmountTendered] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [heldSales, setHeldSales] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HELD_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [showHeld, setShowHeld] = useState(false);

  useEffect(() => {
    dispatch(gettingallproducts());
  }, [dispatch]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // Persist held sales so a resumed shift keeps parked transactions.
  useEffect(() => {
    localStorage.setItem(HELD_KEY, JSON.stringify(heldSales));
  }, [heldSales]);

  const products = useMemo(
    () => (Array.isArray(getallproduct) ? getallproduct : []),
    [getallproduct]
  );

  // Category tabs, built from whatever categories the catalog contains.
  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const c = p.Category;
      if (c?._id) map.set(c._id, c.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "all" && product.Category?._id !== category) return false;
      if (!value) return true;
      const categoryName = product.Category?.name || "";
      return (
        product.name?.toLowerCase().includes(value) ||
        product.Desciption?.toLowerCase().includes(value) ||
        product.barcode?.toLowerCase().includes(value) ||
        categoryName.toLowerCase().includes(value)
      );
    });
  }, [products, query, category]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const rawDiscount =
    discountType === "percent"
      ? (subtotal * Number(discount || 0)) / 100
      : Number(discount || 0);
  const safeDiscount = Math.min(Math.max(rawDiscount, 0), subtotal);
  const tax = taxEnabled ? (subtotal - safeDiscount) * TAX_RATE : 0;
  const total = subtotal - safeDiscount + tax;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const isCash = paymentMethod === "cash";
  const tendered = Number(amountTendered || 0);
  const changeDue = Math.max(0, tendered - total);
  const cashShort = isCash && tendered < total;

  // Quick-cash buttons: exact amount plus the nearest common notes above it.
  const quickCash = useMemo(() => {
    if (total <= 0) return [];
    const set = new Set([Math.ceil(total)]);
    [5, 10, 20, 50, 100, 500, 1000].forEach((note) => {
      const v = Math.ceil(total / note) * note;
      if (v >= total) set.add(v);
    });
    return Array.from(set)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }, [total]);

  const addToCart = (product) => {
    if (Number(product.quantity) <= 0) {
      toast.error(t("pos.outOfStock"));
      return;
    }
    setReceipt(null);
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.productId === product._id);
      if (existingItem) {
        if (existingItem.quantity >= Number(product.quantity)) {
          toast.error(t("pos.onlyAvailableStock", { count: product.quantity }));
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
          category: product.Category?.name || t("pos.uncategorized"),
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
      toast.error(t("pos.barcodeNotFound", { code: value }));
      return;
    }
    addToCart(product);
    toast.success(t("pos.productAdded", { name: product.name }));
  };

  const scanBarcode = (event) => {
    event.preventDefault();
    handleScanCode(barcode);
    setBarcode("");
    barcodeRef.current?.focus();
  };

  // Global scanner capture — active only on the standalone POS terminal. Works
  // even when the barcode input isn't focused; ignores typing in any editable field.
  const scannerEnabled = location.pathname.toLowerCase().startsWith("/pos");

  useBarcodeScanner(
    (code) => {
      handleScanCode(code);
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
          if (nextQuantity > item.stock) toast.error(t("pos.onlyAvailable", { count: item.stock }));
          return { ...item, quantity: safeQuantity };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) => {
    setReceipt(null);
    setCart((currentCart) => currentCart.filter((item) => item.productId !== productId));
  };

  const resetSale = () => {
    setCart([]);
    setCustomerName(t("pos.walkIn"));
    setDiscount(0);
    setDiscountType("amount");
    setTaxEnabled(false);
    setAmountTendered("");
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setReceipt(null);
    resetSale();
    toast.success(t("pos.cartCleared"));
  };

  const newSale = () => {
    setReceipt(null);
    resetSale();
    barcodeRef.current?.focus();
  };

  // Park the current sale so the cashier can start a fresh one and resume later.
  const holdSale = () => {
    if (cart.length === 0) {
      toast.error(t("pos.holdEmpty"));
      return;
    }
    const parked = {
      id: Date.now(),
      customerName,
      cart,
      discount,
      discountType,
      taxEnabled,
      paymentMethod,
      at: new Date().toISOString(),
    };
    setHeldSales((prev) => [parked, ...prev]);
    setReceipt(null);
    resetSale();
    toast.success(t("pos.saleHeld"));
    barcodeRef.current?.focus();
  };

  const resumeSale = (id) => {
    const sale = heldSales.find((s) => s.id === id);
    if (!sale) return;
    setReceipt(null);
    setCart(sale.cart);
    setCustomerName(sale.customerName);
    setDiscount(sale.discount);
    setDiscountType(sale.discountType || "amount");
    setTaxEnabled(sale.taxEnabled);
    setPaymentMethod(sale.paymentMethod || "cash");
    setAmountTendered("");
    setHeldSales((prev) => prev.filter((s) => s.id !== id));
    setShowHeld(false);
    barcodeRef.current?.focus();
  };

  const deleteHeld = (id) => setHeldSales((prev) => prev.filter((s) => s.id !== id));

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error(t("pos.addOneProduct"));
      return;
    }
    if (!customerName.trim()) {
      toast.error(t("pos.customerRequired"));
      return;
    }
    if (cashShort) {
      toast.error(t("pos.insufficientCash"));
      return;
    }
    setIsCheckingOut(true);
    try {
      const response = await axiosInstance.post("pos/checkout", {
        customerName: customerName.trim(),
        cashierId: Authuser?.id || Authuser?._id,
        cashierName: Authuser?.name || t("pos.demoCashier"),
        paymentMethod,
        discount: safeDiscount,
        taxEnabled,
        taxRate: TAX_RATE,
        items: cart.map((item) => ({
          product: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
      });
      // Keep tender/change on the receipt for the printed record.
      setReceipt({
        ...response.data.receipt,
        amountTendered: isCash ? tendered : undefined,
        changeDue: isCash ? changeDue : undefined,
      });
      toast.success(t("pos.receiptCompleted", { no: response.data.receipt.receiptNo }));
      setCart([]);
      setCustomerName(t("pos.walkIn"));
      setDiscount(0);
      setDiscountType("amount");
      setTaxEnabled(false);
      setAmountTendered("");
      dispatch(gettingallproducts());
      barcodeRef.current?.focus();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.checkoutFail"));
    } finally {
      setIsCheckingOut(false);
    }
  };

  const printReceipt = () => {
    if (!receipt) {
      toast.error(t("pos.printFirst"));
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Dedicated full-screen POS terminal header (no dashboard sidebar) */}
      <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src={e360Logo} className="h-9 w-auto object-contain dark:hidden" alt="E360" />
            <img src={e360LogoWhite} className="hidden h-9 w-auto object-contain dark:block" alt="E360" />
            <div className="hidden border-l border-base-300 pl-3 sm:block">
              <p className="text-sm font-semibold text-base-content">{t("pos.title")}</p>
              <p className="text-xs capitalize text-base-content/60">
                {Authuser?.name || t("pos.demoCashier")}
                {Authuser?.role ? ` · ${Authuser.role}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher tone="auto" />
            <ThemeToggle />
            <Link
              to={dashboardPath}
              className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 text-sm font-semibold text-base-content/70 transition hover:border-red-400 hover:text-red-500"
            >
              <FiLogOut />
              <span className="hidden sm:inline">{t("pos.exit")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="grid w-full gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:grid-cols-[1fr_440px]">
        {/* Left — product catalog */}
        <section>
          {/* Hero banner — always dark by design */}
          <div className="mb-6 rounded-xl bg-slate-950 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  {t("pos.title")}
                </p>
                <h1 className="mt-3 text-3xl font-bold">{t("pos.heading")}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  {t("pos.sub")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-slate-300">{t("pos.cartItems")}</p>
                  <p className="mt-1 text-2xl font-bold">{totalItems}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-slate-300">{t("pos.payable")}</p>
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
              placeholder={t("pos.barcodePlaceholder")}
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 transition"
            >
              {t("pos.add")}
            </button>
          </form>

          {/* Product search */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm focus-within:border-cyan-500 transition">
            <FiSearch className="shrink-0 text-base-content/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 flex-1 bg-transparent text-sm outline-none text-base-content placeholder:text-base-content/40"
              placeholder={t("pos.searchPlaceholder")}
            />
          </div>

          {/* Category filter tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                category === "all"
                  ? "border-cyan-600 bg-cyan-600 text-white"
                  : "border-base-300 bg-base-100 text-base-content/70 hover:border-cyan-500"
              }`}
            >
              {t("pos.categoryAll")}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  category === c.id
                    ? "border-cyan-600 bg-cyan-600 text-white"
                    : "border-base-300 bg-base-100 text-base-content/70 hover:border-cyan-500"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                        {product.Category?.name || t("pos.uncategorized")}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isLowStock
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      }`}
                    >
                      {t("pos.inStock", { count: stock })}
                    </span>
                  </div>

                  <p className="line-clamp-2 min-h-10 text-sm text-base-content/60">
                    {product.Desciption}
                  </p>
                  <p className="mt-3 text-xs font-medium text-base-content/40">
                    {t("pos.barcodeLabel", { code: product.barcode || t("pos.notSet") })}
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
        <aside className="rounded-xl border border-base-300 bg-base-100 shadow-sm xl:sticky xl:top-24 xl:self-start">
          <div className="border-b border-base-300 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-base-content/50">
                  {t("pos.currentSale")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">
                  {receipt ? receipt.receiptNo : t("pos.receipt")}
                </h2>
              </div>
              <FiShoppingBag className="text-2xl text-cyan-600 dark:text-cyan-400" />
            </div>

            {/* Sale actions: hold, held list, clear */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={holdSale}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-base-300 py-2 text-xs font-semibold text-base-content/70 transition hover:border-cyan-500 hover:text-cyan-600"
              >
                <FiPause /> {t("pos.hold")}
              </button>
              <button
                type="button"
                onClick={() => setShowHeld(true)}
                className="relative flex items-center justify-center gap-1.5 rounded-lg border border-base-300 py-2 text-xs font-semibold text-base-content/70 transition hover:border-cyan-500 hover:text-cyan-600"
              >
                <FiClock /> {t("pos.heldSales")}
                {heldSales.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] font-bold text-white">
                    {heldSales.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={clearCart}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-base-300 py-2 text-xs font-semibold text-base-content/70 transition hover:border-red-400 hover:text-red-500"
              >
                <FiX /> {t("pos.clear")}
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* Customer */}
            <div>
              <label className="mb-2 block text-sm font-medium text-base-content/80">
                {t("pos.customer")}
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
                {t("pos.paymentMethod")}
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
                    {t(`common.payments.${method.value}`, method.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* Cart / Receipt */}
            <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
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
                        aria-label={t("common.remove")}
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
                          aria-label="−"
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
                          aria-label="+"
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
                    <p className="text-lg font-bold text-base-content">{t("pos.posName")}</p>
                    <p className="text-xs text-base-content/50">{t("pos.receiptNo", { no: receipt.receiptNo })}</p>
                    <p className="text-xs text-base-content/50">
                      {new Date(receipt.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="mb-3 space-y-1 text-xs text-base-content/70">
                    <p>{t("pos.cashier", { name: receipt.cashierName })}</p>
                    <p>{t("pos.customerLine", { name: receipt.customerName })}</p>
                    <p>{t("pos.paymentLine", { method: t(`common.payments.${receipt.paymentMethod}`, receipt.paymentMethod) })}</p>
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
                  {receipt.amountTendered !== undefined && (
                    <div className="mt-3 space-y-1 text-xs text-base-content/70">
                      <div className="flex justify-between">
                        <span>{t("pos.amountTendered")}</span>
                        <span>${Number(receipt.amountTendered).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("pos.changeDue")}</span>
                        <span>${Number(receipt.changeDue).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-center text-xs text-base-content/50">
                    {t("pos.ageVerification")}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-base-200 p-6 text-center">
                  <FiShoppingBag className="mx-auto mb-3 text-3xl text-base-content/30" />
                  <p className="font-medium text-base-content/70">{t("pos.cartEmpty")}</p>
                  <p className="mt-1 text-sm text-base-content/50">
                    {t("pos.scanOrSelect")}
                  </p>
                </div>
              )}
            </div>

            {/* Discount (amount or %) + Tax */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-base-content/80">
                  {t("pos.discount")}
                </label>
                <div className="flex items-stretch rounded-lg border border-base-300">
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    className="h-10 w-full rounded-l-lg bg-base-100 px-3 text-sm text-base-content outline-none focus:border-cyan-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDiscountType((v) => (v === "amount" ? "percent" : "amount"))
                    }
                    className="w-10 shrink-0 rounded-r-lg border-l border-base-300 bg-base-200 text-sm font-bold text-base-content/70 transition hover:bg-base-300"
                    aria-label="Toggle discount type"
                  >
                    {discountType === "percent" ? "%" : "$"}
                  </button>
                </div>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-base-content/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(event) => setTaxEnabled(event.target.checked)}
                  className="h-4 w-4"
                />
                {t("pos.tax8")}
              </label>
            </div>

            {/* Totals */}
            <div className="space-y-3 rounded-xl bg-base-200 p-4 text-sm">
              <div className="flex justify-between text-base-content/70">
                <span>{t("pos.subtotal")}</span>
                <span>${(receipt?.subtotal ?? subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base-content/70">
                <span>{t("pos.discount")}</span>
                <span>-${(receipt?.discount ?? safeDiscount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base-content/70">
                <span>{t("pos.tax")}</span>
                <span>${(receipt?.tax ?? tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-base-300 pt-3 text-lg font-bold text-base-content">
                <span>{t("pos.total")}</span>
                <span>${(receipt?.total ?? total).toFixed(2)}</span>
              </div>
            </div>

            {/* Cash tendering — quick cash, amount, change due */}
            {isCash && !receipt && cart.length > 0 && (
              <div className="space-y-3 rounded-xl border border-base-300 p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAmountTendered(total.toFixed(2))}
                    className="rounded-lg border border-base-300 px-3 py-1.5 text-sm font-semibold text-base-content/70 transition hover:border-cyan-500 hover:text-cyan-600"
                  >
                    {t("pos.exact")}
                  </button>
                  {quickCash.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setAmountTendered(String(amount))}
                      className="rounded-lg border border-base-300 px-3 py-1.5 text-sm font-semibold text-base-content/70 transition hover:border-cyan-500 hover:text-cyan-600"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-base-content/80">
                    {t("pos.amountTendered")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={amountTendered}
                    onChange={(event) => setAmountTendered(event.target.value)}
                    placeholder="0.00"
                    className="h-11 w-full rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-base-content outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <div
                  className={`flex justify-between rounded-lg p-3 text-sm font-semibold ${
                    cashShort
                      ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                  }`}
                >
                  <span>{cashShort ? t("pos.balanceDue") : t("pos.changeDue")}</span>
                  <span>
                    ${(cashShort ? total - tendered : changeDue).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            {receipt ? (
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <button
                  type="button"
                  onClick={newSale}
                  className="flex h-12 items-center justify-center gap-2 rounded-lg bg-cyan-700 font-semibold text-white transition hover:bg-cyan-600"
                >
                  <FiPlusCircle />
                  {t("pos.newSale")}
                </button>
                <button
                  type="button"
                  onClick={printReceipt}
                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-base-300 text-base-content/60 transition hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                  aria-label={t("pos.print")}
                >
                  <FiPrinter />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <button
                  type="button"
                  onClick={checkout}
                  disabled={isCheckingOut || cart.length === 0 || cashShort}
                  className="flex h-12 items-center justify-center gap-2 rounded-lg bg-cyan-700 font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-base-300 disabled:text-base-content/40"
                >
                  <FiCreditCard />
                  {isCheckingOut ? t("pos.processing") : t("pos.completeSale")}
                </button>
                <button
                  type="button"
                  onClick={printReceipt}
                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-base-300 text-base-content/60 transition hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400"
                  aria-label={t("pos.print")}
                >
                  <FiPrinter />
                </button>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Held sales overlay */}
      {showHeld && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowHeld(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-base-300 p-5">
              <h2 className="text-lg font-semibold text-base-content">{t("pos.heldSales")}</h2>
              <button
                type="button"
                onClick={() => setShowHeld(false)}
                className="rounded-lg p-2 text-base-content/50 transition hover:bg-base-200"
                aria-label={t("common.close")}
              >
                <FiX />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {heldSales.length > 0 ? (
                heldSales.map((sale) => {
                  const items = sale.cart.reduce((s, i) => s + i.quantity, 0);
                  const amount = sale.cart.reduce((s, i) => s + i.price * i.quantity, 0);
                  return (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-base-300 bg-base-200 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-base-content">
                          {sale.customerName}
                        </p>
                        <p className="text-xs text-base-content/50">
                          {t("pos.itemsCount", { count: items })} · ${amount.toFixed(2)} ·{" "}
                          {new Date(sale.at).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => resumeSale(sale.id)}
                          className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600"
                        >
                          {t("pos.resume")}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHeld(sale.id)}
                          className="rounded-lg border border-base-300 p-2 text-base-content/50 transition hover:border-red-400 hover:text-red-500"
                          aria-label={t("common.delete")}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-6 text-center text-sm text-base-content/50">{t("pos.noHeld")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default POSPage;
