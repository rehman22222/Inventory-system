import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoMdAdd } from "react-icons/io";
import { FiEye, FiEyeOff, FiTrash2 } from "react-icons/fi";
import toast from "react-hot-toast";
import {
  staffUser,
  managerUser,
  adminUser,
  createUser,
  removeusers,
} from "../features/authSlice";

const EMPTY = { name: "", email: "", password: "", role: "staff" };

// The superadmin manages accounts directly — no approval needed, since they are
// the top of the shop. Unlike the admin's request form, this can also create
// admin accounts.
function SuperAdminUsers() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { staffuser, manageruser, adminuser, iscreatinguser } = useSelector(
    (state) => state.auth
  );
  const [form, setForm] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);

  const refresh = () => {
    dispatch(staffUser());
    dispatch(managerUser());
    dispatch(adminUser());
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const result = await dispatch(
      createUser({ ...form, name: form.name.trim(), email: form.email.trim() })
    );
    if (!result.error) {
      setForm(EMPTY);
      refresh();
    }
  };

  const remove = async (user) => {
    if (!window.confirm(t("users.deleteConfirm", { name: user.name }))) return;
    const result = await dispatch(removeusers(user._id));
    if (!result.error) {
      toast.success(t("users.removed"));
      refresh();
    }
  };

  const field =
    "w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary";
  const label = "mb-1 block text-xs font-semibold uppercase text-base-content/60";

  const groups = [
    { key: "adminUser", users: adminuser },
    { key: "manager", users: manageruser },
    { key: "staffUser", users: staffuser },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="font-display text-2xl font-bold">{t("users.manageTitle")}</h1>
        <p className="mt-1 text-sm text-base-content/60">{t("users.manageSub")}</p>
      </header>

      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-5 sm:grid-cols-2 lg:grid-cols-5"
      >
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
            <option value="admin">{t("users.admin")}</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={iscreatinguser}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:opacity-50"
          >
            <IoMdAdd className="text-lg" />
            {iscreatinguser ? t("users.creating") : t("users.create")}
          </button>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-2xl border border-base-300 bg-base-100 p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-base-content/60">
              {t(`users.${group.key}`)}
            </h2>
            {Array.isArray(group.users) && group.users.length > 0 ? (
              group.users.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between gap-2 border-b border-base-300 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.name}</p>
                    <p className="truncate text-xs text-base-content/50">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(user)}
                    className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                    aria-label={t("users.delete")}
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-base-content/50">{t("users.noUsers")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SuperAdminUsers;
