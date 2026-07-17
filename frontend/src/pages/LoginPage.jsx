import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiEye, FiEyeOff } from "react-icons/fi";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { login } from "../features/authSlice";
import e360LogoDark from "../images/e360-logo-dark.png";

function LoginPage() {
  const { t } = useTranslation();
  const { isUserLogin } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigator = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [params] = useSearchParams();

  // The session ended on its own — the account was removed, or the token
  // expired. Say which, rather than dumping the user on a blank login form.
  useEffect(() => {
    const reason = params.get("reason");
    if (!reason) return;

    const message =
      reason === "account-removed"
        ? t("login.accountRemoved")
        : t("login.sessionExpired");

    setLoginError(message);
    toast.error(message);
  }, [params, t]);

  const schema = yup.object().shape({
    email: yup.string().email(t("login.invalidEmail")).required(t("login.emailRequired")),
    password: yup
      .string()
      .min(6, t("login.passwordMin"))
      .required(t("login.passwordRequired")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
  });

  const onSubmit = (data) => {
    setLoginError("");

    dispatch(login(data))
      .unwrap()
      .then((response) => {
        const role = response?.user?.role || response?.savedUser?.role;
        if (role === "superadmin") {
          navigator("/SuperAdmin");
        } else if (role === "staff") {
          navigator("/StaffDashboard");
        } else if (role === "admin") {
          navigator("/AdminDashboard");
        } else {
          navigator("/ManagerDashboard");
        }
      })
      .catch((error) => {
        // The reason used to go only to the console, so a wrong password looked
        // like nothing had happened at all. Show it on the form and as a toast.
        const message =
          typeof error === "string" ? error : error?.message || t("login.failed");
        setLoginError(message);
        toast.error(message);
      });
  };

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left panel: a full-bleed photo with the logo on top. Drop the image
            at frontend/public/login-hero.jpg. If it's missing, the dark
            background simply shows through — nothing breaks. */}
        <section className="relative min-h-[200px] overflow-hidden bg-slate-950 text-white lg:min-h-0">
          <img
            src="/login-hero.png"
            alt=""
            aria-hidden="true"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Subtle dark gradient so the logo stays legible over any photo. */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-slate-950/60" />
          <div className="relative px-8 py-10 lg:px-14">
            <Link to="/" className="inline-flex">
              <img
                src={e360LogoDark}
                className="h-20 w-auto object-contain drop-shadow-lg"
                alt="E360 Inventory Suite by Eiretech"
              />
            </Link>
          </div>
        </section>

        {/* Right panel is theme-aware. */}
        <section className="flex items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-base-content">{t("login.signIn")}</h2>
              <p className="mt-2 text-base-content/60">
                {t("login.selectRolePrompt")}
              </p>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm"
            >
              {/* Why the sign-in failed, stated plainly and left on screen — a
                  toast alone disappears before it has been read. */}
              {loginError && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                  <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-base-content/80">
                  {t("common.email")}
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="h-12 w-full rounded-lg border border-base-300 px-3 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder={t("login.emailPlaceholder")}
                />
                {errors.email && (
                  <p className="mt-2 text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-base-content/80">
                  {t("common.password")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    className="h-12 w-full rounded-lg border border-base-300 pe-12 ps-3 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    placeholder={t("login.passwordPlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    title={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                    className="absolute end-0 top-0 flex h-12 w-12 items-center justify-center text-base-content/50 transition hover:text-base-content"
                  >
                    {showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-2 text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                className="h-12 w-full rounded-lg bg-cyan-700 font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-base-300 disabled:text-base-content/40"
                disabled={isUserLogin}
              >
                {isUserLogin ? t("login.signingIn") : t("login.openDashboard")}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
