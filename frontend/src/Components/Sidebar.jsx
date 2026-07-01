import React from "react";
import { AiOutlineProduct } from "react-icons/ai";
import { RiStockLine } from "react-icons/ri";
import { FiCreditCard, FiLogOut, FiShoppingCart } from "react-icons/fi";
import { MdOutlineCategory, MdPointOfSale } from "react-icons/md";
import { TfiSupport } from "react-icons/tfi";
import { IoNotificationsOutline } from "react-icons/io5";
import { RxActivityLog, RxDashboard } from "react-icons/rx";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuUsers } from "react-icons/lu";
import { FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { logout } from "../features/authSlice";
import { useSidebar } from "../lib/SidebarContext";
import logo1 from "../images/logo1.png";

const dashboardPath = {
  admin: "/AdminDashboard",
  manager: "/ManagerDashboard",
  staff: "/StaffDashboard",
};

const menuByRole = {
  admin: [
    { label: "Dashboard", path: "", icon: RxDashboard },
    { label: "Products", path: "product", icon: AiOutlineProduct },
    { label: "Categories", path: "category", icon: MdOutlineCategory },
    { label: "Suppliers", path: "supplier", icon: TfiSupport },
    { label: "Sales", path: "sales", icon: MdPointOfSale },
    { label: "Orders", path: "order", icon: FiShoppingCart },
    { label: "Stock", path: "stock-transaction", icon: RiStockLine },
    { label: "Notifications", path: "notifications", icon: IoNotificationsOutline },
    { label: "Users", path: "Userstatus", icon: LuUsers },
    { label: "Activity Log", path: "activity-log", icon: RxActivityLog },
  ],
  manager: [
    { label: "Dashboard", path: "", icon: RxDashboard },
    { label: "Products", path: "product", icon: AiOutlineProduct },
    { label: "Categories", path: "category", icon: MdOutlineCategory },
    { label: "Suppliers", path: "supplier", icon: TfiSupport },
    { label: "Sales", path: "sales", icon: MdPointOfSale },
    { label: "Orders", path: "order", icon: FiShoppingCart },
    { label: "Stock", path: "stock-transaction", icon: RiStockLine },
    { label: "Notifications", path: "NotificationPageRead", icon: IoNotificationsOutline },
  ],
  staff: [
    { label: "Dashboard", path: "", icon: RxDashboard },
    { label: "POS", path: "pos", icon: FiCreditCard },
    { label: "Sales", path: "sales", icon: MdPointOfSale },
    { label: "Orders", path: "order", icon: FiShoppingCart },
    { label: "Stock", path: "stock-transaction", icon: RiStockLine },
    { label: "Notifications", path: "NotificationPageRead", icon: IoNotificationsOutline },
  ],
};

function Sidebar() {
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
        toast.success("Logged out successfully");
        navigate("/");
      })
      .catch(() => {
        toast.error("Error logging out");
      });
  };

  return (
    <div className="flex h-screen w-64 flex-col overflow-y-auto bg-base-100 border-r border-base-300 p-6 text-base-content shadow-md">
      <div className="relative mb-8 shrink-0 overflow-hidden rounded-lg bg-slate-950 p-4">
        <img src={logo1} className="w-full bg-white" alt="Inventory logo" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-2 top-2 rounded-md bg-black/30 p-1.5 text-white transition hover:bg-black/50 lg:hidden"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      <div className="mb-5 shrink-0 rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
        <p className="font-semibold text-base-content">{Authuser?.name || "User"}</p>
        <p className="mt-0.5 capitalize text-base-content/60">{role}</p>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const to = item.path ? `${basePath}/${item.path}` : basePath;
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
              <span>{item.label}</span>
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
        Logout
      </button>
    </div>
  );
}

export default Sidebar;
