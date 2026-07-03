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
        <Route path="/pos" element={protect(<POSPage />, ["admin", "manager", "staff"])} />

        <Route path="/AdminDashboard" element={protect(<AdminDashboard />, ["admin"])}>
          <Route index element={protect(<Dashboardpage />, ["admin"])} />
          <Route path="product" element={protect(<Productpage />, ["admin"])} />
          <Route path="category" element={protect(<Categorypage />, ["admin"])} />
          <Route path="supplier" element={protect(<Supplierpage />, ["admin"])} />
          <Route path="sales" element={protect(<Salespage />, ["admin"])} />
          <Route path="order" element={protect(<Orderpage />, ["admin"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["admin"])} />
          <Route path="notifications" element={protect(<Notificationpage />, ["admin"])} />
          <Route path="Userstatus" element={protect(<Userstatus />, ["admin"])} />
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
          <Route path="NotificationPageRead" element={protect(<NotificationPageRead />, ["manager"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["manager"])} />
        </Route>

        <Route path="/StaffDashboard" element={protect(<StaffDashboard />, ["staff"])}>
          <Route index element={protect(<Dashboardpage />, ["staff"])} />
          <Route path="sales" element={protect(<Salespage />, ["staff"])} />
          <Route path="order" element={protect(<Orderpage />, ["staff"])} />
          <Route path="stock-transaction" element={protect(<StockTransaction />, ["staff"])} />
          <Route path="NotificationPageRead" element={protect(<NotificationPageRead />, ["staff"])} />
          <Route path="Profilepage" element={protect(<Profilepage />, ["staff"])} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
