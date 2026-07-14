import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiClock,
  FiHash,
  FiImage,
  FiLogOut,
  FiPause,
  FiPercent,
  FiPlay,
  FiRotateCcw,
  FiSearch,
  FiSlash,
  FiTag,
} from "react-icons/fi";
import axiosInstance from "../lib/axios";
import useBarcodeScanner from "../lib/useBarcodeScanner";
import LanguageSwitcher from "../Components/LanguageSwitcher";
import { gettingallproducts } from "../features/productSlice";
import { gettingallCategory } from "../features/categorySlice";
import ActionRail from "../Components/pos/ActionRail";
import SaleTable from "../Components/pos/SaleTable";
import CategoryTiles from "../Components/pos/CategoryTiles";
import NumericKeypad from "../Components/pos/NumericKeypad";
import StatusBar from "../Components/pos/StatusBar";
import RefundModal from "../Components/pos/RefundModal";
import VoucherModal from "../Components/pos/VoucherModal";
import DiscountModal from "../Components/pos/DiscountModal";
import UnknownBarcodeModal from "../Components/pos/UnknownBarcodeModal";
import SaleHistoryModal from "../Components/pos/SaleHistoryModal";
import HeldSalesModal from "../Components/pos/HeldSalesModal";
import PaymentModal from "../Components/pos/PaymentModal";
import {
  CURRENCIES,
  currency,
  initCurrency,
  setCurrencyCode,
} from "../Components/pos/posUtils";
import e360LogoDark from "../images/e360-logo-dark.png";

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

const TILL = "TERMINAL-MAIN";
const TAX_RATE_KEY = "pos_tax_rate";

function POSPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const location = useLocation();
  const searchRef = useRef(null);

  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { Authuser } = useSelector((state) => state.auth);

  const role = Authuser?.role;
  const isElevated = role === "admin" || role === "manager";
  const dashboardPath = dashboardByRole[role] || "/StaffDashboard";

  const [query, setQuery] = useState("");
  // No "All" tile — the till always has one category open. It defaults to the
  // first one once the list loads.
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);

  const [customerName, setCustomerName] = useState(t("pos.walkIn"));
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState("amount");
  const [voucher, setVoucher] = useState(null);
  const [taxEnabled, setTaxEnabled] = useState(false);
  // The tax rate is the shop's call, not ours — no hardcoded percentage. The
  // last rate the cashier used is remembered on this till.
  const [taxRate, setTaxRate] = useState(() => localStorage.getItem(TAX_RATE_KEY) || "");

  const [receipt, setReceipt] = useState(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Keypad: digits accumulate in `buffer`; "X" turns the buffer into a pending
  // quantity that the next tapped product picks up (3 X → tap Coke = 3 Coke).
  const [buffer, setBuffer] = useState("");
  const [multiplier, setMultiplier] = useState(0);

  // Below lg there isn't room for the sale panel and the product grid at once,
  // so the two become tabs. On a real till (lg+) both are always visible.
  const [pane, setPane] = useState("products"); // "sale" | "products"

  // Display currency. Held in state purely so a change re-renders the whole
  // terminal — the value itself lives in posUtils/localStorage.
  const [currencyCode, setCurrency] = useState(() => initCurrency(i18n.language));

  const [modal, setModal] = useState(null); // refund | voucher | discount | history | held | code
  const [unknownBarcode, setUnknownBarcode] = useState(null);
  const [refundReceiptNo, setRefundReceiptNo] = useState("");

  useEffect(() => {
    dispatch(gettingallproducts());
    dispatch(gettingallCategory());
  }, [dispatch]);

  // The terminal is a dark-only surface — a bright till is unusable under shop
  // lighting, and the panels are painted in fixed dark tones. Force dark while
  // POS is open and hand the user's own theme back when they leave.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");

    root.setAttribute("data-theme", "dark");

    return () => {
      if (previous) root.setAttribute("data-theme", previous);
      else root.removeAttribute("data-theme");
    };
  }, []);

  const products = useMemo(
    () => (Array.isArray(getallproduct) ? getallproduct : []),
    [getallproduct]
  );

  const categories = useMemo(
    () => (Array.isArray(getallCategory) ? getallCategory : []),
    [getallCategory]
  );

  // Open the first category as soon as the list arrives.
  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0]._id);
  }, [categories, category]);

  const searching = query.trim().length > 0;

  const activeCategoryName = searching
    ? t("pos.searchResults")
    : categories.find((entry) => entry._id === category)?.name || t("pos.uncategorized");

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();

    // A search looks across the whole catalogue — the cashier shouldn't have to
    // guess which category an item sits in.
    if (value) {
      return products.filter(
        (product) =>
          product.name?.toLowerCase().includes(value) ||
          product.Desciption?.toLowerCase().includes(value) ||
          product.barcode?.toLowerCase().includes(value)
      );
    }

    return products.filter((product) => product.Category?._id === category);
  }, [products, query, category]);

  // --- Money. The server recomputes all of this at checkout; these values only
  // drive what the cashier sees.
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Recompute the voucher against the LIVE subtotal. Freezing the amount from
  // when it was applied goes stale the moment the cart changes, and the server
  // (which always recomputes) would then reject the sale as short-paid.
  const voucherDiscount = voucher
    ? Math.min(
        voucher.type === "percent" ? (subtotal * Number(voucher.value)) / 100 : Number(voucher.value),
        subtotal
      )
    : 0;
  const afterVoucher = Math.max(subtotal - voucherDiscount, 0);
  const rawManual =
    discountType === "percent" ? (afterVoucher * Number(discount || 0)) / 100 : Number(discount || 0);
  const manualDiscount = Math.max(0, Math.min(rawManual, afterVoucher));
  const totalDiscount = voucherDiscount + manualDiscount;
  const taxable = Math.max(subtotal - totalDiscount, 0);
  const taxFraction = Math.max(0, Number(taxRate || 0)) / 100;
  const tax = taxEnabled ? taxable * taxFraction : 0;
  const total = taxable + tax;

  const addToCart = useCallback(
    (product, quantity = 1) => {
      const stock = Number(product.quantity || 0);

      if (stock <= 0) {
        toast.error(t("pos.outOfStock", { name: product.name }));
        return;
      }

      setReceipt(null);
      setCart((current) => {
        const existing = current.find((item) => item.productId === product._id);
        const wanted = (existing?.quantity || 0) + quantity;

        if (wanted > stock) {
          toast.error(t("pos.onlyAvailableStock", { count: stock }));
          return existing
            ? current.map((item) =>
                item.productId === product._id ? { ...item, quantity: stock } : item
              )
            : [
                ...current,
                {
                  productId: product._id,
                  barcode: product.barcode,
                  name: product.name,
                  category: product.Category?.name,
                  price: Number(product.Price || 0),
                  quantity: stock,
                  stock,
                },
              ];
        }

        if (existing) {
          return current.map((item) =>
            item.productId === product._id ? { ...item, quantity: wanted } : item
          );
        }

        return [
          ...current,
          {
            productId: product._id,
            barcode: product.barcode,
            name: product.name,
            category: product.Category?.name,
            price: Number(product.Price || 0),
            quantity,
            stock,
          },
        ];
      });

      setSelectedLine(product._id);
    },
    [t]
  );

  const tapProduct = (product) => {
    const quantity = multiplier > 0 ? multiplier : 1;
    addToCart(product, quantity);
    setMultiplier(0);
    setBuffer("");
  };

  // Every scan: try the loaded catalogue, then the server (the list may be
  // stale), and if the code is genuinely unknown, offer to learn it.
  const handleScanCode = useCallback(
    async (rawCode) => {
      const code = String(rawCode || "").trim();
      if (!code) return;

      const local = products.find(
        (product) => product.barcode === code || product.sku === code
      );

      if (local) {
        addToCart(local, multiplier > 0 ? multiplier : 1);
        setMultiplier(0);
        setBuffer("");
        toast.success(t("pos.productAdded", { name: local.name }));
        return;
      }

      try {
        const response = await axiosInstance.get(`product/barcode/${encodeURIComponent(code)}`);
        addToCart(response.data.product, multiplier > 0 ? multiplier : 1);
        setMultiplier(0);
        setBuffer("");
        toast.success(t("pos.productAdded", { name: response.data.product.name }));
      } catch (error) {
        if (error.response?.status === 404) {
          setUnknownBarcode(code);
        } else {
          toast.error(error.response?.data?.message || t("pos.barcodeNotFound"));
        }
      }
    },
    [products, addToCart, multiplier, t]
  );

  const scannerEnabled = location.pathname.toLowerCase().startsWith("/pos");
  useBarcodeScanner((code) => handleScanCode(code), { enabled: scannerEnabled });

  const updateQuantity = (productId, next) => {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, Math.min(next, item.stock)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (productId) =>
    setCart((current) => current.filter((item) => item.productId !== productId));

  const resetSale = () => {
    setCart([]);
    setSelectedLine(null);
    setCustomerName(t("pos.walkIn"));
    setDiscount(0);
    setDiscountType("amount");
    setVoucher(null);
    setTaxEnabled(false);
    setBuffer("");
    setMultiplier(0);
  };

  const newSale = () => {
    setReceipt(null);
    resetSale();
  };

  // --- Keypad
  const onKey = (key) => {
    if (key === "X") {
      const value = Number(buffer);
      if (value > 0) {
        setMultiplier(value);
        setBuffer("");
      }
      return;
    }
    setBuffer((current) => (current + key).slice(0, 12));
  };

  const clearKeypad = () => {
    setBuffer("");
    setMultiplier(0);
  };

  // --- Suspend / resume (server-backed)
  const holdSale = async () => {
    if (cart.length === 0) {
      toast.error(t("pos.holdEmpty"));
      return;
    }

    try {
      await axiosInstance.post("pos/hold", {
        till: TILL,
        customerName,
        items: cart.map((item) => ({
          product: item.productId,
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          price: item.price,
        })),
        discount,
        discountType,
        taxEnabled,
        voucherCode: voucher?.code,
      });
      toast.success(t("pos.saleHeld"));
      resetSale();
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.held.failed"));
    }
  };

  const resumeSale = async (held) => {
    setCart(
      held.items.map((item) => {
        const product = products.find((entry) => entry._id === String(item.product));
        return {
          productId: String(item.product),
          barcode: item.barcode,
          name: item.name,
          category: product?.Category?.name,
          price: item.price,
          quantity: item.quantity,
          stock: Number(product?.quantity ?? item.quantity),
        };
      })
    );
    setCustomerName(held.customerName || t("pos.walkIn"));
    setDiscount(held.discount || 0);
    setDiscountType(held.discountType || "amount");
    setTaxEnabled(Boolean(held.taxEnabled));
    setReceipt(null);
    setModal(null);

    try {
      await axiosInstance.delete(`pos/held/${held._id}`);
    } catch {
      // The basket is already on screen; a stale held row is not worth failing on.
    }
  };

  // --- Void: clears an in-progress sale, or reverses the receipt just printed.
  const voidSale = async () => {
    if (receipt) {
      if (!isElevated) {
        toast.error(t("pos.void.notAllowed"));
        return;
      }
      if (!window.confirm(t("pos.void.confirm", { receiptNo: receipt.receiptNo }))) return;

      try {
        await axiosInstance.post(`pos/void/${receipt.receiptNo}`);
        toast.success(t("pos.void.done", { receiptNo: receipt.receiptNo }));
        dispatch(gettingallproducts());
        newSale();
      } catch (error) {
        toast.error(error.response?.data?.message || t("pos.void.failed"));
      }
      return;
    }

    if (cart.length === 0) return;
    resetSale();
    toast.success(t("pos.cartCleared"));
  };

  // "Close Order" doesn't sell anything on its own — it opens the tender screen,
  // where the cashier records what the customer actually handed over.
  const openPayment = () => {
    if (cart.length === 0) {
      toast.error(t("pos.addOneProduct"));
      return;
    }

    if (!customerName.trim()) {
      toast.error(t("pos.customerRequired"));
      return;
    }

    setModal("payment");
  };

  const checkout = async (payments) => {
    setIsCheckingOut(true);
    try {
      const response = await axiosInstance.post("pos/checkout", {
        customerName: customerName.trim(),
        payments,
        discount: Number(discount || 0),
        discountType,
        voucherCode: voucher?.code,
        taxEnabled,
        taxRate: taxFraction,
        // Price is ignored server-side — it is read from the database.
        items: cart.map((item) => ({ product: item.productId, quantity: item.quantity })),
      });

      setReceipt(response.data.receipt);
      toast.success(t("pos.receiptCompleted"));
      setModal(null);
      // On narrow screens the receipt (with Print / New Sale) lives in the sale
      // pane — show it, or the cashier is left staring at the product grid.
      setPane("sale");
      setCart([]);
      setSelectedLine(null);
      setDiscount(0);
      setVoucher(null);
      setTaxEnabled(false);
      dispatch(gettingallproducts());
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

  const actions = [
    {
      id: "refund",
      label: "pos.rail.refund",
      tone: "rose",
      icon: FiRotateCcw,
      disabled: !isElevated,
      onClick: () => {
        setRefundReceiptNo("");
        setModal("refund");
      },
    },
    { id: "void", label: "pos.rail.void", tone: "red", icon: FiSlash, onClick: voidSale },
    { id: "suspend", label: "pos.rail.suspend", tone: "amber", icon: FiPause, onClick: holdSale },
    {
      id: "resume",
      label: "pos.rail.resume",
      tone: "emerald",
      icon: FiPlay,
      onClick: () => setModal("held"),
    },
    {
      id: "search",
      label: "pos.rail.productSearch",
      tone: "cyan",
      icon: FiSearch,
      onClick: () => searchRef.current?.focus(),
    },
    {
      id: "discount",
      label: "pos.rail.discount",
      tone: "indigo",
      icon: FiPercent,
      onClick: () => setModal("discount"),
    },
    {
      id: "vouchers",
      label: "pos.rail.vouchers",
      tone: "violet",
      icon: FiTag,
      onClick: () => setModal("voucher"),
    },
    {
      id: "history",
      label: "pos.rail.saleHistory",
      tone: "blue",
      icon: FiClock,
      onClick: () => setModal("history"),
    },
    {
      id: "code",
      label: "pos.rail.enterCode",
      tone: "slate",
      icon: FiHash,
      onClick: () => setModal("code"),
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top chrome */}
      <header className="no-print flex items-center justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <img src={e360LogoDark} alt="Eire Tech 360" className="h-6 sm:h-7" />
          <span className="hidden h-5 w-px bg-slate-700 sm:block" />
          <span className="hidden text-xs font-bold uppercase tracking-[0.22em] text-slate-500 sm:block">
            {t("pos.title")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <span className="bg-cyan-950 px-3 py-1 text-xs font-semibold text-cyan-300 ring-1 ring-cyan-800">
              {t("pos.itemsCount", { count: cart.reduce((sum, i) => sum + i.quantity, 0) })}
            </span>
          )}
          <select
            value={currencyCode}
            onChange={(event) => {
              setCurrencyCode(event.target.value);
              setCurrency(event.target.value);
            }}
            title={t("pos.currencyHint")}
            className="border border-slate-800 bg-black px-2 py-1.5 text-sm font-semibold text-slate-200 outline-none transition focus:border-cyan-600"
          >
            {CURRENCIES.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.symbol} {entry.code}
              </option>
            ))}
          </select>

          <span className="hidden sm:block">
            <LanguageSwitcher tone="auto" />
          </span>
          <Link
            to={dashboardPath}
            className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700"
          >
            <FiLogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t("pos.exit")}</span>
          </Link>
        </div>
      </header>

      <div className="no-print flex min-h-0 flex-1 flex-col lg:flex-row">
        <ActionRail actions={actions} />

        {/* Tab switcher — only where the two panes can't sit side by side. */}
        <div className="flex shrink-0 gap-1.5 border-b border-slate-800 bg-slate-950 p-1.5 lg:hidden">
          {[
            { id: "sale", label: t("pos.currentSale"), badge: cart.length },
            { id: "products", label: t("pos.rail.productSearch"), badge: 0 },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPane(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wide transition ${
                pane === tab.id
                  ? "bg-cyan-800 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="bg-black/40 px-1.5 text-[10px] tabular-nums">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Left-centre: the sale */}
        <section
          className={`${
            pane === "sale" ? "flex" : "hidden"
          } min-h-0 w-full shrink-0 flex-col border-e border-slate-800 lg:flex lg:w-[380px] xl:w-[440px]`}
        >
          <SaleTable
            cart={cart}
            selectedId={selectedLine}
            onSelect={setSelectedLine}
            onQuantityChange={updateQuantity}
            onRemove={removeFromCart}
          />

          {receipt && (
            <div className="border-t border-emerald-800 bg-emerald-900/20 px-3 py-2 text-sm">
              <span className="font-semibold text-emerald-400">
                {t("pos.receipt")} {receipt.receiptNo}
              </span>{" "}
              <span className="text-slate-300">
                {currency(receipt.total)}
                {receipt.changeDue ? ` · ${t("pos.changeDue")} ${currency(receipt.changeDue)}` : ""}
              </span>
              <button
                type="button"
                onClick={newSale}
                className="ms-3 bg-slate-800 px-3 py-1 text-xs font-semibold hover:bg-slate-700"
              >
                {t("pos.newSale")}
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className="ms-2 bg-slate-800 px-3 py-1 text-xs font-semibold hover:bg-slate-700"
              >
                {t("pos.print")}
              </button>
            </div>
          )}

          {/* Totals + tender */}
          <div className="space-y-2.5 border-t border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder={t("pos.customer")}
                className="min-w-[140px] flex-1 border border-slate-800 bg-black px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-600"
              />
              <div
                className={`flex items-center gap-2 border px-3 transition ${
                  taxEnabled
                    ? "border-cyan-700 bg-cyan-950/50 text-cyan-300"
                    : "border-slate-800 bg-black text-slate-500"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(event) => setTaxEnabled(event.target.checked)}
                    className="h-3.5 w-3.5 accent-cyan-500"
                  />
                  {t("pos.taxLabel")}
                </label>

                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  inputMode="decimal"
                  disabled={!taxEnabled}
                  value={taxRate}
                  onChange={(event) => {
                    setTaxRate(event.target.value);
                    localStorage.setItem(TAX_RATE_KEY, event.target.value);
                  }}
                  placeholder="0"
                  title={t("pos.taxRateHint")}
                  className="w-12 border border-slate-800 bg-black py-1 text-center text-xs tabular-nums text-slate-100 outline-none transition focus:border-cyan-600 disabled:opacity-40"
                />
                <span className="text-xs font-semibold">%</span>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-6 border border-slate-800 bg-black/40 px-4 py-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-8 text-slate-500">
                  <span>{t("pos.subtotal")}</span>
                  <span className="tabular-nums text-slate-300">{currency(subtotal)}</span>
                </div>
                {voucherDiscount > 0 && (
                  <div className="flex justify-between gap-8 text-emerald-400">
                    <span className="font-mono text-xs">{voucher.code}</span>
                    <span className="tabular-nums">-{currency(voucherDiscount)}</span>
                  </div>
                )}
                {manualDiscount > 0 && (
                  <div className="flex justify-between gap-8 text-slate-500">
                    <span>{t("pos.discount")}</span>
                    <span className="tabular-nums text-amber-400">
                      -{currency(manualDiscount)}
                    </span>
                  </div>
                )}
                {taxEnabled && (
                  <div className="flex justify-between gap-8 text-slate-500">
                    <span>
                      {t("pos.tax")}{" "}
                      <span className="text-xs tabular-nums">
                        ({Number(taxRate || 0)}%)
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-300">{currency(tax)}</span>
                  </div>
                )}
              </div>

              <div className="text-end">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                  {t("pos.total")}
                </p>
                <p className="font-display text-3xl font-bold tabular-nums text-cyan-400">
                  {currency(total)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.6fr] gap-2">
              <button
                type="button"
                onClick={holdSale}
                disabled={cart.length === 0}
                className="bg-slate-800 py-3 text-sm font-bold uppercase tracking-wide text-slate-200 ring-1 ring-slate-700 transition hover:bg-slate-700 active:scale-[0.99] disabled:opacity-35"
              >
                {t("pos.rail.send")}
              </button>
              <button
                type="button"
                onClick={openPayment}
                disabled={isCheckingOut || cart.length === 0}
                className="bg-gradient-to-b from-blue-600 to-blue-700 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-950/50 ring-1 ring-blue-500 transition hover:from-blue-500 hover:to-blue-600 active:scale-[0.99] disabled:opacity-35 disabled:shadow-none"
              >
                {isCheckingOut ? t("pos.processing") : t("pos.closeOrder")}
              </button>
            </div>
          </div>
        </section>

        {/* Centre: the products of the selected category */}
        <section
          className={`${
            pane === "products" ? "flex" : "hidden"
          } min-h-0 min-w-0 flex-1 flex-col gap-2.5 bg-slate-900 p-2.5 lg:flex lg:p-3`}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <FiSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("pos.searchPlaceholder")}
                className="w-full border border-slate-800 bg-black py-2.5 ps-9 pe-3 text-sm text-slate-100 outline-none transition focus:border-cyan-600"
              />
            </div>

            <div className="hidden shrink-0 items-baseline gap-2 sm:flex">
              <span className="text-sm font-bold uppercase tracking-wide text-slate-300">
                {activeCategoryName}
              </span>
              <span className="text-xs tabular-nums text-slate-600">
                {filteredProducts.length}
              </span>
            </div>
          </div>

          {/* The category column is hidden below lg, so the tiles ride along here. */}
          <div className="lg:hidden">
            <CategoryTiles
              categories={categories}
              selected={category}
              onSelect={setCategory}
              layout="row"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border border-slate-800 bg-slate-950/60 p-2">
            {filteredProducts.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-700">{t("pos.noProducts")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                {filteredProducts.map((product) => {
                  const stock = Number(product.quantity);

                  return (
                    <button
                      key={product._id}
                      type="button"
                      onClick={() => tapProduct(product)}
                      disabled={stock <= 0}
                      className="group flex flex-col gap-2 border border-slate-800 bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 text-start transition hover:border-cyan-700 hover:from-slate-700 active:scale-[0.98] disabled:opacity-40"
                    >
                      <div className="flex items-start gap-2">
                        {product.image?.url ? (
                          <img
                            src={product.image.url}
                            alt={product.name}
                            className="h-10 w-10 shrink-0 object-cover ring-1 ring-slate-700"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-slate-800 text-slate-600 ring-1 ring-slate-700">
                            <FiImage className="h-4 w-4" />
                          </span>
                        )}
                        <span className="line-clamp-2 text-xs font-medium leading-snug text-slate-200">
                          {product.name}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold tabular-nums text-cyan-400">
                          {currency(product.Price)}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            stock <= 0
                              ? "bg-red-950 text-red-400"
                              : stock <= 10
                              ? "bg-amber-950 text-amber-400"
                              : "bg-slate-800 text-slate-500"
                          }`}
                        >
                          {stock}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Keypad lives in the right column on a till; on narrow screens it
              follows the products, where the quantity multiplier is used. */}
          <div className="lg:hidden">
            <NumericKeypad
              buffer={buffer}
              multiplier={multiplier}
              onKey={onKey}
              onClear={clearKeypad}
            />
          </div>
        </section>

        {/* Right: categories, then keypad */}
        <aside className="hidden w-[260px] shrink-0 flex-col gap-2.5 border-s border-slate-800 bg-slate-950 p-2.5 lg:flex xl:w-[300px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
            {t("pos.categories")}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <CategoryTiles categories={categories} selected={category} onSelect={setCategory} />
          </div>

          <NumericKeypad
            buffer={buffer}
            multiplier={multiplier}
            onKey={onKey}
            onClear={clearKeypad}
          />
        </aside>
      </div>

      <div className="no-print">
        <StatusBar user={Authuser} till={TILL} onPrint={printReceipt} />
      </div>

      {/* Printable receipt — everything else is hidden by the print stylesheet. */}
      {receipt && (
        <div id="receipt" className="hidden">
          <h1>Eire Tech 360</h1>
          <p>{receipt.receiptNo}</p>
          <p>{new Date(receipt.createdAt).toLocaleString()}</p>
          <p>
            {t("pos.cashier")}: {receipt.cashierName}
          </p>
          <p>
            {t("pos.customer")}: {receipt.customerName}
          </p>
          <hr />
          <table>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={String(item.product)}>
                  <td>{item.name}</td>
                  <td>x{item.quantity}</td>
                  <td>{currency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
          <p>
            {t("pos.subtotal")}: {currency(receipt.subtotal)}
          </p>
          {receipt.discount > 0 && (
            <p>
              {t("pos.discount")}: -{currency(receipt.discount)}
            </p>
          )}
          {receipt.tax > 0 && (
            <p>
              {t("pos.tax")} ({Math.round(Number(receipt.taxRate || 0) * 1000) / 10}%):{" "}
              {currency(receipt.tax)}
            </p>
          )}
          <p>
            <strong>
              {t("pos.total")}: {currency(receipt.total)}
            </strong>
          </p>
          {(receipt.payments || []).map((entry, index) => (
            <p key={`${entry.method}-${index}`}>
              {t(`common.payments.${entry.method}`, entry.method)}: {currency(entry.amount)}
            </p>
          ))}
          {receipt.changeDue > 0 && (
            <p>
              {t("pos.changeDue")}: {currency(receipt.changeDue)}
            </p>
          )}
          <p>{t("pos.ageVerification")}</p>
        </div>
      )}

      {/* Modals */}
      {modal === "payment" && (
        <PaymentModal
          total={total}
          methods={paymentMethods}
          busy={isCheckingOut}
          onConfirm={checkout}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "refund" && (
        <RefundModal
          initialReceiptNo={refundReceiptNo}
          onDone={() => dispatch(gettingallproducts())}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "voucher" && (
        <VoucherModal
          subtotal={subtotal}
          applied={voucher}
          canGenerate={isElevated}
          onApply={setVoucher}
          onRemove={() => setVoucher(null)}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "discount" && (
        <DiscountModal
          subtotal={afterVoucher}
          discount={discount}
          discountType={discountType}
          onApply={(value, type) => {
            setDiscount(value);
            setDiscountType(type);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "history" && (
        <SaleHistoryModal
          canRefund={isElevated}
          onReprint={(entry) => {
            setReceipt(entry);
            setModal(null);
            setTimeout(() => window.print(), 100);
          }}
          onRefund={(receiptNo) => {
            setRefundReceiptNo(receiptNo);
            setModal("refund");
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "held" && (
        <HeldSalesModal onResume={resumeSale} onClose={() => setModal(null)} />
      )}

      {modal === "code" && (
        <EnterCodeModal
          onSubmit={(code) => {
            setModal(null);
            handleScanCode(code);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {unknownBarcode && (
        <UnknownBarcodeModal
          barcode={unknownBarcode}
          products={products}
          categories={categories}
          onResolved={(product) => {
            setUnknownBarcode(null);
            dispatch(gettingallproducts());
            addToCart(product, multiplier > 0 ? multiplier : 1);
            setMultiplier(0);
            setBuffer("");
          }}
          onClose={() => setUnknownBarcode(null)}
        />
      )}
    </div>
  );
}

// Manual entry for a barcode or PLU when the scanner can't reach the item.
function EnterCodeModal({ onSubmit, onClose }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim()) onSubmit(code.trim());
        }}
        className="w-full max-w-sm space-y-3 border border-slate-700 bg-slate-900 p-5"
      >
        <h2 className="text-lg font-semibold text-slate-100">{t("pos.enterCode.title")}</h2>
        <input
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("pos.enterCode.placeholder")}
          className="w-full border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100 outline-none focus:border-cyan-500"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-800 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            {t("pos.refund.cancel")}
          </button>
          <button
            type="submit"
            className="flex-1 bg-cyan-700 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
          >
            {t("pos.add")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default POSPage;
