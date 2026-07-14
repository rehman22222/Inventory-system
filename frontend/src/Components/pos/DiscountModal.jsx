import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

function DiscountModal({ subtotal, discount, discountType, onApply, onClose }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(discount || ""));
  const [type, setType] = useState(discountType);

  const preview =
    type === "percent" ? (subtotal * Number(value || 0)) / 100 : Number(value || 0);

  return (
    <PosModal
      title={t("pos.discountModal.title")}
      subtitle={t("pos.voucher.againstSubtotal", { amount: currency(subtotal) })}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              onApply(0, "amount");
              onClose();
            }}
            className="me-auto bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            {t("pos.discountModal.clear")}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(Number(value || 0), type);
              onClose();
            }}
            className="bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
          >
            {t("pos.discountModal.apply")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("amount")}
            className={`py-2 text-sm font-semibold transition ${
              type === "amount" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.typeAmount")}
          </button>
          <button
            type="button"
            onClick={() => setType("percent")}
            className={`py-2 text-sm font-semibold transition ${
              type === "percent" ? "bg-cyan-700 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {t("pos.voucher.typePercent")}
          </button>
        </div>

        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-full border border-slate-700 bg-slate-950 px-3 py-3 text-center font-mono text-2xl text-slate-100 outline-none focus:border-cyan-500"
        />

        <p className="text-center text-sm text-slate-400">
          {t("pos.discountModal.preview")}:{" "}
          <span className="font-semibold text-slate-100">
            {currency(Math.min(preview, subtotal))}
          </span>
        </p>
      </div>
    </PosModal>
  );
}

export default DiscountModal;
