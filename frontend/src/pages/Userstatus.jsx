import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { TiDelete } from "react-icons/ti";
import { FiEye, FiEyeOff } from "react-icons/fi";
import image from "../images/user.png";
import {
  staffUser,
  managerUser,
  adminUser,
} from "../features/authSlice";
import { RaiseRequest } from "../features/approvalSlice";
import  UserRoleChart from '../lib/Usersgraph'

const EMPTY_USER = { name: "", email: "", password: "", role: "staff" };

function Userstatus() {
  const { t } = useTranslation();
  const { staffuser, manageruser, adminuser } = useSelector((state) => state.auth);
  const { issubmitting } = useSelector((state) => state.approval);
  const dispatch = useDispatch();
  const { Authuser } = useSelector((state) => state.auth);
  const [form, setForm] = useState(EMPTY_USER);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    dispatch(staffUser());
    dispatch(managerUser());
    dispatch(adminUser());
  }, [dispatch]);

  // Admins no longer delete directly — they ask the superadmin to.
  const handleremove = (user) => {
    if (!window.confirm(t("users.requestDeleteConfirm", { name: user.name }))) return;

    dispatch(
      RaiseRequest({
        type: "delete_user",
        payload: { userId: user._id, targetName: user.name },
      })
    );
  };

  // Creating an account is now a request the superadmin approves.
  const submitNewUser = async (event) => {
    event.preventDefault();

    const result = await dispatch(
      RaiseRequest({
        type: "create_user",
        payload: { ...form, name: form.name.trim(), email: form.email.trim() },
      })
    );

    if (!result.error) setForm(EMPTY_USER);
  };

  const field =
    "w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary";
  const label = "mb-1 block text-xs font-semibold uppercase text-base-content/60";

  return (
    <div className="min-h-screen bg-base-100">
      <TopNavbar />

      {/* Only an admin can mint an account, and only manager/staff ones. */}
      <form
        onSubmit={submitNewUser}
        className="mx-10 mt-8 grid gap-4 rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="sm:col-span-2 lg:col-span-5">
          <h2 className="text-lg font-semibold">{t("users.requestTitle")}</h2>
          <p className="mt-0.5 text-sm text-base-content/60">{t("users.requestSub")}</p>
        </div>

        <div>
          <label className={label}>{t("users.name")}</label>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={field}
          />
        </div>

        <div>
          <label className={label}>{t("users.email")}</label>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className={field}
          />
        </div>

        <div>
          <label className={label}>{t("users.password")}</label>
          {/* Whoever sets this has to read it back to the new staff member, so
              they need to be able to see what they typed. */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={t("users.passwordHint")}
              className={`${field} pe-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              title={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              className="absolute end-0 top-0 flex h-full w-11 items-center justify-center text-base-content/50 transition hover:text-base-content"
            >
              {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className={label}>{t("users.role")}</label>
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            className={field}
          >
            <option value="staff">{t("users.staff")}</option>
            <option value="manager">{t("users.manager")}</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={issubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:opacity-50"
          >
            <IoMdAdd className="text-lg" />
            {issubmitting ? t("users.requesting") : t("users.requestCreate")}
          </button>
        </div>
      </form>

      <div className="flex">
      <div className=" bg-base-100 mt-10 ml-10 w-72 overflow-auto rounded-lg">
        <div className=" bg-base-100 p-4 rounded-lg shadow-md mb-4">
          <h2 className="text-lg bg-base-100 font-semibold mb-2">{t("users.manager")}</h2>
          {manageruser?.length > 0 ? (
            manageruser.map((user, index) => (
              <div key={index} className="flex bg-base-100 items-center space-x-4 p-2 border-b">
                <img src={user?.ProfilePic||image} alt="User" className="w-10 bg-base-100 h-10 rounded-full" />
                <div className="bg-base-100">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-base-content/60 text-sm">{user.email}</p>
                </div>
                <div><TiDelete  onClick={()=>handleremove(user)}  className="text-red-600 text-2xl"/></div>
              </div>
            ))
          ) : (
            <p className="text-base-content/50">{t("users.noUsers")}</p>
          )}
        </div>

        <div className="bg-base-100 p-4 rounded-lg shadow-md mb-4">
          <h2 className="text-lg bg-base-100 font-semibold mb-2">{t("users.adminUser")}</h2>
          {adminuser?.length > 0 ? (
            adminuser.map((user, index) => (
              <div key={index} className="flex bg-base-100 items-center space-x-4 p-2 border-b">
                <img src={user?.ProfilePic||image} alt="User" className="w-10 h-10 bg-base-100 rounded-full" />
                <div className="bg-base-100">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-base-content/60 text-sm">{user.email}</p>
                </div>
                <div><TiDelete  onClick={()=>handleremove(user)} className="text-red-600 text-2xl" /></div>
              
              </div>
            ))
          ) : (
            <p className="text-base-content/50">{t("users.noUsers")}</p>
          )}
        </div>

        <div className=" bg-base-100 p-4 rounded-lg shadow-md mb-4">
          <h2 className="text-lg bg-base-100 font-semibold mb-2">{t("users.staffUser")}</h2>
          {staffuser?.length > 0 ? (
            staffuser.map((user, index) => (
              <div key={index} className="flex bg-base-100 items-center space-x-4 p-2 border-b">
                <img src={user?.ProfilePic||image} alt="User" className="w-10 h-10  bg-base-100 rounded-full" />
                <div className="bg-base-100">
                  <p className="font-medium  bg-base-100">{user.name}</p>
                  <p className=" bg-base-100 text-sm">{user.email}</p>
                </div>
                <div><TiDelete onClick={()=>handleremove(user)} className="text-red-600 text-2xl" /></div>
              </div>
            ))
          ) : (
            <p className="text-base-content/50">{t("users.noUsers")}</p>
          )}
        </div>
      </div>
<UserRoleChart className="ml-10 "/>
      </div>
    </div>
  
  );
}

export default Userstatus;
