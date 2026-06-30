import React from 'react';
import Sidebar from '../Components/Sidebar';
import { Outlet } from 'react-router-dom';

function ManagerDashboard() {
  return (
    <div className="flex bg-gray-200 min-h-screen">

      <div className="fixed inset-y-0 left-0">
        <Sidebar />
      </div>

     
      <div className="flex-1 pl-64"> 
        <Outlet />
      </div>
    </div>
  );
}

export default ManagerDashboard;
