import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { FiArchive, FiChevronLeft, FiChevronRight, FiLock, FiTrash2 } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {gettingallproducts} from '../features/productSlice'
import FormattedTime from "../lib/FormattedTime ";
import {
  CreateSales,gettingallSales,EditSales, searchsalesdata
} from "../features/salesSlice";
import SalesChart from '../lib/Salesgraph';
import ReportButton from "../Components/ReportButton";
import DayClosingModal from "../Components/pos/DayClosingModal";
import { currency } from "../Components/pos/posUtils";
import toast from "react-hot-toast";
import SalesArchiveModal from "../Components/SalesArchiveModal";
import axiosInstance from "../lib/axios";
import { saleRowClass } from "./salesRowKind";



// Enough to scroll through, few enough that the browser lays them out at once.
const PAGE_SIZE = 50;

function Salespage() {
  const { t } = useTranslation();
  const { getallsales, searchdata } = useSelector((state) => state.sales);
  const { Authuser } = useSelector((state) => state.auth);

  // Two different questions, and they were being answered by one flag.
  //
  // Hand-editing takings is an owner/admin action — a manager works the till
  // and closes the day, they do not rewrite what a sale came to. The backend
  // enforces that on /sales/createsales and /sales/updatesales.
  //
  // Printing is not the same question. A manager already sees every sale on
  // this page, so withholding the download was not protecting anything; it just
  // meant the one person who has to hand a day's takings to the owner could not
  // produce them as a file.
  const canManageSales = ["admin", "superadmin"].includes(Authuser?.role);
  const canPrintSales = ["admin", "superadmin", "manager"].includes(Authuser?.role);

  /* Retiring sales is the owner's alone, not admin's.
   *
   * An admin edits one sale. This takes a run of them out of every report the
   * shop has and recounts days that were already signed off, which is a
   * different kind of act. The backend enforces it on the route; this only
   * decides whether the button is worth drawing.
   */
  const canArchiveSales = Authuser?.role === "superadmin";
  const [archiving, setArchiving] = useState(false);
  const [picked, setPicked] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const { getallproduct } = useSelector(
    (state) => state.product
  );
  const dispatch = useDispatch();
  const [query, setquery] = useState("");

  const [name, setName] = useState("");
  const [Product, setProduct] = useState("");
  const [Payment, setPayment] = useState("");
  const [Price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [paymentStatus , setpaymentStatus]=useState("");
  const[Status,setStatus]=useState("")
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedSales, setselectedSales] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // End-of-shift close, also available here (not just at the POS till).
  const [showCloseDay, setShowCloseDay] = useState(false);



  /* The ledger is fetched by the search effect below, which runs on mount
   * with an empty query and asks for the whole list. Fetching it here as
   * well pulled every sale in the shop down the wire twice before the page
   * drew anything. */
  useEffect(() => {
   dispatch(gettingallproducts({ view: "lookup" }))
  
  }, [dispatch]);

  /* The ledger's filters: what was sold (flavour / product, receipt or
   * customer), how it was paid, and when. One set of them drives the list,
   * the totals above it and the reports — what is downloaded is what is on
   * screen. The narrowing happens on the server (libs/salesFilters). */
  const [payment, setPaymentFilter] = useState("");
  // Report tender is explicit and independent of the on-screen list. This lets
  // an admin download Cash, Card and All for the same date range without
  // changing the ledger underneath between every file.
  const [reportPayment, setReportPayment] = useState("");
  const search = query.trim();
  const filtering = Boolean(search || payment || fromDate || toDate);
  const filters = { query: search, payment, from: fromDate, to: toDate };

  useEffect(() => {
    if (!filtering) {
      dispatch(gettingallSales());
      return undefined;
    }
    // Typing waits for a pause; a picked payment or date is asked at once.
    const wait = setTimeout(() => {
      dispatch(searchsalesdata({ query: search, payment, from: fromDate, to: toDate }));
    }, search ? 400 : 0);
    return () => clearTimeout(wait);
  }, [filtering, search, payment, fromDate, toDate, dispatch]);

  // After rows are archived, deleted or handed over: the chart reads the full
  // ledger and the list may be a filtered one, so both are asked again.
  const refreshSales = () => {
    dispatch(gettingallSales());
    if (filtering) dispatch(searchsalesdata(filters));
  };

  const clearFilters = () => {
    setquery("");
    setPaymentFilter("");
    setFromDate("");
    setToDate("");
  };

  const reportParams = {
    from: fromDate || undefined,
    to: toDate || undefined,
    q: search || undefined,
    payment: reportPayment || undefined,
  };


 
  
 


  

  
 const handleEditSubmit = (event) => {
  event.preventDefault();
  if (!selectedSales) return;

  const updatedData = {
    customerName: name,
    products: {
      product: Product, 
      quantity: Number(quantity),
      price: Number(Price)
    },
    paymentMethod: Payment,
    paymentStatus,
    status: Status
  };

  dispatch(EditSales({ salesId: selectedSales._id, updatedData }))
    .unwrap()
    .then(() => {
      toast.success(t("sales.updated"));
      setIsFormVisible(false);
      setselectedSales(null);
      resetForm();
    })
    .catch(() => {
      toast.error(t("sales.updateFail"));
    });
};


  const submitsales = async (event) => {
    event.preventDefault();
  
    const salesData = {
      customerName: name, 
      products: { product: Product, quantity, price: Price }, 
      paymentMethod: Payment, 
      paymentStatus,
      status: Status
    };
  
    dispatch(CreateSales(salesData))
      .unwrap()
      .then(() => {
        toast.success(t("sales.added"));
        resetForm();
      })
      .catch(() => {
        toast.error(t("sales.addFail"));
      });
  };
  




  const resetForm = () => {
    setName("");
    setProduct("");
    setPayment("");
    setPrice("");
    setQuantity("");
    setpaymentStatus("");
    setStatus("");

  };
  
  const handleEditClick = (sales) => {
    setselectedSales(sales);
    setName(sales.customerName);
    setProduct(sales.products?.product._id || "");
    setPayment(sales.paymentMethod);
    setPrice(sales.products?.price || "");
    setQuantity(sales.products?.quantity || "");
    setpaymentStatus(sales.paymentStatus);
    setStatus(sales.status);
    setIsFormVisible(true); 
  };






 const displaySales = filtering ? searchdata : getallsales;

  /* One page at a time.
   *
   * The table used to render every row the shop had ever rung - thousands of
   * them - which is what made this page take seconds to appear and sluggish
   * to scroll afterwards. The list itself is unchanged; only as much of it as
   * anybody can read at once is put into the DOM.
   *
   * Oldest first is the order the ledger is read in, so the LAST page is the
   * recent one, and that is where this opens. */
  const rows = Array.isArray(displaySales) ? displaySales : [];

  // The figures over the list: every row it holds, not just this page of it.
  const totals = rows.reduce(
    (sum, sale) => {
      const amount = Number(sale?.totalAmount) || 0;
      sum.count += 1;
      sum.total += amount;
      for (const part of sale.paymentBreakdown || [{ method: sale.paymentMethod, amount }]) {
        const key = { cash: "cash", creditcard: "card", credit: "credit" }[part.method] || "other";
        sum[key] += Number(part.amount) || 0;
      }
      return sum;
    },
    { count: 0, total: 0, cash: 0, card: 0, credit: 0, other: 0 },
  );
  const selectedTenderKey = { cash: "cash", card: "card", credit: "credit" }[payment];
  const displayedTotal = selectedTenderKey ? totals[selectedTenderKey] : totals.total;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(pages);
  }, [pages]);

  const safePage = Math.min(Math.max(1, page), pages);
  const firstRow = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(firstRow, firstRow + PAGE_SIZE);

  /* Destroying the ticked sales outright.
   *
   * No confirmation, by request: a till is proved before it goes live and
   * these rows are cleared many times a day. The tick boxes are the choosing
   * - the button does nothing until something is ticked, and says how many
   * it will take.
   *
   * The server resolves the selection the way archiving does, so a receipt
   * goes whole and a refund leaves with the sale it reverses. Stock is not
   * put back: the counts moved when the sales were rung. */
  const deletePicked = async () => {
    if (!picked.length || deleting) return;
    setDeleting(true);
    try {
      const { data } = await axiosInstance.post("sales/purge", {
        saleIds: picked,
        reason: "Deleted from the sales list",
      });
      toast.success(
        t("salesArchive.purgedRows", "{{n}} sale row(s) deleted for good", { n: data.sales }),
      );
      setPicked([]);
      refreshSales();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("salesArchive.purgeFailed", "Could not delete those sales"),
      );
    } finally {
      setDeleting(false);
    }
  };



  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />




      
      <div className="mt-12 ml-5">

        <SalesChart className=" mb-10" />

        {/* Sales history filters — the list, the totals and the reports below
            all follow these. */}
        <div className="mr-5 mb-6 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-base-content/60">
                {t("sales.filters.search", "Flavour / product, receipt or customer")}
              </label>
              <input
                value={query}
                onChange={(e) => setquery(e.target.value)}
                type="search"
                className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
                placeholder={t("sales.searchPlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">
                {t("sales.payment")}
              </label>
              <select
                value={payment}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
              >
                <option value="">{t("sales.filters.allPayments", "All payments")}</option>
                <option value="cash">{t("common.payments.cash")}</option>
                <option value="card">{t("common.payments.creditcard")}</option>
                <option value="split">{t("common.payments.split")}</option>
                <option value="credit">{t("common.payments.credit")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">{t("sales.from")}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">{t("sales.to")}</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
              />
            </div>
            {filtering && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-lg border-2 border-base-300 px-4 text-sm font-semibold text-base-content/70 transition hover:border-blue-800 hover:text-blue-800"
              >
                {t("sales.filters.clear", "Clear filters")}
              </button>
            )}
          </div>

          {/* What the filtered rows came to, by tender. */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              [t("sales.filters.count", "Sales"), String(totals.count)],
              [t("sales.filters.total", "Total"), currency(displayedTotal)],
              [t("common.payments.cash"), currency(totals.cash)],
              [t("common.payments.creditcard"), currency(totals.card)],
              [t("common.payments.credit"), currency(totals.credit)],
              [t("sales.paymentOther", "Other"), currency(totals.other)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-base-200 px-3 py-2">
                <div className="text-xs text-base-content/60">{label}</div>
                <div className="text-base font-semibold tabular-nums text-base-content">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales report — profit/loss download of the filtered sales above.
            Anyone who can see the sales below can print them. */}
        {canPrintSales && (
        <div className="mr-5 mb-8 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-base-content">{t("sales.reportTitle")}</h3>
              <p className="mt-1 text-sm text-base-content/60">
                {t("sales.reportSub")}
              </p>
              <p className="mt-1 text-xs font-medium text-blue-800">
                {t("sales.filters.reportNote", "Reports use the date/search above and the report payment selected here.")}
              </p>
            </div>
             <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-base-content/60">
                {t("sales.reportPayment", "Report payment")}
                <select
                  value={reportPayment}
                  onChange={(event) => setReportPayment(event.target.value)}
                  className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
                >
                  <option value="">{t("sales.filters.allPayments", "All payments")}</option>
                  <option value="cash">{t("common.payments.cash")}</option>
                  <option value="card">{t("common.payments.creditcard")}</option>
                </select>
              </label>
              <ReportButton
                reportKey="pos-sales"
                label="POS Report"
                params={reportParams}
              />
              <ReportButton
                reportKey="online-sales"
                label="Online Report"
                params={reportParams}
              />
              <ReportButton
                reportKey="combined-sales"
                label="POS + Online Report"
                params={reportParams}
              />
              <ReportButton
                reportKey="credit-sales"
                label="Credit Report"
                params={{ ...reportParams, payment: "credit" }}
              />
            </div>
          </div>
        </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {canManageSales && (
          <button
            onClick={() => {
              setIsFormVisible(true);
              setselectedSales(null);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("sales.addSales")}
          </button>
          )}
          {/* Close the day from here too — hands this cashier's open takings over
              (up the chain) and clears them from their own view. */}
          <button
            onClick={() => setShowCloseDay(true)}
            className="flex h-12 w-44 items-center justify-center rounded-lg border-2 border-blue-800 font-semibold text-blue-800 transition hover:bg-blue-800 hover:text-white"
          >
            <FiLock className="mr-2 text-lg" /> {t("sales.closeDay")}
          </button>
          {/* Retiring sales, in place of opening the database and deleting
              rows. Owner only — see canArchiveSales. */}
          {canArchiveSales && (
            <button
              onClick={() => setArchiving(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-base-300 px-4 font-semibold opacity-80 transition hover:border-error hover:text-error"
            >
              <FiArchive className="text-lg" />
              {t("salesArchive.button", "Archive sales")}
              {picked.length > 0 ? ` (${picked.length})` : ""}
            </button>
          )}
          {/* And destroying them, for the rows that were never trade. Dark
              until something is ticked, so it cannot be leaned on. */}
          {canArchiveSales && (
            <button
              onClick={deletePicked}
              disabled={picked.length === 0 || deleting}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-error px-4 font-semibold text-error transition hover:bg-error hover:text-white disabled:border-base-300 disabled:text-base-content/40 disabled:hover:bg-transparent"
            >
              <FiTrash2 className="text-lg" />
              {deleting
                ? t("salesArchive.purging", "Deleting...")
                : t("salesArchive.purgeRows", "Delete permanently")}
              {picked.length > 0 ? ` (${picked.length})` : ""}
            </button>
          )}
        </div>

        {archiving && (
          <SalesArchiveModal
            picked={picked}
            onClose={() => setArchiving(false)}
            onDone={() => {
              // The list, the chart and the revenue on this page all come from
              // the same fetch, so one refresh puts every figure on screen back
              // in step with what was just taken out of the books.
              setPicked([]);
              refreshSales();
            }}
          />
        )}

        {showCloseDay && (
          <DayClosingModal
            onClose={() => setShowCloseDay(false)}
            onClosed={() => {
              setShowCloseDay(false);
              // Closed rows leave this cashier's scope — refresh so the list and
              // revenue reset to their new (open) state.
              refreshSales();
            }}
          />
        )}

        {isFormVisible && (
          <div className="admin-drawer fixed right-0 top-0 z-50 flex h-svh w-full max-w-2xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedSales ? t("sales.editSales") : t("sales.addSales")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form
              onSubmit={selectedSales ? handleEditSubmit : submitsales}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <label className="text-sm">{t("common.name")}</label>
                    <input
                      value={name}
                      placeholder={t("sales.namePlaceholder")}
                      onChange={(e) => setName(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("sales.product")}</label>
                    <select
                      value={Product}
                      onChange={(e) => setProduct(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    >
                      <option value="">{t("sales.selectProduct")}</option>
                      {getallproduct?.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("common.price")}</label>
                    <input
                      type="number"
                      placeholder={t("sales.pricePlaceholder")}
                      value={Price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.quantity")}</label>
                    <input
                      type="number"
                      placeholder={t("sales.quantityPlaceholder")}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("sales.payment")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={Payment}
                      onChange={(e) => setPayment(e.target.value)}
                    >
                      <option value="">{t("sales.selectPayment")}</option>
                      <option value={"cash"}>{t("common.payments.cash")}</option>
                      <option value={"creditcard"}>{t("common.payments.creditcard")}</option>
                      {/* No wallet at this shop; kept only so an old wallet sale still shows its payment when edited. */}
                      {Payment === "wallet" && (
                        <option value={"wallet"}>{t("common.payments.wallet")}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("sales.paymentStatus")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={paymentStatus}
                      onChange={(e) => setpaymentStatus(e.target.value)}
                    >
                      <option value="">{t("sales.selectPaymentStatus")}</option>
                      <option value={"pending"}>{t("common.statuses.pending")}</option>
                      <option value={"paid"}>{t("common.statuses.paid")}</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("sales.statusLabel")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={Status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">{t("sales.selectStatus")}</option>
                      <option value={"pending"}>{t("common.statuses.pending")}</option>
                      <option value={"completed"}>{t("common.statuses.completed")}</option>
                      <option value={"cancelled"}>{t("common.statuses.cancelled")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedSales ? t("sales.editSalesBtn") : t("sales.addSalesBtn")}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{t("sales.salesList")}</h2>
            {/* A key for the row colours. Colour on its own is a code nobody
                was given, and it is also the one cue a colour-blind reader
                may not get at all — so the words are here beside it. */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {[
                { className: "bg-red-50 text-red-900", label: t("sales.legend.refund", "Refund") },
                { className: "bg-amber-50 text-amber-900", label: t("sales.legend.credit", "On credit") },
                { className: "bg-purple-50 text-purple-900", label: t("sales.legend.deal", "Deal applied") },
              ].map((entry) => (
                <span key={entry.label} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-3 w-3 rounded border border-base-300 ${entry.className}`}
                    aria-hidden="true"
                  />
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr>
                {canArchiveSales && (
                  <th className="px-3 py-2 border w-8 bg-base-100">
                    {/* All or nothing for what is on screen — which is the
                        filtered list, not the whole ledger. */}
                    <input
                      type="checkbox"
                      aria-label={t("salesArchive.tickAll", "Tick every sale shown")}
                      className="checkbox checkbox-xs"
                      checked={
                        pageRows.length > 0 &&
                        pageRows.every((row) => picked.includes(String(row?._id)))
                      }
                      onChange={(event) => {
                        const shown = pageRows.map((row) => String(row?._id));
                        setPicked((current) =>
                          event.target.checked
                            ? [...new Set([...current, ...shown])]
                            : current.filter((id) => !shown.includes(id)),
                        );
                      }}
                    />
                  </th>
                )}
                <th className="px-3 py-2 border w-5 bg-base-100">#</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.customerName")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.product")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.totalAmount")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.statusLabel")}</th>
                  <th className="px-3 py-2  border bg-base-100">{t("common.date")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.paymentMethod")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.paymentStatus")}</th>
                  {canManageSales && (
                    <th className="px-3 py-2  border bg-base-100">{t("common.operations")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-base-100">
                {pageRows.length > 0 ? (
                pageRows.map((sales,index) => (
                    <tr
                      key={sales?._id}
                      // Refund, credit or deal — see salesRowKind for the
                      // order they win in when a row is more than one.
                      className={saleRowClass(sales)}
                    >
                      {canArchiveSales && (
                        <td className="px-3 py-2 border">
                          <input
                            type="checkbox"
                            aria-label={t("salesArchive.tickOne", "Tick this sale")}
                            className="checkbox checkbox-xs"
                            checked={picked.includes(String(sales?._id))}
                            onChange={(event) =>
                              setPicked((current) =>
                                event.target.checked
                                  ? [...current, String(sales?._id)]
                                  : current.filter((id) => id !== String(sales?._id)),
                              )
                            }
                          />
                        </td>
                      )}
                       <td className="px-3 py-2 border">{firstRow + index + 1}</td>
                      <td className="px-3 py-2 border">{sales?.customerName
                      }</td>
                      <td className="px-3 py-2 border">
                      {sales.products?.product?.name || t("sales.noProduct")}
                      </td>
                      <td className="px-3 py-2 border">
                       {currency(sales?.totalAmount)}
                      </td>

                      <td className="px-3 py-2 border">
                        {sales?.status ? t(`common.statuses.${sales.status}`, sales.status) : ""}
                      </td>
                      <td className="px-3 py-2 border">< FormattedTime  timestamp={sales?.createdAt}/></td>
                      <td className="px-3 py-2 border">{sales.paymentBreakdown?.length ? sales.paymentBreakdown.map((part) => (
                        <div key={part.method} className="whitespace-nowrap text-sm">
                          {t(`common.payments.${part.method}`, part.method)}: <span className="font-medium tabular-nums">{currency(part.amount)}</span>
                        </div>
                      )) : (sales?.paymentMethod ? t(`common.payments.${sales.paymentMethod}`, sales.paymentMethod) : "")}</td>

                      <td className="px-3 py-2 border">
                        {sales?.paymentStatus ? t(`common.statuses.${sales.paymentStatus}`, sales.paymentStatus) : ""}
                      </td>

                      {canManageSales && (
                      <td className="px-4  py-2 border">
                        <button
                         onClick={()=> handleEditClick(sales)}
                          className="h-10 w-24 bg-green-500 ml-10 hover:bg-green-700 rounded-md text-white"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className=" bg-base-100 text-center py-4">
                      {t("sales.noSales")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 pb-6">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 rounded-lg border-2 border-base-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <FiChevronLeft /> {t("common.prev", "Previous")}
              </button>
              <span className="text-sm text-base-content/60">
                {t("sales.pageOf", "Page {{page}} of {{pages}} - {{rows}} sales", {
                  page: safePage,
                  pages,
                  rows: rows.length,
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                disabled={safePage >= pages}
                className="flex items-center gap-1 rounded-lg border-2 border-base-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {t("common.next", "Next")} <FiChevronRight />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



export default Salespage
