import React, { useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
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
      label: "Sales Revenue",
      value: currency.format(analytics.revenue),
      meta: `${analytics.sales.length} completed records`,
      icon: FiDollarSign,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    {
      label: "Inventory Value",
      value: currency.format(analytics.inventoryValue),
      meta: `${analytics.products.length} active products`,
      icon: FiBox,
      color: "text-cyan-700",
      bg: "bg-cyan-50",
    },
    {
      label: "Open Orders",
      value: analytics.orders.length,
      meta: `${analytics.orderStatus.pending || 0} pending review`,
      icon: FiShoppingCart,
      color: "text-indigo-700",
      bg: "bg-indigo-50",
    },
    {
      label: "Low Stock",
      value: analytics.lowStock.length,
      meta: "Items at or below 10 units",
      icon: FiAlertTriangle,
      color: "text-amber-700",
      bg: "bg-amber-50",
    },
  ];

  const statusRows = [
    { label: "Pending", value: analytics.orderStatus.pending || 0, color: "bg-amber-500" },
    { label: "Shipped", value: analytics.orderStatus.shipped || 0, color: "bg-cyan-500" },
    { label: "Delivered", value: analytics.orderStatus.delivered || 0, color: "bg-emerald-500" },
  ];
  const maxStatus = Math.max(...statusRows.map((row) => row.value), 1);

  return (
    <div className="min-h-screen bg-slate-100">
      <TopNavbar />

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <section className="mb-6 overflow-hidden rounded-lg bg-slate-950 text-white shadow-sm">
          <div className="grid gap-6 p-7 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
                Live Inventory Overview
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">
                Dashboard analytics
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                A quick operational view of stock health, revenue, orders, users, and recent
                inventory activity.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-white/10 bg-white/5 p-4">
                <FiUsers className="mb-3 text-cyan-300" />
                <p className="text-2xl font-bold">{analytics.users}</p>
                <p className="text-xs text-slate-300">Team users</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-4">
                <FiLayers className="mb-3 text-emerald-300" />
                <p className="text-2xl font-bold">{analytics.categories.length}</p>
                <p className="text-xs text-slate-300">Categories</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-4">
                <FiTrendingUp className="mb-3 text-amber-300" />
                <p className="text-2xl font-bold">{analytics.sales.length}</p>
                <p className="text-xs text-slate-300">Sales records</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-950">{item.value}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.meta}</p>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-md ${item.bg}`}>
                    <Icon className={`text-xl ${item.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Gettopproduct />

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
                  Order Pipeline
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Status breakdown</h2>
              </div>
              <FiShoppingCart className="text-2xl text-slate-400" />
            </div>

            <div className="space-y-5">
              {statusRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className="font-semibold text-slate-950">{row.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${row.color}`}
                      style={{ width: `${Math.max((row.value / maxStatus) * 100, row.value ? 12 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-md bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-600">Recommended focus</p>
              <p className="mt-1 text-sm text-slate-500">
                Review pending orders and replenish low-stock products before the next sales cycle.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
                  Stock Watchlist
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Low inventory items</h2>
              </div>
              <FiAlertTriangle className="text-2xl text-amber-500" />
            </div>

            <div className="space-y-3">
              {analytics.lowStock.length > 0 ? (
                analytics.lowStock.map((product) => (
                  <div
                    key={product._id}
                    className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-sm text-slate-500">{product.Category?.name || "Uncategorized"}</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                      {product.quantity} left
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-700">
                  All products are above the low-stock threshold.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500">
                  Audit Trail
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Recent activity</h2>
              </div>
              <FiActivity className="text-2xl text-cyan-600" />
            </div>

            <div className="space-y-4">
              {recentuser?.length > 0 ? (
                recentuser.map((log) => (
                  <div key={log._id} className="flex gap-4 rounded-md border border-slate-100 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-50">
                      <FiActivity className="text-cyan-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-950">{log.action}</p>
                          <p className="mt-1 text-sm text-slate-500">{log.description}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {log.entity}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <FiClock />
                        <span>{log.userId?.name || "System"}</span>
                        <span>-</span>
                        <FormattedTime timestamp={log.createdAt} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
                  No recent activity logs found.
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
