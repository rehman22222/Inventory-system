import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiShoppingBag } from "react-icons/fi";
import toast from "react-hot-toast";
import { gettingStore, UpdateStore } from "../features/storeSlice";
// The till already knows these; reports use whichever is picked here.
import { CURRENCIES } from "../Components/pos/posUtils";

// Every timezone the browser knows, newest platforms first; fall back to a
// short common list on older browsers that lack supportedValuesOf.
const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [
        "UTC",
        "Europe/Dublin",
        "Europe/London",
        "Europe/Paris",
        "Asia/Dubai",
        "Asia/Karachi",
        "Asia/Kolkata",
        "Asia/Dhaka",
        "America/New_York",
        "America/Los_Angeles",
      ];

// The shop's own details. These used to be hard-coded in the frontend, so
// renaming the shop needed a developer and a redeploy — now the owner changes
// them here and every till picks them up on its next load.
function StorePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { store, isloading, issaving } = useSelector((state) => state.store);

  const [form, setForm] = useState({
    name: "",
    addressLines: "",
    phone: "",
    currency: "EUR",
    timezone: "UTC",
    footer: "",
    qrTemplate: "",
  });

  useEffect(() => {
    dispatch(gettingStore());
  }, [dispatch]);

  // Fill the form once the real values arrive.
  useEffect(() => {
    if (!store) return;
    setForm({
      name: store.name || "",
      addressLines: (store.addressLines || []).join("\n"),
      phone: store.phone || "",
      currency: store.currency || "EUR",
      timezone: store.timezone || "UTC",
      footer: store.footer || "",
      qrTemplate: store.qrTemplate || "{ref}",
    });
  }, [store]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(t("store.nameRequired"));
      return;
    }

    dispatch(
      UpdateStore({
        name: form.name.trim(),
        // The textarea is one line per row; the server splits and trims.
        addressLines: form.addressLines,
        phone: form.phone,
        currency: form.currency,
        timezone: form.timezone,
        footer: form.footer,
        qrTemplate: form.qrTemplate,
      })
    );
  };

  const addressPreview = form.addressLines.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <FiShoppingBag className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("store.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">{t("store.sub")}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">{t("store.name")} *</label>
            <input
              value={form.name}
              onChange={set("name")}
              placeholder="Candy Cloud"
              required
              className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
            />
            <p className="mt-1 text-xs text-base-content/50">{t("store.nameHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("store.address")}</label>
            <textarea
              value={form.addressLines}
              onChange={set("addressLines")}
              rows={3}
              placeholder={"10 Abbeygate Street\nLower, H91 KV7K"}
              className="w-full rounded-lg border-2 border-base-300 bg-base-100 p-3"
            />
            <p className="mt-1 text-xs text-base-content/50">{t("store.addressHint")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("store.phone")}</label>
              <input
                value={form.phone}
                onChange={set("phone")}
                placeholder="+353 91 123456"
                className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
              />
            </div>

            {/* Reports print this beside every money column. */}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("store.currency")}</label>
              <select
                value={form.currency}
                onChange={set("currency")}
                className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
              >
                {CURRENCIES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.symbol} — {entry.code}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-base-content/50">{t("store.currencyHint")}</p>
            </div>
          </div>

          {/* Reports and date-range filters use whole calendar days in THIS zone,
              so a shop abroad still gets its own trading days. */}
          <div>
            <label className="mb-1 block text-sm font-medium">{t("store.timezone")}</label>
            <select
              value={form.timezone}
              onChange={set("timezone")}
              className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
            >
              {!TIMEZONES.includes(form.timezone) && (
                <option value={form.timezone}>{form.timezone}</option>
              )}
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-base-content/50">{t("store.timezoneHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("store.footer")}</label>
            <input
              value={form.footer}
              onChange={set("footer")}
              placeholder="Thank you for shopping with us"
              className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3"
            />
            <p className="mt-1 text-xs text-base-content/50">{t("store.footerHint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("store.qr")}</label>
            <input
              value={form.qrTemplate}
              onChange={set("qrTemplate")}
              placeholder="{ref}"
              className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-base-content/50">{t("store.qrHint")}</p>
          </div>

          <button
            type="submit"
            disabled={issaving || isloading}
            className="h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {issaving ? t("store.saving") : t("store.save")}
          </button>

          <p className="text-center text-xs text-base-content/50">{t("store.appliesEverywhere")}</p>
        </form>

        {/* A live sketch of the receipt head/foot, so the owner can see what they
            are actually changing before they save. */}
        <div className="rounded-xl border border-base-300 bg-base-200/40 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-base-content/60">
            {t("store.preview")}
          </h2>

          <div className="mx-auto max-w-[280px] rounded-lg bg-white p-4 text-center font-mono text-[11px] leading-relaxed text-black shadow-inner">
            <div className="text-base font-bold">{form.name || "—"}</div>
            {addressPreview.map((line) => (
              <div key={line}>{line}</div>
            ))}
            {form.phone && <div>{form.phone}</div>}

            <div className="my-2 border-t border-dashed border-gray-400" />
            <div className="text-left">Order : POS-000123</div>
            <div className="my-2 border-t border-dashed border-gray-400" />
            <div className="flex justify-between">
              <span>1 × Vape Pen</span>
              <span>12.00</span>
            </div>
            <div className="my-2 border-t border-dashed border-gray-400" />
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span>12.00</span>
            </div>

            <div className="mt-3 h-14 w-14 mx-auto bg-gray-200 text-[8px] flex items-center justify-center">
              QR
            </div>

            {form.footer && <div className="mt-2">{form.footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StorePage;
