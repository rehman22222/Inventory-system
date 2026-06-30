import React from "react";
import { AiOutlineProduct } from "react-icons/ai";
import { RiStockLine } from "react-icons/ri";
import { FiCreditCard, FiLogOut, FiShoppingCart } from "react-icons/fi";
import { MdOutlineCategory, MdPointOfSale } from "react-icons/md";
import { TfiSupport } from "react-icons/tfi";
import { IoNotificationsOutline } from "react-icons/io5";
import { RxActivityLog, RxDashboard } from "react-icons/rx";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { LuUsers } from "react-icons/lu";
import toast from "react-hot-toast";
import { logout } from "../features/authSlice";
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
  const { Authuser } = useSelector((state) => state.auth);
  const role = Authuser?.role || "staff";
  const basePath = dashboardPath[role] || "/StaffDashboard";
  const menuItems = menuByRole[role] || menuByRole.staff;

  const handleLogout = async () => {
    dispatch(logout())
      .then(() => {
        toast.success("Logout successfully");
        navigate("/");
      })
      .catch(() => {
        toast.error("Error in logout");
      });
  };

  return (
    <div className="flex h-screen w-64 flex-col overflow-y-auto bg-slate-100 p-6 text-slate-700 shadow-lg">
      <div className="mb-10 shrink-0 bg-slate-950 p-4">
        <img src={logo1} className="w-48 bg-white" alt="Inventory logo" />
      </div>

      <div className="mb-5 shrink-0 rounded-md bg-white p-3 text-sm shadow-sm">
        <p className="font-semibold text-slate-950">{Authuser?.name || "User"}</p>
        <p className="capitalize text-slate-500">{role}</p>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const to = item.path ? `${basePath}/${item.path}` : basePath;

          return (
            <Link
              key={item.label}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition hover:bg-white hover:text-cyan-700 hover:shadow-sm"
            >
              <Icon className="text-lg" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-4 flex shrink-0 items-center gap-3 rounded-md border-t border-slate-200 px-3 py-4 text-left text-sm font-semibold text-slate-600 transition hover:text-red-600"
      >
        <FiLogOut className="text-lg" />
        Logout
      </button>
    </div>
  );
}

export default Sidebar;
