import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch, useSelector } from "react-redux";
import * as yup from "yup";
import { FiShield, FiUsers, FiBriefcase } from "react-icons/fi";
import { login } from "../features/authSlice";

const demoAccounts = [
  {
    role: "Admin",
    email: "admin@example.com",
    password: "Admin@123",
    icon: FiShield,
    description: "Full control over inventory, notifications, users, and reports.",
    route: "/AdminDashboard",
  },
  {
    role: "Manager",
    email: "manager@example.com",
    password: "Manager@123",
    icon: FiBriefcase,
    description: "Manage products, suppliers, orders, sales, and stock movement.",
    route: "/ManagerDashboard",
  },
  {
    role: "Staff",
    email: "staff@example.com",
    password: "Staff@123",
    icon: FiUsers,
    description: "Operate daily sales, orders, stock checks, and notifications.",
    route: "/StaffDashboard",
  },
];

function LoginPage() {
  const { isUserLogin } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigator = useNavigate();

  const schema = yup.object().shape({
    email: yup.string().email("Invalid email").required("Email is required"),
    password: yup.string().min(6, "Password must be at least 6 characters").required("Password is required"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      email: "manager@example.com",
      password: "Manager@123",
    },
  });

  const selectDemoAccount = (account) => {
    setValue("email", account.email, { shouldValidate: true });
    setValue("password", account.password, { shouldValidate: true });
  };

  const onSubmit = (data) => {
    dispatch(login(data))
      .unwrap()
      .then((response) => {
        const role = response?.user?.role || response?.savedUser?.role;

        if (role === "staff") {
          navigator("/StaffDashboard");
        } else if (role === "admin") {
          navigator("/AdminDashboard");
        } else {
          navigator("/ManagerDashboard");
        }
      })
      .catch((error) => {
        console.error("Error in Login:", error);
      });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between bg-slate-950 px-8 py-10 text-white lg:px-14">
          <div>
            <Link to="/" className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
              InventoryPro
            </Link>

            <div className="mt-20 max-w-2xl">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Client demo workspace
              </p>
              <h1 className="text-4xl font-bold leading-tight lg:text-6xl">
                Inventory, stock, sales, and supplier operations in one dashboard.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                Use the demo roles to walk through executive oversight, manager operations,
                and staff-level day-to-day workflows without connecting MongoDB yet.
              </p>
            </div>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-white/5 p-4">
              <p className="text-3xl font-bold">8</p>
              <p className="mt-1 text-sm text-slate-300">Demo products</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-4">
              <p className="text-3xl font-bold">5</p>
              <p className="mt-1 text-sm text-slate-300">Active categories</p>
            </div>
            <div className="border border-white/10 bg-white/5 p-4">
              <p className="text-3xl font-bold">3</p>
              <p className="mt-1 text-sm text-slate-300">Role views</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-xl">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-slate-950">Sign in</h2>
              <p className="mt-2 text-slate-600">Select a demo role or enter credentials manually.</p>
            </div>

            <div className="mb-6 grid gap-3">
              {demoAccounts.map((account) => {
                const Icon = account.icon;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => selectDemoAccount(account)}
                    className="flex w-full items-start gap-4 border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-500 hover:shadow-md"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-cyan-50 text-cyan-700">
                      <Icon className="text-xl" />
                    </span>
                    <span>
                      <span className="block font-semibold text-slate-950">{account.role}</span>
                      <span className="mt-1 block text-sm text-slate-600">{account.description}</span>
                      <span className="mt-2 block text-xs font-medium text-slate-500">
                        {account.email} / {account.password}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  {...register("email")}
                  className="h-12 w-full border border-slate-300 px-3 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  placeholder="you@example.com"
                />
                {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  {...register("password")}
                  className="h-12 w-full border border-slate-300 px-3 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  placeholder="Enter your password"
                />
                {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                className="h-12 w-full bg-cyan-700 font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={isUserLogin}
              >
                {isUserLogin ? "Signing in..." : "Open Dashboard"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Need a new user?{" "}
              <Link to="/SignupPage" className="font-semibold text-cyan-700 hover:text-cyan-900">
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
