import React, { useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  FiActivity,
  FiAlertTriangle,
  FiBox,
  FiClock,
  FiDollarSign,
  FiLayers,
  FiShoppingCart,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import Gettopproduct from "../lib/Gettopproduct";
import TopNavbar from "../Components/TopNavbar";
import { getrecentActivityLogs } from "../features/activitySlice";
import { adminUser, managerUser, staffUser } from "../features/authSlice";
import { gettingallproducts } from "../features/productSlice";
import { gettingallCategory } from "../features/categorySlice";
import { gettingallOrder } from "../features/orderSlice";
import { gettingallSales } from "../features/salesSlice";
import FormattedTime from "../lib/FormattedTime ";
import { io } from "socket.io-client";
import { socketURL } from "../lib/socket";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function Dashboardpage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { staffuser, manageruser, adminuser } = useSelector((state) => state.auth);
  const { recentuser } = useSelector((state) => state.activity);
  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { getorder } = useSelector((state) => state.order);
  const { getallsales } = useSelector((state) => state.sales);

  useEffect(() => {
    dispatch(staffUser());
    dispatch(managerUser());
    dispatch(adminUser());
    dispatch(gettingallproducts());
    dispatch(gettingallCategory());
    dispatch(gettingallOrder());
    dispatch(gettingallSales());
    dispatch(getrecentActivityLogs());

    const socket = io(socketURL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("newActivityLog", () => {
      dispatch(getrecentActivityLogs());
    });

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);

  const analytics = useMemo(() => {
    const products = Array.isArray(getallproduct) ? getallproduct : [];
    const orders = Array.isArray(getorder) ? getorder : [];
    const sales = Array.isArray(getallsales) ? getallsales : [];
    const categories = Array.isArray(getallCategory) ? getallCategory : [];
    const lowStock = products.filter((product) => Number(product.quantity) <= 10);
    const inventoryValue = products.reduce(
      (sum, product) => sum + Number(product.Price || 0) * Number(product.quantity || 0),
      0
    );
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const orderStatus = orders.reduce(
      (acc, order) => ({
        ...acc,
        [order.status || "pending"]: (acc[order.status || "pending"] || 0) + 1,
      }),
      {}
    );

    return {
      products,
      orders,
      sales,
      categories,
      lowStock,
      inventoryValue,
      revenue,
      orderStatus,
      users:
        Number(staffuser?.length || 0) +
        Number(manageruser?.length || 0) +
        Number(adminuser?.length || 0),
    };
  }, [adminuser, getallCategory, getallproduct, getallsales, getorder, manageruser, staffuser]);

  const kpis = [
    {
      label: t("dashboard.salesRevenue"),
      value: currency.format(analytics.revenue),
      meta: t("dashboard.completedRecords", { count: analytics.sales.length }),
      icon: FiDollarSign,
      color: "text-emerald-700 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: t("dashboard.inventoryValue"),
      value: currency.format(analytics.inventoryValue),
      meta: t("dashboard.activeProducts", { count: analytics.products.length }),
      icon: FiBox,
      color: "text-cyan-700 dark:text-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-900/20",
    },
    {
      label: t("dashboard.openOrders"),
      value: analytics.orders.length,
      meta: t("dashboard.pendingReview", { count: analytics.orderStatus.pending || 0 }),
      icon: FiShoppingCart,
      color: "text-indigo-700 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
    {
      label: t("dashboard.lowStock"),
      value: analytics.lowStock.length,
      meta: t("dashboard.lowStockMeta"),
      icon: FiAlertTriangle,
      color: "text-amber-700 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  const statusRows = [
    { label: t("dashboard.pending"), value: analytics.orderStatus.pending || 0, color: "bg-amber-500" },
    { label: t("dashboard.shipped"), value: analytics.orderStatus.shipped || 0, color: "bg-cyan-500" },
    { label: t("dashboard.delivered"), value: analytics.orderStatus.delivered || 0, color: "bg-emerald-500" },
  ];
  const maxStatus = Math.max(...statusRows.map((row) => row.value), 1);

  return (
    <div className="min-h-screen bg-base-200">
      <TopNavbar />

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        {/* Hero banner — always dark by design */}
        <section className="mb-6 overflow-hidden rounded-xl bg-slate-950 text-white shadow-sm">
          <div className="grid gap-6 p-7 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
                {t("dashboard.overviewLabel")}
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
                {t("dashboard.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {t("dashboard.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <FiUsers className="mb-3 text-cyan-300" />
                <p className="text-2xl font-bold">{analytics.users}</p>
                <p className="text-xs text-slate-300">{t("dashboard.teamUsers")}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <FiLayers className="mb-3 text-emerald-300" />
                <p className="text-2xl font-bold">{analytics.categories.length}</p>
                <p className="text-xs text-slate-300">{t("dashboard.categories")}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <FiTrendingUp className="mb-3 text-amber-300" />
                <p className="text-2xl font-bold">{analytics.sales.length}</p>
                <p className="text-xs text-slate-300">{t("dashboard.salesRecords")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* KPI cards */}
        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-base-content/60">{item.label}</p>
                    <p className="mt-3 text-2xl font-bold text-base-content">{item.value}</p>
                    <p className="mt-2 text-xs text-base-content/50">{item.meta}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg ${item.bg}`}
                  >
                    <Icon className={`text-xl ${item.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Charts row */}
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Gettopproduct />

          <div className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-base-content/50">
                  {t("dashboard.orderPipeline")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">{t("dashboard.statusBreakdown")}</h2>
              </div>
              <FiShoppingCart className="text-2xl text-base-content/30" />
            </div>

            <div className="space-y-5">
              {statusRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-base-content/70">{row.label}</span>
                    <span className="font-semibold text-base-content">{row.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-base-300">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{
                        width: `${Math.max((row.value / maxStatus) * 100, row.value ? 12 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-lg bg-base-200 p-4">
              <p className="text-sm font-medium text-base-content/70">{t("dashboard.recommendedFocus")}</p>
              <p className="mt-1 text-sm text-base-content/50">
                {t("dashboard.recommendedFocusText")}
              </p>
            </div>
          </div>
        </section>

        {/* Bottom row */}
        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {/* Low stock watchlist */}
          <div className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-base-content/50">
                  {t("dashboard.stockWatchlist")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">
                  {t("dashboard.lowInventoryItems")}
                </h2>
              </div>
              <FiAlertTriangle className="text-2xl text-amber-500" />
            </div>

            <div className="space-y-3">
              {analytics.lowStock.length > 0 ? (
                analytics.lowStock.map((product) => (
                  <div
                    key={product._id}
                    className="flex items-center justify-between rounded-lg border border-base-300 bg-base-200 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-base-content">{product.name}</p>
                      <p className="text-sm text-base-content/50">
                        {product.Category?.name || t("dashboard.uncategorized")}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      {t("dashboard.left", { count: product.quantity })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                  {t("dashboard.allAboveThreshold")}
                </p>
              )}
            </div>
          </div>

          {/* Activity log */}
          <div className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-base-content/50">
                  {t("dashboard.auditTrail")}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">{t("dashboard.recentActivity")}</h2>
              </div>
              <FiActivity className="text-2xl text-cyan-500" />
            </div>

            <div className="space-y-4">
              {recentuser?.length > 0 ? (
                recentuser.map((log) => (
                  <div
                    key={log._id}
                    className="flex gap-4 rounded-lg border border-base-300 bg-base-200 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50 dark:bg-cyan-900/20">
                      <FiActivity className="text-cyan-700 dark:text-cyan-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-base-content">{log.action}</p>
                          <p className="mt-1 text-sm text-base-content/50">{log.description}</p>
                        </div>
                        <span className="rounded-full bg-base-300 px-3 py-1 text-xs font-medium text-base-content/70">
                          {log.entity}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-base-content/50">
                        <FiClock />
                        <span>{log.userId?.name || t("dashboard.system")}</span>
                        <span>-</span>
                        <FormattedTime timestamp={log.createdAt} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg bg-base-200 p-4 text-sm text-base-content/50">
                  {t("dashboard.noRecentLogs")}
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboardpage;
