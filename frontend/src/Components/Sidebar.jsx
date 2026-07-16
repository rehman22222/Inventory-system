import React from "react";
import { AiOutlineProduct } from "react-icons/ai";
import { RiStockLine } from "react-icons/ri";
import { FiCheckSquare, FiCreditCard, FiInbox, FiLifeBuoy, FiLock, FiLogOut, FiShoppingCart, FiTag } from "react-icons/fi";
import { MdOutlineCategory, MdPointOfSale } from "react-icons/md";
import { TfiSupport } from "react-icons/tfi";
import { IoNotificationsOutline } from "react-icons/io5";
import { RxActivityLog, RxDashboard } from "react-icons/rx";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { LuUsers } from "react-icons/lu";
import { FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { logout } from "../features/authSlice";
import { useSidebar } from "../lib/SidebarContext";
import e360Logo from "../images/e360-logo.png";
import e360LogoDark from "../images/e360-logo-dark.png";

const dashboardPath = {
  superadmin: "/SuperAdmin",
  admin: "/AdminDashboard",
  manager: "/ManagerDashboard",
  staff: "/StaffDashboard",
};

// `label` is an i18n key under the `sidebar` namespace, resolved at render.
const menuByRole = {
  // The owner: the shop dashboard, the approvals queue admin raises requests
  // into, direct user management, the handed-over day closings, the support
  // inbox, and the till.
  superadmin: [
    { label: "sidebar.dashboard", path: "", icon: RxDashboard },
    { label: "sidebar.approvals", path: "approvals", icon: FiCheckSquare },
    { label: "sidebar.dayClosings", path: "day-closings", icon: FiLock },
    { label: "sidebar.users", path: "users", icon: LuUsers },
    { label: "sidebar.tickets", path: "tickets", icon: FiInbox },
    { label: "sidebar.pos", to: "/pos", icon: FiCreditCard },
  ],
  admin: [
    { label: "sidebar.dashboard", path: "", icon: RxDashboard },
    { label: "sidebar.pos", to: "/pos", icon: FiCreditCard },
    { label: "sidebar.products", path: "product", icon: AiOutlineProduct },
    { label: "sidebar.categories", path: "category", icon: MdOutlineCategory },
    { label: "sidebar.suppliers", path: "supplier", icon: TfiSupport },
    { label: "sidebar.sales", path: "sales", icon: MdPointOfSale },
    { label: "sidebar.dayClosings", path: "day-closings", icon: FiLock },
    { label: "sidebar.orders", path: "order", icon: FiShoppingCart },
    { label: "sidebar.vouchers", path: "vouchers", icon: FiTag },
    { label: "sidebar.stock", path: "stock-transaction", icon: RiStockLine },
    { label: "sidebar.notifications", path: "notifications", icon: IoNotificationsOutline },
    { label: "sidebar.users", path: "Userstatus", icon: LuUsers },
    { label: "sidebar.myRequests", path: "requests", icon: FiCheckSquare },
    { label: "sidebar.activityLog", path: "activity-log", icon: RxActivityLog },
    { label: "sidebar.support", path: "support", icon: FiLifeBuoy },
  ],
  manager: [
    { label: "sidebar.dashboard", path: "", icon: RxDashboard },
    { label: "sidebar.pos", to: "/pos", icon: FiCreditCard },
    { label: "sidebar.products", path: "product", icon: AiOutlineProduct },
    { label: "sidebar.categories", path: "category", icon: MdOutlineCategory },
    { label: "sidebar.suppliers", path: "supplier", icon: TfiSupport },
    { label: "sidebar.sales", path: "sales", icon: MdPointOfSale },
    { label: "sidebar.orders", path: "order", icon: FiShoppingCart },
    { label: "sidebar.vouchers", path: "vouchers", icon: FiTag },
    { label: "sidebar.stock", path: "stock-transaction", icon: RiStockLine },
    { label: "sidebar.notifications", path: "NotificationPageRead", icon: IoNotificationsOutline },
  ],
  // Staff work the till and nothing else.
  staff: [
    { label: "sidebar.dashboard", path: "", icon: RxDashboard },
    // POS opens as a standalone full-screen terminal (same tab, so browser Back works).
    { label: "sidebar.pos", to: "/pos", icon: FiCreditCard },
  ],
};

function Sidebar() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { Authuser } = useSelector((state) => state.auth);
  const { setOpen } = useSidebar();
  const role = Authuser?.role || "staff";
  const basePath = dashboardPath[role] || "/StaffDashboard";
  const menuItems = menuByRole[role] || menuByRole.staff;

  const handleLogout = async () => {
    dispatch(logout())
      .then(() => {
        toast.success(t("sidebar.loggedOut"));
        navigate("/");
      })
      .catch(() => {
        toast.error(t("sidebar.logoutError"));
      });
  };

  return (
    <div className="flex h-screen w-72 flex-col overflow-y-auto bg-base-100 border-r border-base-300 p-6 text-base-content shadow-md">
      <div className="relative mb-8 shrink-0">
        <img
          src={e360Logo}
          className="w-full object-contain dark:hidden"
          alt="E360 Inventory Suite by Eiretech"
        />
        <img
          src={e360LogoDark}
          className="hidden w-full object-contain dark:block"
          alt="E360 Inventory Suite by Eiretech"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute -right-2 -top-2 rounded-md bg-base-200 p-1.5 text-base-content/60 transition hover:bg-base-300 lg:hidden"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      <div className="mb-5 shrink-0 rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
        <p className="font-semibold text-base-content">{Authuser?.name || t("sidebar.user")}</p>
        <p className="mt-0.5 capitalize text-base-content/60">{role}</p>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          // `to` may be an absolute app path (e.g. the POS terminal) or a
          // dashboard-relative path built from basePath.
          const to = item.to || (item.path ? `${basePath}/${item.path}` : basePath);
          const isActive = location.pathname === to;

          return (
            <Link
              key={item.label}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
              }`}
            >
              <Icon className="shrink-0 text-lg" />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-4 flex shrink-0 items-center gap-3 rounded-lg border-t border-base-300 px-3 py-4 text-left text-sm font-semibold text-base-content/60 transition hover:text-red-500"
      >
        <FiLogOut className="text-lg" />
        {t("sidebar.logout")}
      </button>
    </div>
  );
}

export default Sidebar;
