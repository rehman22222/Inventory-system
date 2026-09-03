import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster } from "react-hot-toast";
import VirtualKeyboard from "./Components/VirtualKeyboard";
import SessionExpiryGuard from "./Components/SessionExpiryGuard";
// Public + always-needed pieces load eagerly; everything behind auth is
// code-split so the first paint (landing/login) ships a small bundle and each
// dashboard page is fetched only when a user actually opens it.
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./lib/ProtectedRoute";

const ServicePage = lazy(() => import("./pages/ServicePage"));
const Profilepage = lazy(() => import("./pages/Profilepage"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const Productpage = lazy(() => import("./pages/Productpage"));
const Orderpage = lazy(() => import("./pages/Orderpage"));
const Salespage = lazy(() => import("./pages/Salespage"));
const POSPage = lazy(() => import("./pages/POSPage"));
const StockTransaction = lazy(() => import("./pages/StockTransaction"));
const Categorypage = lazy(() => import("./pages/Categorypage"));
const Notificationpage = lazy(() => import("./pages/Notificationpage"));
const Supplierpage = lazy(() => import("./pages/Supplierpage"));
const Activitylogpage = lazy(() => import("./pages/Activitylogpage"));
const Dashboardpage = lazy(() => import("./pages/Dashboardpage"));
const Userstatus = lazy(() => import("./pages/Userstatus"));
const Voucherpage = lazy(() => import("./pages/Voucherpage"));
const Supportpage = lazy(() => import("./pages/Supportpage"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminTickets = lazy(() => import("./pages/SuperAdminTickets"));
const MyRequestspage = lazy(() => import("./pages/MyRequestspage"));
const ApprovalsPage = lazy(() => import("./pages/ApprovalsPage"));
const DayClosingsPage = lazy(() => import("./pages/DayClosingsPage"));
const Reorderspage = lazy(() => import("./pages/Reorderspage"));
const SuperAdminUsers = lazy(() => import("./pages/SuperAdminUsers"));
const StorePage = lazy(() => import("./pages/StorePage"));
const GhostModePage = lazy(() => import("./pages/GhostModePage"));
const NotificationPageRead = lazy(() => import("./pages/Notificationpageread"));
const OnlineStorePage = lazy(() => import("./pages/OnlineStorePage"));

const protect = (element, allowedRoles) => (
  <ProtectedRoute element={element} allowedRoles={allowedRoles} />
);

// Shown briefly while a code-split page chunk loads.
const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-base-200">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-base-300 border-t-primary" />
  </div>
);

function App() {
  return (
    <Router>
      <Toaster />
      <SessionExpiryGuard />
      <VirtualKeyboard />
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* This deployment is one shop's back office, not a product website:
            the marketing page sat between the staff and the thing they came
            for. Sign-in IS the front door now. /LoginPage stays a real route
            because the session guard redirects there by path. */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/LoginPage" element={<LoginPage />} />
        <Route path="/about" element={<ServicePage />} />

        {/* Standalone full-screen POS terminal — opens outside the dashboard shell */}
        <Route path="/pos" element={protect(<POSPage />, ["superadmin", "admin", "manager", "staff"])} />

        <Route path="/ReportDashboard" element={protect(<SuperAdminDashboard />, ["report"])}>
          <Route index element={protect(<GhostModePage />, ["report"])} />
        </Route>

        <Route path="/AdminDashboard" element={protect(<AdminDashboard />, ["admin"])}>
          <Route index element={protect(<Dashboardpage />, ["admin"])} />
          <Route path="product" element={protect(<Productpage />, ["admin"])} />
          <Route path="category" element={protect(<Categorypage />, ["admin"])} />
          <Route path="supplier" element={protect(<Supplierpage />, ["admin"])} />
          <Route path="sales" element={protect(<Salespage />, ["admin"])} />
          <Route path="order" element={protect(<Orderpage />, ["admin"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["admin"])} />
          <Route path="vouchers" element={protect(<Voucherpage />, ["admin"])} />
          <Route path="reorders" element={protect(<Reorderspage />, ["admin"])} />
          <Route path="store" element={protect(<StorePage />, ["admin"])} />
          <Route path="online-store" element={protect(<OnlineStorePage />, ["admin"])} />
          <Route path="day-closings" element={protect(<DayClosingsPage />, ["admin"])} />
          <Route path="support" element={protect(<Supportpage />, ["admin"])} />
          <Route path="notifications" element={protect(<Notificationpage />, ["admin"])} />
          <Route path="Userstatus" element={protect(<Userstatus />, ["admin"])} />
          <Route path="requests" element={protect(<MyRequestspage />, ["admin"])} />
          <Route path="activity-log" element={protect(<Activitylogpage />, ["admin"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["admin"])} />
        </Route>

        <Route path="/ManagerDashboard" element={protect(<ManagerDashboard />, ["manager"])}>
          <Route index element={protect(<Dashboardpage />, ["manager"])} />
          <Route path="product" element={protect(<Productpage />, ["manager"])} />
          <Route path="category" element={protect(<Categorypage />, ["manager"])} />
          <Route path="supplier" element={protect(<Supplierpage />, ["manager"])} />
          <Route path="sales" element={protect(<Salespage />, ["manager"])} />
          <Route path="order" element={protect(<Orderpage />, ["manager"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["manager"])} />
          <Route path="vouchers" element={protect(<Voucherpage />, ["manager"])} />
          <Route path="day-closings" element={protect(<DayClosingsPage />, ["manager"])} />
          <Route path="NotificationPageRead" element={protect(<NotificationPageRead />, ["manager"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["manager"])} />
        </Route>

        {/* The owner console. Everything an admin can do, plus what only the
            owner can: approvals, direct user management, the support inbox, the
            shop's own details. */}
        <Route path="/SuperAdmin" element={protect(<SuperAdminDashboard />, ["superadmin"])}>
          <Route index element={protect(<Dashboardpage />, ["superadmin"])} />
          {/* Owner-only */}
          <Route path="store" element={protect(<StorePage />, ["superadmin"])} />
          <Route path="online-store" element={protect(<OnlineStorePage />, ["superadmin"])} />
          <Route path="approvals" element={protect(<ApprovalsPage />, ["superadmin"])} />
          <Route path="reorders" element={protect(<Reorderspage />, ["superadmin"])} />
          <Route path="day-closings" element={protect(<DayClosingsPage />, ["superadmin"])} />
          <Route path="users" element={protect(<SuperAdminUsers />, ["superadmin"])} />
          <Route path="tickets" element={protect(<SuperAdminTickets />, ["superadmin"])} />
          {/* The full shop, same as admin */}
          <Route path="product" element={protect(<Productpage />, ["superadmin"])} />
          <Route path="category" element={protect(<Categorypage />, ["superadmin"])} />
          <Route path="supplier" element={protect(<Supplierpage />, ["superadmin"])} />
          <Route path="sales" element={protect(<Salespage />, ["superadmin"])} />
          <Route path="order" element={protect(<Orderpage />, ["superadmin"])} />
          <Route path="vouchers" element={protect(<Voucherpage />, ["superadmin"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["superadmin"])} />
          <Route path="notifications" element={protect(<Notificationpage />, ["superadmin"])} />
          <Route path="activity-log" element={protect(<Activitylogpage />, ["superadmin"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["superadmin"])} />
        </Route>

        {/* Staff only get the dashboard, the till, and their own profile. */}
        <Route path="/StaffDashboard" element={protect(<StaffDashboard />, ["staff"])}>
          <Route index element={protect(<Dashboardpage />, ["staff"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["staff"])} />
        </Route>
      </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
