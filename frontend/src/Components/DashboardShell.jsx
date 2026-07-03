import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { SidebarContext } from "../lib/SidebarContext";

/**
 * Responsive layout shared by all role dashboards.
 * - lg and up: sidebar is a fixed rail, content is offset by pl-64.
 * - below lg: sidebar slides in as a drawer over a dimmed overlay,
 *   toggled by the hamburger in TopNavbar; closes on route change.
 */
function DashboardShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle: () => setOpen((v) => !v) }}>
      <div className="flex min-h-screen bg-base-200">
        {/* Mobile overlay */}
        <div
          onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        {/* Sidebar: drawer on mobile, fixed rail on lg+.
            Uses logical `start`/`ps` so it flips to the right side under RTL. */}
        <div
          className={`fixed inset-y-0 start-0 z-50 transform transition-transform duration-300 lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
          }`}
        >
          <Sidebar />
        </div>

        {/* Content — min-w-0 lets inner tables scroll instead of overflowing */}
        <div className="min-w-0 flex-1 lg:ps-72">
          <Outlet />
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

export default DashboardShell;
