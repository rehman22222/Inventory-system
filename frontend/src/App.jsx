import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ServicePage from "./pages/ServicePage";
import LoginPage from "./pages/LoginPage";
import Profilepage from "./pages/Profilepage";
import ManagerDashboard from "./pages/ManagerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import Productpage from "./pages/Productpage";
import Orderpage from "./pages/Orderpage";
import Salespage from "./pages/Salespage";
import POSPage from "./pages/POSPage";
import StockTransaction from "./pages/StockTransaction";
import Categorypage from "./pages/Categorypage";
import Notificationpage from "./pages/Notificationpage";
import Supplierpage from "./pages/Supplierpage";
import Activitylogpage from "./pages/Activitylogpage";
import Dashboardpage from "./pages/Dashboardpage";
import Userstatus from "./pages/Userstatus";
import Voucherpage from "./pages/Voucherpage";
import Supportpage from "./pages/Supportpage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminTickets from "./pages/SuperAdminTickets";
import MyRequestspage from "./pages/MyRequestspage";
import ApprovalsPage from "./pages/ApprovalsPage";
import DayClosingsPage from "./pages/DayClosingsPage";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import StorePage from "./pages/StorePage";
import GhostModePage from "./pages/GhostModePage";
import NotificationPageRead from "./pages/Notificationpageread";
import ProtectedRoute from "./lib/ProtectedRoute";
import { Toaster } from "react-hot-toast";

const protect = (element, allowedRoles) => (
  <ProtectedRoute element={element} allowedRoles={allowedRoles} />
);

function App() {
  return (
    <Router>
      <Toaster />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<ServicePage />} />
        <Route path="/LoginPage" element={<LoginPage />} />

        {/* Standalone full-screen POS terminal — opens outside the dashboard shell */}
        <Route path="/pos" element={protect(<POSPage />, ["superadmin", "admin", "manager", "staff"])} />

        <Route path="/AdminDashboard" element={protect(<AdminDashboard />, ["admin"])}>
          <Route index element={protect(<Dashboardpage />, ["admin"])} />
          <Route path="product" element={protect(<Productpage />, ["admin"])} />
          <Route path="category" element={protect(<Categorypage />, ["admin"])} />
          <Route path="supplier" element={protect(<Supplierpage />, ["admin"])} />
          <Route path="sales" element={protect(<Salespage />, ["admin"])} />
          <Route path="order" element={protect(<Orderpage />, ["admin"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["admin"])} />
          <Route path="vouchers" element={protect(<Voucherpage />, ["admin"])} />
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
          <Route path="NotificationPageRead" element={protect(<NotificationPageRead />, ["manager"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["manager"])} />
        </Route>

        {/* The owner console. Everything an admin can do, plus what only the
            owner can: approvals, direct user management, the support inbox, the
            shop's own details, and ghost mode. */}
        <Route path="/SuperAdmin" element={protect(<SuperAdminDashboard />, ["superadmin"])}>
          <Route index element={protect(<Dashboardpage />, ["superadmin"])} />
          {/* Owner-only */}
          <Route path="ghost" element={protect(<GhostModePage />, ["superadmin"])} />
          <Route path="store" element={protect(<StorePage />, ["superadmin"])} />
          <Route path="approvals" element={protect(<ApprovalsPage />, ["superadmin"])} />
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
    </Router>
  );
}

export default App;
