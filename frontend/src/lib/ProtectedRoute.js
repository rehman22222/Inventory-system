import React from 'react';
import { Navigate } from 'react-router-dom';

const dashboardByRole = {
  admin: "/AdminDashboard",
  manager: "/ManagerDashboard",
  staff: "/StaffDashboard",
};

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
};

const ProtectedRoute = ({ element, allowedRoles }) => {
  const user = getStoredUser();
  const role = user?.role || user?.user?.role || user?.savedUser?.role;

  if (!user) {
    return <Navigate to="/LoginPage" replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    return <Navigate to={dashboardByRole[role] || "/LoginPage"} replace />;
  }

  return element;
};

export default ProtectedRoute;
