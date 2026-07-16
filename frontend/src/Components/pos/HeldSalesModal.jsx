import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiTrash2, FiWifiOff } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import { localHeldAll, localHeldRemove } from "../../lib/offlineDb";
import PosModal from "./PosModal";
import { currency } from "./posUtils";

// Suspended sales normally live on the server, so a basket parked on one till
// can be resumed on another. Baskets parked while the line was down are held on
// this till instead — both are listed together, newest first, so the cashier
// never has to care which is which.
function HeldSalesModal({ onResume, onClose }) {
  const { t } = useTranslation();
  const [held, setHeld] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // Local ones always load; the server list is a bonus when we can reach it.
    const local = await localHeldAll().catch(() => []);

    let server = [];
    try {
      const response = await axiosInstance.get("pos/held");
      server = response.data.held || [];
    } catch {
      // No line — the local baskets are still perfectly usable, so this is not
      // worth an error toast.
    }

    setHeld(
      [...local, ...server].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (sale) => {
    if (sale.local) {
      await localHeldRemove(sale._id).catch(() => {});
      setHeld((current) => current.filter((entry) => entry._id !== sale._id));
      return;
    }

    try {
      await axiosInstance.delete(`pos/held/${sale._id}`);
      setHeld((current) => current.filter((entry) => entry._id !== sale._id));
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
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">{sale.customerName}</span>
                  {sale.local && (
                    <span
                      title={t("pos.offline.heldOnThisTill")}
                      className="inline-flex shrink-0 items-center gap-1 bg-amber-950 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300 ring-1 ring-amber-800"
                    >
                      <FiWifiOff className="h-2.5 w-2.5" />
                      {t("pos.offline.thisTill")}
                    </span>
                  )}
                </p>
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
                onClick={() => remove(sale)}
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
