import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiRefreshCw, FiSend, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import {
  getReorders,
  approveReorder,
  rejectReorder,
} from "../features/reorderSlice";

// The reorder queue: items that fell to their low-stock threshold and are
// waiting for someone to approve buying more. Approving emails the supplier the
// order; dismissing clears it. Owner/admin only.
function Reorderspage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { reorders, pending, isLoading, isActing } = useSelector((state) => state.reorder);

  useEffect(() => {
    dispatch(getReorders());
  }, [dispatch]);

  const onApprove = async (reorder) => {
    const result = await dispatch(approveReorder(reorder._id));
    if (result.error) {
      toast.error(result.payload || t("reorders.approveFailed"));
    } else {
      toast.success(t("reorders.approved", { supplier: reorder.supplierName || "supplier" }));
    }
  };

  const onReject = async (reorder) => {
    const result = await dispatch(rejectReorder({ id: reorder._id }));
    if (result.error) {
      toast.error(result.payload || t("reorders.dismissFailed"));
    } else {
      toast.success(t("reorders.dismissed"));
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: "bg-amber-100 text-amber-800",
      sent: "bg-green-100 text-green-800",
      rejected: "bg-base-300 text-base-content/70",
      cancelled: "bg-base-300 text-base-content/70",
    };
    return map[status] || "bg-base-300 text-base-content/70";
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("reorders.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">{t("reorders.sub")}</p>
        </div>
        <button
          onClick={() => dispatch(getReorders())}
          className="flex items-center gap-2 rounded-lg border-2 border-base-300 px-3 py-2 text-sm font-semibold hover:bg-base-200"
        >
          <FiRefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("common.refresh")}
        </button>
      </header>

      {pending > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {t("reorders.pendingCount", { count: pending })}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-base-200 text-left">
            <tr>
              <th className="px-4 py-3">{t("reorders.product")}</th>
              <th className="px-4 py-3">{t("reorders.supplier")}</th>
              <th className="px-4 py-3 text-right">{t("reorders.inStock")}</th>
              <th className="px-4 py-3 text-right">{t("reorders.orderQty")}</th>
              <th className="px-4 py-3">{t("common.status")}</th>
              <th className="px-4 py-3 text-right">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {reorders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-base-content/50">
                  {t("reorders.empty")}
                </td>
              </tr>
            ) : (
              reorders.map((reorder) => (
                <tr key={reorder._id} className="border-t border-base-200">
                  <td className="px-4 py-3 font-medium">{reorder.productName}</td>
                  <td className="px-4 py-3">
                    {reorder.supplierName ? (
                      <span>
                        {reorder.supplierName}
                        {!reorder.supplierEmail && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            {t("reorders.noEmail")}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-base-content/40">{t("reorders.noSupplier")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {reorder.currentQuantity} / {reorder.threshold}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{reorder.quantity}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusBadge(reorder.status)}`}>
                      {t(`reorders.status.${reorder.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {reorder.status === "pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onApprove(reorder)}
                          disabled={isActing || !reorder.supplierEmail}
                          title={!reorder.supplierEmail ? t("reorders.noEmailHint") : ""}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
                        >
                          <FiSend className="h-3.5 w-3.5" />
                          {t("reorders.approveSend")}
                        </button>
                        <button
                          onClick={() => onReject(reorder)}
                          disabled={isActing}
                          className="flex items-center gap-1.5 rounded-lg border-2 border-base-300 px-3 py-1.5 text-xs font-semibold hover:bg-base-200 disabled:opacity-40"
                        >
                          <FiX className="h-3.5 w-3.5" />
                          {t("reorders.dismiss")}
                        </button>
                      </div>
                    ) : reorder.status === "sent" ? (
                      <span className="block text-right text-xs text-base-content/50">
                        {t("reorders.emailedBy", { name: reorder.approvedByName || "" })}
                      </span>
                    ) : (
                      <span className="block text-right text-xs text-base-content/40">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Reorderspage;
