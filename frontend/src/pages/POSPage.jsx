import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiClock,
  FiHash,
  FiImage,
  FiLock,
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
import { gettingallDeals } from "../features/dealSlice";
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
import ProductSearchModal from "../Components/pos/ProductSearchModal";
import DayClosingModal from "../Components/pos/DayClosingModal";
import {
  CURRENCIES,
  currency,
  initCurrency,
  setCurrencyCode,
  applicableDeals,
  MISC_CATEGORY,
} from "../Components/pos/posUtils";
import {
  cacheGet,
  cacheSet,
  markVoucherSpent,
  localHeldAdd,
  localHeldRemove,
} from "../lib/offlineDb";
import {
  queueSale,
  syncQueue,
  startAutoSync,
  isNetworkError,
} from "../lib/offlineQueue";
import { QRCodeSVG } from "qrcode.react";
import { gettingStore, hydrateStore } from "../features/storeSlice";
import e360LogoDark from "../images/e360-logo-dark.png";

const dashboardByRole = {
  admin: "/AdminDashboard",
  manager: "/ManagerDashboard",
  staff: "/StaffDashboard",
};

// What the shop actually takes over the counter. "wallet" is the digital/online
// tender (Apple Pay, Google Pay, Revolut).
const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "creditcard" },
  { label: "Wallet", value: "wallet" },
];

const TILL = "TERMINAL-MAIN";
const TAX_RATE_KEY = "pos_tax_rate";

// A synthetic category id. Deals aren't products and have no Category, so they
// get their own tile at the front of the list rather than a real DB category.
const DEALS_TAB = "__deals__";

function POSPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const location = useLocation();
  const searchRef = useRef(null);

  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { deals: allDeals } = useSelector((state) => state.deal);
  // The shop's own name/address, set by the owner. Drives the till header and
  // the printed receipt.
  const { store: SHOP } = useSelector((state) => state.store);
  const { Authuser } = useSelector((state) => state.auth);

  const role = Authuser?.role;
  // Superadmin sits above admin, so they get the elevated till actions too.
  const isElevated = role === "superadmin" || role === "admin" || role === "manager";
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

  // Anything the till rang up while the line was down.
  const [offlineCache, setOfflineCache] = useState(null);

  useEffect(() => {
    dispatch(gettingallproducts());
    dispatch(gettingallCategory());
    dispatch(gettingallDeals());
    dispatch(gettingStore());
  }, [dispatch]);

  // Flush queued sales as soon as the connection is back.
  useEffect(() => startAutoSync(), []);

  // Keep a copy of the live voucher codes so a customer's voucher still works
  // when the line drops. Best-effort — a till that has never been online simply
  // cannot take vouchers.
  useEffect(() => {
    axiosInstance
      .get("voucher/active")
      .then((response) => cacheSet("vouchers", response.data.vouchers || []))
      .catch(() => {
        /* offline, or no permission — the cached copy (if any) stands */
      });
  }, []);

  // Read the last-known catalogue up front, so a till that opens with no line
  // still has something to sell from while the live fetch fails in the
  // background.
  useEffect(() => {
    let alive = true;

    cacheGet("catalogue")
      .then((cached) => {
        if (alive && cached) setOfflineCache(cached);
      })
      .catch(() => {
        // No cache yet — the online fetch will lay one down.
      });

    // The shop name has to survive an outage too: it heads the till and prints
    // on every receipt, including the ones rung up offline.
    cacheGet("store")
      .then((cached) => {
        if (alive && cached) dispatch(hydrateStore(cached));
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [dispatch]);

  useEffect(() => {
    if (SHOP?.name) cacheSet("store", SHOP).catch(() => {});
  }, [SHOP]);

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

  // Live data when we have it, the last cached copy when we don't. The till must
  // never open to an empty grid just because the line is down.
  const products = useMemo(() => {
    if (Array.isArray(getallproduct) && getallproduct.length > 0) return getallproduct;
    return offlineCache?.products || [];
  }, [getallproduct, offlineCache]);

  const realCategories = useMemo(() => {
    if (Array.isArray(getallCategory) && getallCategory.length > 0) return getallCategory;
    return offlineCache?.categories || [];
  }, [getallCategory, offlineCache]);

  const dealSource = useMemo(() => {
    if (Array.isArray(allDeals) && allDeals.length > 0) return allDeals;
    return offlineCache?.deals || [];
  }, [allDeals, offlineCache]);

  const activeDeals = useMemo(
    () => dealSource.filter((deal) => deal.active !== false),
    [dealSource]
  );

  // Keep the cache fresh on every successful load, so the snapshot the till
  // falls back to is never older than its last online moment.
  useEffect(() => {
    if (!Array.isArray(getallproduct) || getallproduct.length === 0) return;

    cacheSet("catalogue", {
      products: getallproduct,
      categories: Array.isArray(getallCategory) ? getallCategory : [],
      deals: Array.isArray(allDeals) ? allDeals : [],
    }).catch(() => {
      // Out of quota or private mode — the till still works, just without a
      // fallback. Not worth interrupting a sale over.
    });
  }, [getallproduct, getallCategory, allDeals]);

  // Tile order at the till is about reach, not alphabet. Deals go first so a
  // cashier can ring a whole bundle with one tap, and "Miscellaneous" follows
  // — it is the catch-all for items that were just quick-added at the counter,
  // so it is reached for constantly and must not be buried mid-list. Everything
  // else keeps the order the server sent.
  const categories = useMemo(() => {
    const isMisc = (entry) => entry?.name === MISC_CATEGORY;
    const pinned = [
      ...realCategories.filter(isMisc),
      ...realCategories.filter((entry) => !isMisc(entry)),
    ];

    if (activeDeals.length === 0) return pinned;

    return [
      { _id: DEALS_TAB, name: t("pos.dealsTile"), productCount: activeDeals.length },
      ...pinned,
    ];
  }, [realCategories, activeDeals, t]);

  // Open the first category as soon as the list arrives.
  useEffect(() => {
    if (!category && categories.length > 0) setCategory(categories[0]._id);
  }, [categories, category]);

  const searching = query.trim().length > 0;
  const showingDeals = !searching && category === DEALS_TAB;

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

    // The deals tile renders deal cards instead of products.
    if (category === DEALS_TAB) return [];

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

  // Bundle deals are detected automatically as items land in the basket. The
  // server recomputes this at checkout — these values just drive the preview.
  const dealMatch = useMemo(
    () => applicableDeals(cart, allDeals),
    [cart, allDeals]
  );
  // Deals live in the sidebar as their own tile; see dealsCategoryId below.
  const dealRoom = Math.max(subtotal - voucherDiscount - manualDiscount, 0);
  const dealDiscount = Math.min(dealMatch.total, dealRoom);
  // Products that belong to a currently-applied deal, for the line badge.
  const dealProductIds = useMemo(() => {
    const set = new Set();
    dealMatch.applied.forEach((entry) => entry.products.forEach((id) => set.add(String(id))));
    return set;
  }, [dealMatch]);

  const totalDiscount = voucherDiscount + manualDiscount + dealDiscount;
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

  // Ring up a whole bundle at once. The discount itself is not applied here —
  // dropping the items in the basket is enough, because the deal matcher (and
  // the server at checkout) detects the complete set on its own.
  const tapDeal = (deal) => {
    const missing = [];

    (deal.items || []).forEach((item) => {
      const productId = String(item.product?._id || item.product);
      const product = products.find((entry) => entry._id === productId);

      if (!product) {
        missing.push(item.product?.name || productId);
        return;
      }

      addToCart(product, Number(item.quantity || 1));
    });

    if (missing.length > 0) {
      toast.error(t("pos.dealMissing", { names: missing.join(", ") }));
    }

    setMultiplier(0);
    setBuffer("");
  };

  // What a deal is worth, for the tile. Mirrors the matcher's rule: a percentage
  // is off the deal's own products.
  const dealPricing = (deal) => {
    const normal = (deal.items || []).reduce((sum, item) => {
      const productId = String(item.product?._id || item.product);
      const product = products.find((entry) => entry._id === productId);
      const price = Number(product?.Price ?? item.product?.Price ?? 0);
      return sum + price * Number(item.quantity || 1);
    }, 0);

    const raw =
      deal.discountType === "percent"
        ? (normal * Number(deal.discount || 0)) / 100
        : Number(deal.discount || 0);
    const saving = Math.min(raw, normal);

    return { normal, saving, price: Math.max(0, normal - saving) };
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

    const payload = {
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
    };

    // With no line the basket is parked on this till instead of the server. It
    // is only a basket — nothing is owed until it is charged — so it does not
    // need to reach the server to be useful; the same till can resume it.
    const holdLocally = async () => {
      await localHeldAdd({ ...payload, cashierName: Authuser?.name, createdAt: new Date().toISOString() });
      toast.success(t("pos.offline.heldLocally"));
      resetSale();
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await holdLocally();
      return;
    }

    try {
      await axiosInstance.post("pos/hold", payload);
      toast.success(t("pos.saleHeld"));
      resetSale();
    } catch (error) {
      if (isNetworkError(error)) {
        await holdLocally();
      } else {
        toast.error(error.response?.data?.message || t("pos.held.failed"));
      }
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

    // A locally-parked basket never reached the server, so there is nothing
    // there to clear.
    if (held.local) {
      await localHeldRemove(held._id).catch(() => {});
      return;
    }

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

  // Everything that goes on the receipt, worked out from the cart on this till.
  // Online this is only a preview and the server recomputes it; offline it is
  // what gets printed and later synced, so it is built once and used for both.
  const saleSnapshot = (payments) => ({
    customerName: customerName.trim(),
    payments,
    discount: Number(discount || 0),
    discountType,
    voucherCode: voucher?.code,
    taxEnabled,
    taxRate: taxFraction,
    items: cart.map((item) => ({ product: item.productId, quantity: item.quantity })),
  });

  const finishSale = (completed) => {
    setReceipt(completed);
    setModal(null);
    // On narrow screens the receipt (with Print / New Sale) lives in the sale
    // pane — show it, or the cashier is left staring at the product grid.
    setPane("sale");
    setCart([]);
    setSelectedLine(null);
    setDiscount(0);
    setVoucher(null);
    setTaxEnabled(false);
  };

  // Sell with no network: build the receipt here, park the sale, print as usual.
  // The customer is served exactly as they would be online; the sale reaches the
  // server the moment the line is back.
  const checkoutOffline = async (payments) => {
    const tendered = payments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    const queued = await queueSale({
      ...saleSnapshot(payments),
      // Offline the server cannot re-price, so the prices the customer was
      // actually charged travel with the sale and are honoured at sync.
      items: cart.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
      discount: totalDiscount,
      dealDiscount,
      // The server redeems the code at sync; it needs the amount that was
      // actually taken off, since it cannot recompute a cached voucher.
      voucherDiscount,
      deals: dealMatch.applied.map((entry) => ({
        dealId: entry.dealId,
        name: entry.name,
        sets: entry.sets,
        amount: entry.amount,
      })),
    });

    // Stop this till spending the same single-use code twice while it is down.
    if (voucher?.code) {
      await markVoucherSpent(voucher.code).catch(() => {});
    }

    finishSale({
      // The printed ref. The real POS-###### number is assigned at sync, and a
      // refund can be looked up by either.
      receiptNo: queued.offlineRef,
      offlinePending: true,
      customerName: customerName.trim(),
      cashierName: Authuser?.name,
      paymentMethod: payments.length === 1 ? payments[0].method : "split",
      payments,
      items: cart.map((item) => ({
        product: item.productId,
        name: item.name,
        barcode: item.barcode,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.price * item.quantity,
      })),
      subtotal,
      discount: totalDiscount,
      dealDiscount,
      deals: dealMatch.applied,
      taxRate: taxFraction,
      tax,
      total,
      amountTendered: tendered,
      changeDue: Math.max(0, tendered - total),
      createdAt: queued.soldAt,
    });

    toast.success(t("pos.offline.queued"));
  };

  const checkout = async (payments) => {
    setIsCheckingOut(true);

    // Known to be offline — don't even try, just serve the customer.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      try {
        await checkoutOffline(payments);
      } catch (error) {
        toast.error(t("pos.offline.queueFailed"));
      } finally {
        setIsCheckingOut(false);
      }
      return;
    }

    try {
      const response = await axiosInstance.post("pos/checkout", saleSnapshot(payments));

      finishSale(response.data.receipt);
      toast.success(t("pos.receiptCompleted"));
      dispatch(gettingallproducts());
      // A completed sale is a good moment to drain anything still queued.
      syncQueue();
    } catch (error) {
      // The line dropped mid-sale (the browser can still think it is online).
      // Fall back to the queue rather than losing the sale.
      if (isNetworkError(error)) {
        try {
          await checkoutOffline(payments);
        } catch {
          toast.error(t("pos.offline.queueFailed"));
        }
      } else {
        // A real refusal from the server — out of stock, bad voucher. The
        // cashier must see it; queueing it would only fail again later.
        toast.error(error.response?.data?.message || t("pos.checkoutFail"));
      }
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
      onClick: () => setModal("search"),
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
    {
      id: "dayClosing",
      label: "pos.rail.dayClosing",
      tone: "teal",
      icon: FiLock,
      onClick: () => setModal("dayClosing"),
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top chrome */}
      <header className="no-print flex items-center justify-between gap-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <img src={e360LogoDark} alt="Eire Tech 360" className="h-6 sm:h-7" />
          <span className="hidden h-5 w-px bg-slate-700 sm:block" />
          {/* Whose till this is — set by the owner in Super Admin → Store. */}
          <span className="hidden truncate text-sm font-bold tracking-wide text-slate-200 sm:block">
            {SHOP?.name}
          </span>
          <span className="hidden h-5 w-px bg-slate-700 lg:block" />
          <span className="hidden text-xs font-bold uppercase tracking-[0.22em] text-slate-500 lg:block">
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
            dealProductIds={dealProductIds}
            onSelect={setSelectedLine}
            onQuantityChange={updateQuantity}
            onRemove={removeFromCart}
          />

          {receipt && (
            <div
              className={`border-t px-3 py-2 text-sm ${
                receipt.offlinePending
                  ? "border-amber-800 bg-amber-900/20"
                  : "border-emerald-800 bg-emerald-900/20"
              }`}
            >
              <span
                className={`font-semibold ${
                  receipt.offlinePending ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {t("pos.receipt")} {receipt.receiptNo}
              </span>{" "}
              <span className="text-slate-300">
                {currency(receipt.total)}
                {receipt.changeDue ? ` · ${t("pos.changeDue")} ${currency(receipt.changeDue)}` : ""}
              </span>
              {receipt.offlinePending && (
                <span className="ms-2 bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300 ring-1 ring-amber-800">
                  {t("pos.offline.notSynced")}
                </span>
              )}
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
                {dealMatch.applied.map((entry) => (
                  <div
                    key={String(entry.dealId)}
                    className="flex justify-between gap-8 text-fuchsia-400"
                  >
                    <span className="flex items-center gap-1.5">
                      <FiTag className="h-3 w-3" />
                      <span className="text-xs">
                        {entry.name}
                        {entry.sets > 1 ? ` ×${entry.sets}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums">-{currency(entry.amount)}</span>
                  </div>
                ))}
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
                {showingDeals ? activeDeals.length : filteredProducts.length}
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
            {showingDeals ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                {activeDeals.map((deal) => {
                  const { normal, saving, price } = dealPricing(deal);

                  return (
                    <button
                      key={deal._id}
                      type="button"
                      onClick={() => tapDeal(deal)}
                      className="group flex flex-col gap-2 border border-fuchsia-900 bg-gradient-to-b from-fuchsia-950/60 to-slate-900 p-3 text-start transition hover:border-fuchsia-600 hover:from-fuchsia-900/60 active:scale-[0.98]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-fuchsia-200">
                          <FiTag className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">{deal.name}</span>
                        </span>
                        <span className="shrink-0 bg-fuchsia-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fuchsia-200">
                          {deal.discountType === "percent"
                            ? `−${Number(deal.discount)}%`
                            : `−${currency(deal.discount)}`}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-[11px] leading-snug text-slate-400">
                        {(deal.items || [])
                          .map(
                            (item) =>
                              `${item.quantity > 1 ? `${item.quantity}× ` : ""}${
                                item.product?.name || "?"
                              }`
                          )
                          .join(" + ")}
                      </p>

                      <div className="mt-auto flex items-baseline justify-between gap-2">
                        <span className="text-base font-bold tabular-nums text-cyan-400">
                          {currency(price)}
                        </span>
                        {saving > 0 && (
                          <span className="text-[11px] tabular-nums text-slate-500 line-through">
                            {currency(normal)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : filteredProducts.length === 0 ? (
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
                              : stock <= (product.lowStockThreshold ?? 10)
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
          {/* Header */}
          <div className="r-head">
            <div className="r-shop">{SHOP?.name}</div>
            {(SHOP?.addressLines || []).map((line) => (
              <div key={line} className="r-addr">
                {line}
              </div>
            ))}
            {SHOP?.phone && <div className="r-addr">{SHOP.phone}</div>}
            <div className="r-order">{receipt.receiptNo}</div>
          </div>

          {/* Meta — label/value pairs, so nothing wraps into a run-on line. */}
          <div className="r-meta">
            <span>{t("pos.receiptDoc.date")}</span>
            <span>{new Date(receipt.createdAt).toLocaleString()}</span>
          </div>
          <div className="r-meta">
            <span>{t("pos.receiptDoc.placedBy")}</span>
            <span>{receipt.cashierName || Authuser?.name || Authuser?.role}</span>
          </div>
          {receipt.customerName && receipt.customerName !== t("pos.walkIn") && (
            <div className="r-meta">
              <span>{t("pos.customer")}</span>
              <span>{receipt.customerName}</span>
            </div>
          )}

          <div className="r-rule" />

          {/* Items */}
          <table className="r-table">
            <thead>
              <tr>
                <th className="r-qty">{t("pos.table.qty")}</th>
                <th className="r-prod">{t("pos.table.product")}</th>
                <th className="r-num">{t("pos.table.rate")}</th>
                <th className="r-num">{t("pos.receiptDoc.price")}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={String(item.product)}>
                  <td className="r-qty">{item.quantity}</td>
                  <td className="r-prod">{item.name}</td>
                  <td className="r-num">{currency(item.price)}</td>
                  <td className="r-num">{currency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="r-rule" />

          {/* Totals */}
          <div className="r-line">
            <span>{t("pos.subtotal")}</span>
            <span>{currency(receipt.subtotal)}</span>
          </div>
          {(receipt.deals || []).map((entry) => (
            <div className="r-line r-save" key={String(entry.dealId)}>
              <span>
                {entry.name}
                {entry.sets > 1 ? ` ×${entry.sets}` : ""}
              </span>
              <span>−{currency(entry.amount)}</span>
            </div>
          ))}
          {receipt.voucher?.code && receipt.voucher.amount > 0 && (
            <div className="r-line r-save">
              <span>{receipt.voucher.code}</span>
              <span>−{currency(receipt.voucher.amount)}</span>
            </div>
          )}
          {receipt.discount -
            (receipt.dealDiscount || 0) -
            (receipt.voucher?.amount || 0) >
            0 && (
            <div className="r-line r-save">
              <span>{t("pos.discount")}</span>
              <span>
                −
                {currency(
                  receipt.discount -
                    (receipt.dealDiscount || 0) -
                    (receipt.voucher?.amount || 0)
                )}
              </span>
            </div>
          )}
          {receipt.tax > 0 && (
            <div className="r-line">
              <span>
                {t("pos.tax")} ({Math.round(Number(receipt.taxRate || 0) * 1000) / 10}%)
              </span>
              <span>{currency(receipt.tax)}</span>
            </div>
          )}
          <div className="r-line r-total">
            <span>{t("pos.total")}</span>
            <span>{currency(receipt.total)}</span>
          </div>

          {/* Payments */}
          <div className="r-rule" />
          <div className="r-strong">{t("pos.receiptDoc.payments")}</div>
          {(receipt.payments && receipt.payments.length > 0
            ? receipt.payments
            : [{ method: receipt.paymentMethod, amount: receipt.total }]
          ).map((entry, index) => (
            <div className="r-line" key={`${entry.method}-${index}`}>
              <span>{t(`common.payments.${entry.method}`, entry.method)}</span>
              <span>{currency(entry.amount)}</span>
            </div>
          ))}
          {receipt.changeDue > 0 && (
            <div className="r-line r-strong">
              <span>{t("pos.changeDue")}</span>
              <span>{currency(receipt.changeDue)}</span>
            </div>
          )}

          {/* The line customers actually look for. Worth its own box. */}
          {receipt.discount > 0 && (
            <div className="r-savedbox">
              {t("pos.receiptDoc.youSaved", { amount: currency(receipt.discount) })}
            </div>
          )}

          {/* QR + footer */}
          <div className="r-rule" />
          <div className="r-center r-qrwrap">
            <QRCodeSVG
              value={(SHOP?.qrTemplate || "{ref}").replace("{ref}", receipt.receiptNo)}
              size={116}
              level="M"
            />
          </div>

          <div className="r-center r-footer">
            {SHOP?.footer || t("pos.receiptDoc.thanksShopping", "Thank you for shopping with us")}
          </div>
          <div className="r-center r-footer">{t("pos.ageVerification")}</div>
          <div className="r-center r-tail">• • •</div>
        </div>
      )}

      {/* Modals */}
      {modal === "search" && (
        <ProductSearchModal
          products={products}
          categories={categories}
          onPick={(product) => tapProduct(product)}
          onClose={() => setModal(null)}
        />
      )}

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

      {modal === "dayClosing" && (
        <DayClosingModal
          onClosed={() => setReceipt(null)}
          onClose={() => setModal(null)}
        />
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
