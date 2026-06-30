import React from "react";
import { useSelector } from "react-redux";
import image from "../images/user.png";
import ThemeToggle from "../lib/ThemeToggle";
import { Link } from "react-router-dom";

function TopNavbar() {
  const { Authuser } = useSelector((state) => state.auth);
  const dashboardPath =
    Authuser?.role === "admin"
      ? "/AdminDashboard"
      : Authuser?.role === "staff"
      ? "/StaffDashboard"
      : "/ManagerDashboard";

  return (
    <div className="bg-base-100 border-b border-base-300">
      <nav className="flex h-16 w-full items-center justify-between px-6 shadow-sm">
        <h1 className="text-lg font-semibold text-base-content">
          Welcome, {Authuser?.name || "Guest"}
        </h1>

        <div className="flex items-center gap-4">
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
                {Authuser?.name || "Guest"}
              </p>
              <p className="text-xs capitalize text-base-content/60">
                {Authuser?.role || "Visitor"}
              </p>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}

export default TopNavbar;
