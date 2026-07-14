import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiTrash2 } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// Suspended sales now live on the server, so a basket parked on one till can be
// resumed on another.
function HeldSalesModal({ onResume, onClose }) {
  const { t } = useTranslation();
  const [held, setHeld] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    axiosInstance
      .get("pos/held")
      .then((response) => setHeld(response.data.held || []))
      .catch((error) => toast.error(error.response?.data?.message || t("pos.held.failed")))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (id) => {
    try {
      await axiosInstance.delete(`pos/held/${id}`);
      setHeld((current) => current.filter((sale) => sale._id !== id));
    } catch (error) {
      toast.error(error.response?.data?.message || t("pos.held.deleteFailed"));
    }
  };

  const total = (sale) =>
    sale.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <PosModal title={t("pos.held.title")} subtitle={t("pos.held.subtitle")} onClose={onClose}>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.processing")}</p>
      ) : held.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("pos.noHeld")}</p>
      ) : (
        <div className="space-y-1">
          {held.map((sale) => (
            <div
              key={sale._id}
              className="flex items-center gap-3 border border-slate-800 bg-slate-950 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{sale.customerName}</p>
                <p className="truncate text-xs text-slate-500">
                  {new Date(sale.createdAt).toLocaleString()} · {sale.cashierName} ·{" "}
                  {t("pos.history.items", { count: sale.items.length })}
                </p>
              </div>

              <span className="font-semibold tabular-nums">{currency(total(sale))}</span>

              <button
                type="button"
                onClick={() => onResume(sale)}
                className="bg-cyan-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600"
              >
                {t("pos.resume")}
              </button>
              <button
                type="button"
                onClick={() => remove(sale._id)}
                className="p-1.5 text-slate-500 hover:bg-red-900/40 hover:text-red-400"
                aria-label={t("pos.held.delete")}
              >
                <FiTrash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </PosModal>
  );
}

export default HeldSalesModal;
