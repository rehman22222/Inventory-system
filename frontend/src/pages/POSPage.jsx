import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiClock,
  FiHash,
  FiImage,
  FiLock,
  FiLogOut,
  FiBookOpen,
  FiPlay,
  FiRotateCcw,
  FiSearch,
  FiSlash,
  FiTag,
  FiX,
} from "react-icons/fi";
import axiosInstance from "../lib/axios";
import { isDemoMode } from "../lib/demoMode";
import useBarcodeScanner from "../lib/useBarcodeScanner";
import { gettingallproducts, stockChanged, stockSold } from "../features/productSlice";
import { io } from "socket.io-client";
import { socketURL } from "../lib/socket";
import { gettingallCategory } from "../features/categorySlice";
import { gettingallDeals } from "../features/dealSlice";
import ActionRail from "../Components/pos/ActionRail";
import SaleTable from "../Components/pos/SaleTable";
import CategoryTiles from "../Components/pos/CategoryTiles";
import NumericKeypad from "../Components/pos/NumericKeypad";
import StatusBar from "../Components/pos/StatusBar";
import RefundModal from "../Components/pos/RefundModal";
import VoucherModal from "../Components/pos/VoucherModal";
import UnknownBarcodeModal from "../Components/pos/UnknownBarcodeModal";
import SaleHistoryModal from "../Components/pos/SaleHistoryModal";
import HeldSalesModal from "../Components/pos/HeldSalesModal";
import PaymentModal from "../Components/pos/PaymentModal";
import DealPriceModal from "../Components/pos/DealPriceModal";
import SaleCompleteModal from "../Components/pos/SaleCompleteModal";
import RefundHistoryModal from "../Components/pos/RefundHistoryModal";
import DealsModal from "../Components/DealsModal";
import ProductSearchModal from "../Components/pos/ProductSearchModal";
import DayClosingModal from "../Components/pos/DayClosingModal";
import CreditBookModal from "../Components/pos/CreditBookModal";
import {
  CURRENCIES,
  currency,
  currencySymbol,
  setCurrencyCode,
  applicableDeals,
  allDealIds,
  sanitizeDecimal,
  printSlip,
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

// What the shop takes over the counter. "wallet" is gone from the buttons but
// stays valid in the models, so receipts already written with it still read.
const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "creditcard" },
  // Sold on account: the goods go, the money does not. Kept as a tender so the
  // basket can be settled with it, but nothing lands in the drawer and the
  // receipt says so rather than stamping itself paid.
  { label: "Credit", value: "credit" },
];

// Who the sale is for. Fixed answers so the shop can actually count staff
// purchases against loyalty against passing trade — the first is the default
// and what every ordinary sale carries.
const CUSTOMER_TYPES = ["Walk-In", "Staff", "Loyalty Customer"];

const TILL = "TERMINAL-MAIN";
const TAX_RATE_KEY = "pos_tax_rate";

// A synthetic category id. Deals aren't products and have no Category, so they
// get their own tile at the front of the list rather than a real DB category.
const DEALS_TAB = "__deals__";

function POSPage() {
  const { t } = useTranslation();
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
  // One till, the same at every role. Staff, manager, admin and superadmin get
  // the same buttons: refunds, voids, deals, vouchers and price fixes all
  // happen with a customer standing there, and a counter that has to fetch
  // someone with a better login is a counter that keeps people waiting.
  //
  // Nothing here is anonymous — each of those is written against whoever did it
  // and reads back in the activity log, the refund history and the day's
  // takings. That record is what makes this workable, and it is the only thing
  // that does. The server agrees: see `tillUser` in Authmiddleware.
  const isElevated = true;
  const dashboardPath = dashboardByRole[role] || "/StaffDashboard";
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  // No "All" tile — the till always has one category open. It defaults to the
  // first one once the list loads.
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState([]);
  // One entry per unit, in the order it was rung up. The basket merges three of
  // a flavour onto one line, which loses the order the customer put them on the
  // counter — and that order is what decides how the deal sets fall.
  const [scanOrder, setScanOrder] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);

  const [customerName, setCustomerName] = useState(CUSTOMER_TYPES[0]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState("amount");
  const [voucher, setVoucher] = useState(null);
  // The offers the cashier has pressed Apply on. An offer the basket no longer
  // satisfies needs no tidying up — the matcher simply stops finding it, and
  // the id sits harmlessly until the sale ends.
  const [appliedDealIds, setAppliedDealIds] = useState([]);
  // Deals hand-priced at the counter: { dealId: whatThisDealPortionCosts }.
  // The server re-checks every figure against the goods, and logs the edit.
  const [dealOverrides, setDealOverrides] = useState({});
  // How many complete sets of each offer the cashier chose to give. A basket can
  // qualify for two and the counter still only want to hand over one.
  const [dealSets, setDealSets] = useState({});
  // The units each applied offer is being given on, fixed at the moment it was
  // given. See applyDeal.
  const [dealLocks, setDealLocks] = useState({});
  const [editingDeal, setEditingDeal] = useState(null);
  const [taxEnabled, setTaxEnabled] = useState(false);
  // The tax rate is the shop's call, not ours — no hardcoded percentage. The
  // last rate the cashier used is remembered on this till.
  const [taxRate, setTaxRate] = useState(() => localStorage.getItem(TAX_RATE_KEY) || "");
  const [currencyCode, setCurrency] = useState("EUR");

  const [receipt, setReceipt] = useState(null);
  // The just-finished sale, held only while the counter decides what to do with
  // the receipt. Kept apart from `receipt`, which stays put after this is
  // dismissed so the slip can still be reprinted from the bar.
  const [justSold, setJustSold] = useState(null);
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
  const [modal, setModal] = useState(null); // refund | voucher | discount | history | held | code
  const [unknownBarcode, setUnknownBarcode] = useState(null);
  const [refundReceiptNo, setRefundReceiptNo] = useState("");
  // What the customer is taking instead of what they brought back. Held here
  // rather than inside the refund dialog because picking one opens the product
  // search over the top, and the refund dialog has to keep its half-filled
  // state — which lines, which quantities — while that happens.
  const [exchangeItems, setExchangeItems] = useState([]);
  // Credit from a return that is paying for the replacement: { reference,
  // amount }. Held here rather than folded into the price, because the sale is
  // still worth what it is worth — this is how it was paid for.
  const [refundCredit, setRefundCredit] = useState(null);
  const [pickingExchange, setPickingExchange] = useState(false);

  // Anything the till rang up while the line was down.
  const [offlineCache, setOfflineCache] = useState(null);

  // Stock moved somewhere else — the website, or another till. The number on
  // screen updates without a refetch, so a cashier never offers something the
  // web has just sold. The sale itself was already safe (the decrement is
  // guarded server-side); this is about not showing a figure that has moved on.
  useEffect(() => {
    const socket = io(socketURL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.on("stockChanged", (payload) => dispatch(stockChanged(payload)));
    return () => socket.disconnect();
  }, [dispatch]);

  useEffect(() => {
    dispatch(gettingallproducts({ view: "pos" }));
    dispatch(gettingallCategory());
    dispatch(gettingallDeals());
    dispatch(gettingStore());
  }, [dispatch]);

  useEffect(() => {
    const configured = setCurrencyCode(SHOP?.currency || "EUR");
    setCurrency(configured);
  }, [SHOP?.currency]);

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
    if (isDemoMode()) return [];
    return offlineCache?.products || [];
  }, [getallproduct, offlineCache]);

  const realCategories = useMemo(() => {
    if (Array.isArray(getallCategory) && getallCategory.length > 0) return getallCategory;
    if (isDemoMode()) return [];
    return offlineCache?.categories || [];
  }, [getallCategory, offlineCache]);

  const dealSource = useMemo(() => {
    if (Array.isArray(allDeals) && allDeals.length > 0) return allDeals;
    if (isDemoMode()) return [];
    return offlineCache?.deals || [];
  }, [allDeals, offlineCache]);

  // The Deals tile is a place to browse festive offers — a flat amount or
  // percentage off. Multi-buy deals are deliberately not here: they are found
  // by scanning, and they announce themselves above the total the moment the
  // basket qualifies. Putting them in the grid too would mean two places
  // showing the same offer, one of which cannot apply it.
  const activeDeals = useMemo(
    () =>
      dealSource.filter(
        (deal) => deal.active !== false && deal.discountType !== "setPrice"
      ),
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
  // What the till can actually sell, counted per category. The server holds
  // back products with no barcode from the POS view, so a category whose every
  // item is online-only (the "ONLINE — ..." ones) would otherwise render as a
  // tile that opens onto an empty grid. Counting the loaded products rather
  // than trusting the category's own `productCount` also keeps the badge
  // honest: that count is taken over the whole catalogue, so it would promise
  // a cashier 235 items behind a tile that only holds 228.
  const stockedCounts = useMemo(() => {
    const counts = new Map();
    for (const product of products) {
      const id = product?.Category?._id;
      if (!id) continue;
      const key = String(id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [products]);

  const categories = useMemo(() => {
    const isMisc = (entry) => entry?.name === MISC_CATEGORY;
    // "ONLINE — …" are the website's shelves, not the shop's. One of their
    // products picking up a barcode should not put a web aisle on the till;
    // the item still scans, it just isn't browsable here.
    const isWebAisle = (entry) => /^ONLINE — /.test(entry?.name || "");
    const stocked = realCategories
      .filter((entry) => stockedCounts.has(String(entry?._id)) && !isWebAisle(entry))
      .map((entry) => ({
        ...entry,
        productCount: stockedCounts.get(String(entry._id)),
      }));
    const pinned = [
      ...stocked.filter(isMisc),
      ...stocked.filter((entry) => !isMisc(entry)),
    ];

    if (activeDeals.length === 0) return pinned;

    return [
      { _id: DEALS_TAB, name: t("pos.dealsTile"), productCount: activeDeals.length },
      ...pinned,
    ];
  }, [realCategories, stockedCounts, activeDeals, t]);

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

  // Deals are detected as items land in the basket, but never taken on the
  // shop's behalf: the till works out what the basket qualifies for and what it
  // would save, and the cashier decides. Until Apply is pressed the basket is
  // at shelf price. The server recomputes all of it at checkout — these values
  // only drive the screen.
  const dealMatch = useMemo(
    () =>
      applicableDeals(cart, allDeals, appliedDealIds, dealOverrides, dealSets, dealLocks, scanOrder),
    [cart, allDeals, appliedDealIds, dealOverrides, dealSets, dealLocks, scanOrder]
  );
  // The same matcher asked a different question: what could this basket have?
  // Anything it finds that is not already applied is an offer to show. Asking
  // the one function twice keeps the offer and the charge in step by
  // construction — a second code path would eventually disagree with the first.
  const dealOffers = useMemo(
    () =>
      applicableDeals(
        cart,
        allDeals,
        allDealIds(allDeals),
        undefined,
        dealSets,
        undefined,
        scanOrder
      ).applied.filter((entry) => !appliedDealIds.includes(String(entry.dealId))),
    [cart, allDeals, appliedDealIds, dealSets, scanOrder]
  );
  // Deals live in the sidebar as their own tile; see dealsCategoryId below.
  const dealRoom = Math.max(subtotal - voucherDiscount - manualDiscount, 0);
  const dealDiscount = Math.min(dealMatch.total, dealRoom);
  // Which units an offer is being given on, worked out fresh and then held.
  // Asked of the matcher with the lock deliberately absent, because this is the
  // moment the set is chosen — everything after this holds it still.
  const chooseSet = (dealId, sets) => {
    const id = String(dealId);
    const picked = applicableDeals(
      cart,
      allDeals,
      [id],
      undefined,
      sets ? { [id]: sets } : undefined,
      undefined,
      scanOrder
    ).applied[0];
    return picked?.allocation || null;
  };

  // Change how many sets an applied offer gives, in place. The set is chosen
  // again at the new count: going from one to two has to reach further into the
  // basket, and the old lock only names enough units for one.
  const setDealSetCount = (dealId, next) => {
    const id = String(dealId);
    const wanted = Math.max(1, Math.floor(Number(next) || 1));
    setDealSets((current) => ({ ...current, [id]: wanted }));
    const picked = chooseSet(id, wanted);
    setDealLocks((current) => ({ ...current, [id]: picked }));
  };

  const applyDeal = (dealId) => {
    const id = String(dealId);
    setAppliedDealIds((current) =>
      current.includes(id) ? current : [...current, id]
    );
    // Fix the offer to the units it is being given on. From here, scanning
    // another of something already in the set adds it at shelf price rather
    // than quietly reshuffling which items are in the offer — the box on
    // screen is a promise the cashier has already made out loud.
    setDealLocks((current) =>
      current[id] ? current : { ...current, [id]: chooseSet(id, dealSets[id]) }
    );
  };

  const removeDeal = (dealId, dealName) => {
    setAppliedDealIds((current) => current.filter((id) => id !== String(dealId)));
    // Taking a discount away is the kind of change that has to be seen: the
    // total moves up, and a cashier who tapped by accident needs to know the
    // customer is now on shelf price before the card goes in.
    toast(t("pos.deal.removed", { name: dealName || "" }), {
      icon: "🏷",
    });
    // Taking the offer off drops the hand-typed price with it, so putting it
    // back on later starts from the shop's figure rather than the last edit.
    setDealOverrides((current) => {
      const { [String(dealId)]: _removed, ...rest } = current;
      return rest;
    });
    // And forgets which units it was on, so giving it again chooses afresh.
    setDealLocks((current) => {
      const { [String(dealId)]: _dropped, ...rest } = current;
      return rest;
    });
  };

  // Taking an offer and pricing it are one action from the cashier's side: the
  // popup is where they see the figure, and they either accept it or type
  // another. So Apply on an offer opens this rather than committing outright.
  const priceDeal = (entry, price) => {
    const dealId = String(entry.dealId);
    const dealPrice = Number(entry.normal) - Number(entry.configuredAmount);

    applyDeal(dealId);
    setDealOverrides((current) => {
      const { [dealId]: _previous, ...rest } = current;
      // Accepting the shop's own figure is not an edit and must not be logged
      // as one — half a cent of float noise is not a decision.
      return Math.abs(price - dealPrice) < 0.005 ? rest : { ...rest, [dealId]: price };
    });
    setEditingDeal(null);
  };

  const addExchangeItem = (product) =>
    setExchangeItems((current) => {
      const existing = current.find((item) => item.productId === product._id);
      if (existing) {
        return current.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...current,
        {
          productId: product._id,
          name: product.name,
          barcode: product.barcode,
          price: Number(product.Price || 0),
          quantity: 1,
        },
      ];
    });

  const setExchangeQty = (productId, quantity) =>
    setExchangeItems((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, Math.floor(quantity)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );

  const removeExchangeItem = (productId) =>
    setExchangeItems((current) =>
      current.filter((item) => item.productId !== productId)
    );

  const resetDealPrice = (dealId) => {
    applyDeal(String(dealId));
    setDealOverrides((current) => {
      const { [String(dealId)]: _removed, ...rest } = current;
      return rest;
    });
    setEditingDeal(null);
  };

  const totalDiscount = voucherDiscount + manualDiscount + dealDiscount;
  const taxable = Math.max(subtotal - totalDiscount, 0);
  const taxFraction = Math.max(0, Number(taxRate || 0)) / 100;
  const tax = taxEnabled ? taxable * taxFraction : 0;
  const total = taxable + tax;

  // Never more than this basket costs. An exchange for something cheaper leaves
  // the difference to be handed back over the counter — the refund dialog has
  // already shown the cashier that figure — rather than becoming a balance the
  // shop has to remember.
  const creditApplied = Math.min(Number(refundCredit?.amount || 0), total);
  const due = Math.max(0, total - creditApplied);

  const addToCart = useCallback(
    (product, quantity = 1) => {
      const stock = Number(product.quantity || 0);

      if (stock <= 0) {
        toast.error(t("pos.outOfStock", { name: product.name }));
        return;
      }

      setReceipt(null);
      // Log the units as they are rung up. The matcher reconciles this against
      // the basket, so an optimistic entry that stock later trims is skipped
      // rather than counted — the log can lag, it cannot lie.
      setScanOrder((current) => [
        ...current,
        ...Array.from({ length: Math.max(1, quantity) }, () => product._id),
      ]);
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
    // A bundle names its contents, so tapping it can fill the basket. A
    // pick-any-N does not — its "contents" are every eligible product, and
    // dropping a hundred flavours into the sale is not what anyone meant by
    // tapping the card. Say what to do instead.
    if (deal.mode === "mix") {
      toast(
        t("pos.dealMixHint", "Scan any {{n}} of these and the offer appears.", {
          n: Math.max(2, Math.floor(Number(deal.groupQuantity || 0))),
        })
      );
      return;
    }

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
    const priceOf = (item) => {
      const productId = String(item.product?._id || item.product);
      const product = products.find((entry) => entry._id === productId);
      return Number(product?.Price ?? item.product?.Price ?? 0);
    };

    // A bundle is a recipe, so its price is the recipe. A pick-any-N has no
    // fixed contents — one set is whichever N the shopper brings, and the
    // matcher takes the dearest, so that is what a set is worth here too.
    // Adding up all 137 eligible flavours is what produced the "€941 / €959"
    // on the tile: a figure for a basket nobody would ever buy.
    const normal =
      deal.mode === "mix"
        ? (deal.items || [])
            .map(priceOf)
            .sort((a, b) => b - a)
            .slice(0, Math.max(2, Math.floor(Number(deal.groupQuantity || 0))))
            .reduce((sum, price) => sum + price, 0)
        : (deal.items || []).reduce(
            (sum, item) => sum + priceOf(item) * Number(item.quantity || 1),
            0
          );

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
    setCart((current) => {
      const line = current.find((item) => item.productId === productId);
      const wanted = Math.max(0, Math.min(next, line?.stock ?? next));
      const delta = wanted - (line?.quantity || 0);

      // Keep the scan log in step: going up appends, going down takes the most
      // recently rung units off first, which is the one the cashier just added.
      if (delta > 0) {
        setScanOrder((log) => [
          ...log,
          ...Array.from({ length: delta }, () => productId),
        ]);
      } else if (delta < 0) {
        setScanOrder((log) => {
          const trimmed = [...log];
          for (let i = 0; i < -delta; i += 1) {
            const at = trimmed.lastIndexOf(productId);
            if (at === -1) break;
            trimmed.splice(at, 1);
          }
          return trimmed;
        });
      }

      return current
        .map((item) => (item.productId === productId ? { ...item, quantity: wanted } : item))
        .filter((item) => item.quantity > 0);
    });
  };

  const removeFromCart = (productId) => {
    setCart((current) => current.filter((item) => item.productId !== productId));
    setScanOrder((log) => log.filter((id) => id !== productId));
  };

  // Clearing a basket that is holding refund credit would leave the customer
  // with neither their goods nor their money: the refund has already gone
  // through, and it handed over less than it was worth because a replacement
  // was coming. So the till asks, and hands the difference back if the answer
  // is that the exchange is not happening.
  //
  // Awaited before anything is cleared — if the server refuses (the credit was
  // spent by another till in the meantime) the basket stays put rather than
  // quietly losing the reference.
  const releaseCreditIfHeld = async () => {
    if (!refundCredit || creditApplied <= 0) return true;

    const amount = currency(Number(refundCredit.amount || 0));
    if (
      !window.confirm(
        t("pos.exchange.releaseConfirm", {
          amount,
          reference: refundCredit.reference,
          defaultValue:
            "{{amount}} of refund {{reference}} has not been spent. Hand it back to the customer in cash?",
        })
      )
    ) {
      return false;
    }

    try {
      await axiosInstance.post(`pos/refund/${refundCredit.reference}/release`);
      toast.success(t("pos.exchange.released", { amount, defaultValue: "{{amount}} handed back" }));
      return true;
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          t("pos.exchange.releaseFailed", "Could not hand the refund credit back")
      );
      return false;
    }
  };

  const resetSale = () => {
    setCart([]);
    setScanOrder([]);
    setSelectedLine(null);
    setCustomerName(CUSTOMER_TYPES[0]);
    setDiscount(0);
    setDiscountType("amount");
    setVoucher(null);
    setRefundCredit(null);
    setAppliedDealIds([]);
    setDealOverrides({});
    setDealSets({});
    setDealLocks({});
    setTaxEnabled(false);
    setBuffer("");
    setMultiplier(0);
  };

  const newSale = async () => {
    if (!(await releaseCreditIfHeld())) return;
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
    setCustomerName(held.customerName || CUSTOMER_TYPES[0]);
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
      // Reversing a sale that has already printed is a real thing to do, so it
      // asks once — not for permission, but for certainty.
      if (!window.confirm(t("pos.void.confirm", { receiptNo: receipt.receiptNo }))) return;

      try {
        await axiosInstance.post(`pos/void/${receipt.receiptNo}`);
        toast.success(t("pos.void.done", { receiptNo: receipt.receiptNo }));
        dispatch(gettingallproducts({ view: "pos" }));
        newSale();
      } catch (error) {
        toast.error(error.response?.data?.message || t("pos.void.failed"));
      }
      return;
    }

    if (cart.length === 0) return;
    if (!(await releaseCreditIfHeld())) return;
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

    // An exchange where the replacement costs no more than the return: there is
    // nothing to hand over, so there is nothing to ask. The tender screen has
    // no zero button and should not need one.
    if (due <= 0.001 && creditApplied > 0) {
      checkout([]);
      return;
    }

    setModal("payment");
  };

  // Everything that goes on the receipt, worked out from the cart on this till.
  // Online this is only a preview and the server recomputes it; offline it is
  // what gets printed and later synced, so it is built once and used for both.
  const saleSnapshot = (payments, creditTerms) => ({
    customerName: customerName.trim(),
    payments,
    discount: Number(discount || 0),
    discountType,
    voucherCode: voucher?.code,
    taxEnabled,
    taxRate: taxFraction,
    // Which offers the cashier pressed Apply on. Ids only — the server prices
    // them itself, so a till can choose an offer but never its value. An
    // offline sale carries the same list and is priced the same way at sync.
    dealIds: dealMatch.applied.map((entry) => String(entry.dealId)),
    // Hand-typed prices, if any. The server clamps and logs them.
    dealOverrides,
    // How many complete sets of each the cashier chose to give, and the units
    // each was given on.
    dealSets,
    dealLocks,
    // The order things were rung up, so the server forms the same sets.
    scanOrder,
    items: cart.map((item) => ({ product: item.productId, quantity: item.quantity })),
    // Who owes what went on the book, and by when. Undefined on an ordinary
    // sale; the server refuses a credit tender without it.
    creditTerms,
    // Credit from a return, spent here. The server checks it against the refund
    // record and decides what it is actually worth; this is a request.
    refundCredit:
      refundCredit && creditApplied > 0
        ? { reference: refundCredit.reference, amount: creditApplied }
        : undefined,
  });

  const finishSale = (completed) => {
    setReceipt(completed);
    setJustSold(completed);
    setModal(null);
    // On narrow screens the receipt (with Print / New Sale) lives in the sale
    // pane — show it, or the cashier is left staring at the product grid.
    setPane("sale");
    setCart([]);
    setScanOrder([]);
    setSelectedLine(null);
    setDiscount(0);
    setVoucher(null);
    setRefundCredit(null);
    setAppliedDealIds([]);
    setDealOverrides({});
    setDealSets({});
    setDealLocks({});
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

  const checkout = async (payments, creditTerms) => {
    setIsCheckingOut(true);

    // Selling on account needs the server. The debt gets a reference, a term
    // and an account somebody can search for, and the offline queue carries
    // none of that — a queued credit sale is one the server refuses at sync,
    // which strands it in the queue with the goods already gone.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (creditTerms && offline) {
      toast.error(
        t(
          "pos.credit.needsNetwork",
          "A sale on account needs the connection — take payment another way, or wait for it to come back",
        ),
      );
      setIsCheckingOut(false);
      return;
    }

    // A refund credit is money held on a server record, and nothing offline can
    // check whether it has already been spent. The refund that created it went
    // through seconds ago, so the line has only just dropped — better to say so
    // than to queue a sale that may not be payable at sync.
    if (
      refundCredit &&
      creditApplied > 0 &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      toast.error(
        t(
          "pos.exchange.needsNetwork",
          "This exchange needs the connection back before it can be rung up"
        )
      );
      setIsCheckingOut(false);
      return;
    }

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
      const response = await axiosInstance.post("pos/checkout", saleSnapshot(payments, creditTerms));

      finishSale(response.data.receipt);
      toast.success(t("pos.receiptCompleted"));
      // The grid only needs the quantities to move, and the receipt already says
      // what left the shelf. Pulling the whole catalogue back after every sale
      // put a third of a megabyte and half a second between the cashier and the
      // next customer.
      dispatch(
        stockSold(
          (response.data.receipt?.items || []).map((item) => ({
            product: item.product,
            quantity: item.quantity,
          })),
        ),
      );
      // A completed sale is a good moment to drain anything still queued.
      syncQueue();
    } catch (error) {
      // The line dropped mid-sale (the browser can still think it is online).
      // Fall back to the queue rather than losing the sale.
      if (isNetworkError(error)) {
        if (creditTerms) {
          // Same reason as above: a debt needs a record only the server can
          // write, so queueing it would strand the sale at sync.
          toast.error(
            t(
              "pos.credit.needsNetwork",
              "A sale on account needs the connection — take payment another way, or wait for it to come back",
            ),
          );
        } else if (refundCredit && creditApplied > 0) {
          // Same reason: the credit has to be claimed against the refund
          // record, and the queue cannot do that.
          toast.error(
            t(
              "pos.exchange.needsNetwork",
              "This exchange needs the connection back before it can be rung up"
            )
          );
        } else {
          try {
            await checkoutOffline(payments);
          } catch {
            toast.error(t("pos.offline.queueFailed"));
          }
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
    // Through printSlip like every other printed surface: a basket long enough
    // to run past one sheet has to paginate, and it cannot do that where it
    // stands.
    printSlip("receipt");
  };

  // The rail, in the order a shift actually uses it: finding and pricing
  // things first, then the customer's money, then the things that undo a sale,
  // then the looking-back screens, then closing up.
  //
  // Every button does exactly what it did before — only the wording and the
  // order changed. The names are the shop's: "Clear Basket" says what the
  // button does, where "Void Sale" made a cashier stop and think about whether
  // it meant the printed receipt.
  const actions = [
    {
      id: "search",
      label: "pos.rail.productSearch",
      tone: "cyan",
      icon: FiSearch,
      onClick: () => setModal("search"),
    },
    {
      // Building an offer is the same job here as it is on the Products page,
      // so it is the same dialog — the till is simply where the person who
      // decides the offer is standing.
      id: "deals",
      label: "pos.rail.deals",
      tone: "fuchsia",
      icon: FiTag,
      disabled: !isElevated,
      onClick: () => setModal("deals"),
    },

    {
      id: "vouchers",
      label: "pos.rail.vouchers",
      tone: "violet",
      icon: FiTag,
      onClick: () => setModal("voucher"),
    },
    {
      id: "code",
      label: "pos.rail.enterCode",
      tone: "slate",
      icon: FiHash,
      onClick: () => setModal("code"),
    },
    {
      id: "credit",
      label: "pos.rail.credit",
      tone: "amber",
      icon: FiBookOpen,
      onClick: () => setModal("credit"),
    },
    {
      id: "resume",
      label: "pos.rail.resume",
      tone: "emerald",
      icon: FiPlay,
      onClick: () => setModal("held"),
    },
    { id: "void", label: "pos.rail.void", tone: "red", icon: FiSlash, onClick: voidSale },
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
    {
      id: "history",
      label: "pos.rail.saleHistory",
      tone: "blue",
      icon: FiClock,
      onClick: () => setModal("history"),
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
    <div className="pos-root flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
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

        {/* The header keeps only what is about the till itself. The basket
            count and the language belong with the other standing facts on the
            status bar, where they are out of the way of the sale. */}
        <div className="flex items-center gap-2">
          <span
            title={t("pos.currencyHint")}
            className="border border-slate-800 bg-black px-2 py-1.5 text-sm font-semibold text-slate-200"
          >
            {(CURRENCIES.find((entry) => entry.code === currencyCode) || CURRENCIES[0]).symbol}{" "}
            {currencyCode}
          </span>

          <Link
            to={dashboardPath}
            // Walking away from the till with a customer's refund credit still
            // in the basket is the one way out that nobody would notice. It
            // asks the same question clearing the basket does, and stays put if
            // the answer is no.
            onClick={(event) => {
              if (!refundCredit || creditApplied <= 0) return;
              event.preventDefault();
              releaseCreditIfHeld().then((done) => {
                if (done) navigate(dashboardPath);
              });
            }}
            title={t("pos.exit")}
            aria-label={t("pos.exit")}
            // Icon only, and red: leaving the till mid-shift is the one thing
            // in this header nobody should press by accident, and a word beside
            // it made it look like just another button.
            className="flex items-center justify-center bg-red-900/40 p-2 text-red-400 ring-1 ring-red-800 transition hover:bg-red-800 hover:text-white"
          >
            <FiLogOut className="h-4 w-4" />
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
            deals={dealMatch.applied}
            onSelect={setSelectedLine}
            onQuantityChange={updateQuantity}
            onRemove={removeFromCart}
          />

          {/* Totals + tender */}
          <div className="space-y-2.5 border-t border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-3">
            <div className="flex flex-wrap gap-2">
              {/* Who is buying, as three fixed answers rather than free text.
                  The shop wants to be able to count staff sales against
                  loyalty against passing trade, and that only works if the
                  answer is the same word every time — a box somebody types
                  into gives four spellings of "staff" and no figure at all. */}
              <select
                value={CUSTOMER_TYPES.includes(customerName) ? customerName : CUSTOMER_TYPES[0]}
                onChange={(event) => setCustomerName(event.target.value)}
                aria-label={t("pos.customer")}
                className="min-w-[140px] flex-1 border border-slate-800 bg-black px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-600"
              >
                {CUSTOMER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
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
                  type="text"
                  inputMode="decimal"
                  data-keyboard="numeric"
                  disabled={!taxEnabled}
                  value={taxRate}
                  onChange={(event) => {
                    const next = sanitizeDecimal(event.target.value);
                    setTaxRate(next);
                    localStorage.setItem(TAX_RATE_KEY, next);
                  }}
                  placeholder="0"
                  title={t("pos.taxRateHint")}
                  className="w-12 border border-slate-800 bg-black py-1 text-center text-xs tabular-nums text-slate-100 outline-none transition focus:border-cyan-600 disabled:opacity-40"
                />
                <span className="text-xs font-semibold">%</span>
              </div>
            </div>

            {/* minmax(0,1fr), not 1fr: a bare 1fr is minmax(auto,1fr) and refuses
                to shrink below its content, so an applied deal — a long product
                name, an EDITED badge and a set stepper — pushed the total clean
                off the edge of a narrow till. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border border-slate-800 bg-black/40 px-3 py-3 sm:gap-6 sm:px-4">
              <div className="min-w-0 space-y-1 text-sm">
                <div className="flex justify-between gap-8 text-slate-500">
                  <span className="flex items-center gap-2">
                    {t("pos.subtotal")}
                    {/* How many units are in the basket, beside what they come
                        to. This is where a cashier checks it against the goods
                        on the counter — up in the header it was nowhere near
                        the thing it counts. */}
                    {cart.length > 0 && (
                      <span className="bg-cyan-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-800">
                        {t("pos.itemsCount", {
                          count: cart.reduce((sum, item) => sum + item.quantity, 0),
                        })}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-slate-300">{currency(subtotal)}</span>
                </div>
                {voucherDiscount > 0 && (
                  <div className="flex justify-between gap-8 text-emerald-400">
                    <span className="font-mono text-xs">{voucher.code}</span>
                    <span className="tabular-nums">-{currency(voucherDiscount)}</span>
                  </div>
                )}
                {/* An offer the basket qualifies for, priced but NOT taken. The
                    total above it does not move until the cashier says so. */}
                {dealOffers.map((entry) => (
                  <button
                    key={`offer-${String(entry.dealId)}`}
                    type="button"
                    onClick={() => setEditingDeal(entry)}
                    className="flex w-full items-center justify-between gap-3 border border-dashed border-fuchsia-800 px-2 py-1.5 text-start transition hover:border-fuchsia-500 hover:bg-fuchsia-950/40"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-fuchsia-300">
                        <FiTag className="h-3 w-3 shrink-0" />
                        <span className="truncate text-xs font-semibold">
                          {entry.name}
                          {entry.sets > 1 ? ` ×${entry.sets}` : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {t("pos.deal.normal")} {currency(entry.normal)} →{" "}
                        <span className="text-slate-300">
                          {currency(entry.normal - entry.amount)}
                        </span>
                        {" · "}
                        {t("pos.deal.saving")} {currency(entry.amount)}
                      </span>
                    </span>
                    <span className="shrink-0 bg-fuchsia-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      {t("pos.deal.apply")}
                    </span>
                  </button>
                ))}
                {dealMatch.applied.map((entry) => {
                  const id = String(entry.dealId);
                  const given = dealSets[id] ?? entry.sets;

                  return (
                    <div
                      key={id}
                      className="border border-fuchsia-900/60 bg-fuchsia-950/20 px-2 py-1.5 text-fuchsia-400"
                    >
                      <div className="flex justify-between gap-4">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <FiTag className="h-3 w-3 shrink-0" />
                          {/* The name is the way in to re-pricing it: a till has
                              no room for a button per action, and the row itself
                              is what the cashier is already pointing at. */}
                          <button
                            type="button"
                            onClick={() => setEditingDeal(entry)}
                            title={t("pos.deal.editTitle", "Change the deal price")}
                            className="truncate text-start text-xs underline decoration-dotted underline-offset-2 hover:text-fuchsia-300"
                          >
                            {entry.name}
                          </button>
                          {entry.edited && (
                            <span className="shrink-0 bg-amber-900/60 px-1 text-[9px] font-bold uppercase text-amber-300">
                              {t("pos.deal.editedBadge", "edited")}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums">-{currency(entry.amount)}</span>
                          <button
                            type="button"
                            onClick={() => removeDeal(entry.dealId, entry.name)}
                            title={t("pos.deal.remove")}
                            aria-label={t("pos.deal.remove")}
                            className="px-1 text-slate-500 hover:text-red-400"
                          >
                            <FiX className="h-3 w-3" />
                          </button>
                        </span>
                      </div>

                      {/* Sets are changed in place. Wanting a second set used to
                          mean taking the whole offer off and giving it again,
                          which is two taps and a moment where the total is wrong
                          in front of the customer. */}
                      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setDealSetCount(id, given - 1)}
                          disabled={given <= 1}
                          className="bg-fuchsia-900/50 px-1.5 leading-5 text-fuchsia-200 hover:bg-fuchsia-800 disabled:opacity-30"
                          aria-label={t("pos.deal.fewerSets", "One set fewer")}
                        >
                          −
                        </button>
                        <span className="tabular-nums text-slate-300">
                          {t("pos.deal.setsGiven", "{{given}} of {{max}} sets", {
                            given,
                            max: entry.maxSets,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDealSetCount(id, given + 1)}
                          disabled={given >= entry.maxSets}
                          className="bg-fuchsia-900/50 px-1.5 leading-5 text-fuchsia-200 hover:bg-fuchsia-800 disabled:opacity-30"
                          aria-label={t("pos.deal.moreSets", "One set more")}
                        >
                          +
                        </button>
                        {given < entry.maxSets && (
                          <button
                            type="button"
                            onClick={() => setDealSetCount(id, entry.maxSets)}
                            className="ms-auto bg-fuchsia-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-fuchsia-600"
                          >
                            {t("pos.deal.applyRest", "Apply all {{n}}", {
                              n: entry.maxSets,
                            })}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                {/* What the return has already paid for. Shown against the
                    refund's own number, because it is the customer's money and
                    they can ask which return it came from. */}
                {creditApplied > 0 && (
                  <div className="flex justify-between gap-8 text-slate-500">
                    <span>
                      {t("pos.exchange.credit", "Refund credit")}{" "}
                      <span className="font-mono text-[10px] text-slate-600">
                        {refundCredit.reference}
                      </span>
                    </span>
                    <span className="tabular-nums text-emerald-400">
                      -{currency(creditApplied)}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 text-end">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                  {creditApplied > 0 ? t("pos.receiptDoc.totalDue", "Total due") : t("pos.total")}
                </p>
                <p className="font-display whitespace-nowrap text-2xl font-bold tabular-nums text-cyan-400 sm:text-3xl">
                  {currency(due)}
                </p>
                {/* The full price stays visible: the customer is buying a
                    €3.99 bottle, they are simply not paying €3.99 for it. */}
                {creditApplied > 0 && (
                  <p className="text-[11px] font-semibold text-slate-500">
                    {t("pos.total")} {currency(total)}
                  </p>
                )}
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
                        {deal.mode === "mix"
                          ? t("pos.dealMixItems", "Any {{n}} of {{count}} products", {
                              n: Math.max(2, Math.floor(Number(deal.groupQuantity || 0))),
                              count: (deal.items || []).length,
                            })
                          : (deal.items || [])
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
                      className="group relative flex flex-col gap-2 overflow-hidden border border-slate-800 bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 text-start transition hover:border-cyan-700 hover:from-slate-700 active:scale-[0.98] disabled:opacity-40"
                    >
                      {/* A ribbon across the corner rather than a band across
                          the middle: the corner is dead space, so the name and
                          the price underneath stay readable while the tile is
                          still unmistakably struck out. The tile clips the ends. */}
                      {stock <= 0 && (
                        <span className="pointer-events-none absolute -start-[38px] top-[16px] w-[130px] -rotate-45 bg-red-700 py-[3px] text-center text-[9px] font-bold uppercase tracking-wider text-white shadow-md">
                          {t("pos.tile.outOfStock", "Out of stock")}
                        </span>
                      )}
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
        <StatusBar
          user={Authuser}
          till={TILL}
          onPrint={printReceipt}
        />
      </div>

      {/* Printable receipt — everything else is hidden by the print stylesheet. */}
      {receipt && (
        <div id="receipt" className="hidden">
          {/* Stamped across the slip, the way a paid invoice is. A sale on
              account is the one that must not carry it — the customer is
              walking out owing the shop money, and a slip saying PAID is the
              thing that gets argued about later. */}
          <div className="r-stamp">
            {(receipt.payments || []).some((entry) => entry.method === "credit")
              ? t("pos.receiptDoc.unpaid", "CREDIT")
              : t("pos.receiptDoc.paid", "PAID")}
          </div>

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
            {/* Whoever rang it up, by name. The last resort used to be their
                ROLE, so a receipt could go out saying "staff" — which is not
                anybody, and is no use to a customer asking who served them. */}
            <span>
              {receipt.cashierName || Authuser?.name || t("pos.receiptDoc.cashier", "Cashier")}
            </span>
          </div>
          {receipt.customerName && receipt.customerName !== CUSTOMER_TYPES[0] && (
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
                <th className="r-num">{t("pos.receiptDoc.price")}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={String(item.product)}>
                  <td className="r-qty">{item.quantity}</td>
                  <td className="r-prod">{item.name}</td>
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
            <React.Fragment key={String(entry.dealId)}>
              <div className="r-line r-save">
                <span>
                  {entry.name}
                  {entry.sets > 1 ? ` ×${entry.sets}` : ""}
                </span>
                <span>−{currency(entry.amount)}</span>
              </div>
              {/* Which units the offer covered. Five items on a 3-for deal are
                  three at the deal and two at shelf price — a customer checking
                  the slip has to be able to see which were which. */}
              {(entry.items || []).map((item) => (
                <div className="r-line r-dealitem" key={String(item.product)}>
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span />
                </div>
              ))}
            </React.Fragment>
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

          {/* VAT breakdown. Printed even at 0%, because a receipt that shows
              its rate and its value is the one a customer can hand to their own
              accountant — and "no VAT on this" is itself a thing worth saying
              in writing. The rate this shop charges is the only band it has, so
              this is one row rather than a table of them. */}
          <div className="r-rule" />
          <div className="r-center r-strong">
            {t("pos.receiptDoc.vatBreakdown", "VAT breakdown")}
          </div>
          <div className="r-line r-vathead">
            <span>{t("pos.receiptDoc.vatRate", "VAT")}</span>
            <span>{t("pos.total")}</span>
            <span>{t("pos.receiptDoc.vatValue", "VAT value")}</span>
          </div>
          <div className="r-line r-vatrow">
            <span>
              {(Math.round(Number(receipt.taxRate || 0) * 10000) / 100).toFixed(2)}%
            </span>
            <span>{currency(receipt.total - (receipt.tax || 0))}</span>
            <span>{currency(receipt.tax || 0)}</span>
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

          {/* What is still owed. Zero on an ordinary sale, and the whole total
              on one sold on account — which is the line that makes a credit
              slip worth handing over at all. */}
          <div className="r-line r-strong">
            <span>{t("pos.receiptDoc.totalDue", "Total due")}</span>
            <span>
              {currency(
                (receipt.payments || []).some((entry) => entry.method === "credit")
                  ? receipt.total
                  : 0
              )}
            </span>
          </div>

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
              // Smaller with the rest of the receipt. A phone reads a 88px
              // code across a counter without trouble; the roll is what the
              // shop is paying for.
              size={88}
              level="M"
            />
          </div>

          {/* Where to find the shop when it is shut. Under the code, because
              that is the last thing a customer's eye lands on. */}
          {SHOP?.onlineStoreUrl && (
            <div className="r-center r-online">
              {t("pos.receiptDoc.onlineStore", {
                url: SHOP.onlineStoreUrl,
                defaultValue: "Visit our online store at {{url}}",
              })}
            </div>
          )}

          <div className="r-center r-footer">
            {SHOP?.footer || t("pos.receiptDoc.thanksShopping", "Thank you for shopping with us")}
          </div>
          <div className="r-center r-tail">• • •</div>
        </div>
      )}

      {/* Modals */}
      {modal === "search" && (
        <ProductSearchModal
          products={products}
          categories={categories}
          // Correcting the catalogue is an elevated action — the same rule the
          // server applies to PUT /product/editproduct.
          canEdit={isElevated}
          onPick={(product) => tapProduct(product)}
          // A saved edit only reaches the grid, the tiles and the basket prices
          // once the till refetches what it is selling from.
          onEdited={() => {
            dispatch(gettingallproducts({ view: "pos" }));
            dispatch(gettingallCategory());
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "payment" && (
        <PaymentModal
          // What is left to collect. A basket already covered by a refund
          // credit is settled the moment it opens.
          total={due}
          methods={paymentMethods}
          busy={isCheckingOut}
          onConfirm={checkout}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "refund" && (
        <RefundModal
          initialReceiptNo={refundReceiptNo}
          exchangeItems={exchangeItems}
          onPickExchange={() => setPickingExchange(true)}
          onSetExchangeQty={setExchangeQty}
          onRemoveExchange={removeExchangeItem}
          onDone={(replacements, credit) => {
            dispatch(gettingallproducts({ view: "pos" }));
            // What the refund is holding for the replacement. The basket shows
            // it and the sale spends it, so the customer pays the difference
            // rather than the full price of something they have already paid
            // for once.
            if (credit?.reference && Number(credit.amount) > 0) {
              setRefundCredit({
                reference: credit.reference,
                amount: Number(credit.amount),
              });
            }
            // The refund has gone through; the other half of the exchange is an
            // ordinary sale, so the replacements go into the basket and the
            // cashier charges for them the way they charge for anything else.
            (replacements || []).forEach((item) => {
              const product = products.find((entry) => entry._id === item.productId);
              if (product) addToCart(product, item.quantity);
            });
            if (replacements?.length) setPane("sale");
            setExchangeItems([]);
          }}
          onClose={() => {
            setModal(null);
            setExchangeItems([]);
          }}
        />
      )}

      {modal === "voucher" && (
        <VoucherModal
          subtotal={subtotal}
          applied={voucher}
          canGenerate={isElevated}
          categories={categories}
          symbol={currencySymbol()}
          discount={discount}
          discountType={discountType}
          onApply={setVoucher}
          onApplyDiscount={(value, type) => {
            setDiscount(value);
            setDiscountType(type);
          }}
          onRemove={() => setVoucher(null)}
          // A product added here has to reach the grid without a refresh —
          // the cashier added it to sell it, probably to the person waiting.
          onProductAdded={() => dispatch(gettingallproducts({ view: "pos" }))}
          onClose={() => setModal(null)}
        />
      )}


      {/* Stacked over the refund dialog, which stays mounted underneath so the
          lines and quantities the cashier already chose are still there. */}
      {pickingExchange && (
        <ProductSearchModal
          products={products}
          categories={categories}
          canEdit={false}
          onPick={(product) => addExchangeItem(product)}
          onClose={() => setPickingExchange(false)}
        />
      )}

      {modal === "refundHistory" && (
        <RefundHistoryModal
          onShowSales={() => setModal("history")}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "deals" && (
        <DealsModal
          onClose={() => {
            setModal(null);
            // A new or edited offer has to reach the basket that is open right
            // now, not the next one.
            dispatch(gettingallDeals());
          }}
        />
      )}

      {justSold && (
        <SaleCompleteModal
          receipt={justSold}
          onPrint={printReceipt}
          onClose={() => setJustSold(null)}
        />
      )}

      {/* The dialog reads the live entry, not the one that was tapped: changing
          how many sets to give reprices the offer underneath it. */}
      {editingDeal &&
        (() => {
          const id = String(editingDeal.dealId);
          const live =
            dealMatch.applied.find((e) => String(e.dealId) === id) ||
            dealOffers.find((e) => String(e.dealId) === id) ||
            editingDeal;

          // Every set the basket holds, each as the names in it. Asked at the
          // full count and with no lock, because the entry on screen only knows
          // about the sets currently being given — the dialog has to show the
          // ones on offer as well as the ones taken.
          const need = Math.max(
            2,
            Math.floor(
              Number(allDeals.find((d) => String(d._id) === id)?.groupQuantity || 0)
            )
          );
          const full = applicableDeals(
            cart,
            allDeals,
            [id],
            undefined,
            undefined,
            undefined,
            scanOrder
          ).applied[0];
          const nameOf = (productId) =>
            cart.find((line) => String(line.productId) === String(productId))?.name ||
            productId;
          const setPreview = Array.from({ length: full?.sets || 0 }, (_, i) =>
            (full.picked || []).slice(i * need, (i + 1) * need).map(nameOf)
          );

          return (
            <DealPriceModal
              entry={live}
              applied={appliedDealIds.includes(id)}
              sets={dealSets[id] ?? live.sets}
              setPreview={setPreview}
              onSets={(n) => setDealSetCount(id, n)}
              onApply={(price) => priceDeal(live, price)}
              onReset={() => resetDealPrice(id)}
              onClose={() => setEditingDeal(null)}
            />
          );
        })()}

      {modal === "history" && (
        <SaleHistoryModal
          canRefund={isElevated}
          onShowRefunds={() => setModal("refundHistory")}
          onReprint={(entry) => {
            setReceipt(entry);
            setModal(null);
            // After the state lands, so the roll carries the reprinted sale
            // rather than whatever was on screen before it.
            setTimeout(() => printSlip("receipt"), 100);
          }}
          onRefund={(receiptNo) => {
            setRefundReceiptNo(receiptNo);
            setModal("refund");
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "credit" && <CreditBookModal onClose={() => setModal(null)} />}

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
          categories={categories}
          onResolved={(product) => {
            setUnknownBarcode(null);
            dispatch(gettingallproducts({ view: "pos" }));
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
