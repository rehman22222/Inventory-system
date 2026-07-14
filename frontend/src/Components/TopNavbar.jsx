import React from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiMenu } from "react-icons/fi";
import image from "../images/user.png";
import ThemeToggle from "../lib/ThemeToggle";
import { useSidebar } from "../lib/SidebarContext";
import { Link } from "react-router-dom";

function TopNavbar() {
  const { t } = useTranslation();
  const { Authuser } = useSelector((state) => state.auth);
  const { toggle } = useSidebar();
  const dashboardByRole = {
    superadmin: "/SuperAdmin",
    admin: "/AdminDashboard",
    manager: "/ManagerDashboard",
    staff: "/StaffDashboard",
  };
  const dashboardPath = dashboardByRole[Authuser?.role] || "/ManagerDashboard";

  return (
    <div className="bg-base-100 border-b border-base-300">
      <nav className="flex h-16 w-full items-center justify-between px-4 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label="Open menu"
            className="rounded-lg p-2 text-base-content transition hover:bg-base-200 lg:hidden"
          >
            <FiMenu className="text-xl" />
          </button>
          <h1 className="truncate text-base font-semibold text-base-content sm:text-lg">
            {t("topnav.welcome", { name: Authuser?.name || t("topnav.guest") })}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />

          <Link
            to={`${dashboardPath}/Profilepage`}
            className="flex items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-base-200"
          >
            <img
              className="h-9 w-9 rounded-full border-2 border-primary object-cover"
              src={Authuser?.ProfilePic || image}
              alt="Profile"
            />
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-base-content leading-tight">
                {Authuser?.name || t("topnav.guest")}
              </p>
              <p className="text-xs capitalize text-base-content/60">
                {Authuser?.role || t("topnav.visitor")}
              </p>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}

export default TopNavbar;
