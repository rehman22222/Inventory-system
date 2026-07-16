import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiCheckSquare } from "react-icons/fi";
import TopNavbar from "../Components/TopNavbar";
import { gettingMyRequests } from "../features/approvalSlice";

export const REQUEST_STATUS_TONE = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  failed: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

// Admin's view: the requests they raised and what the superadmin decided.
function MyRequestspage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { myRequests, isloading } = useSelector((state) => state.approval);

  useEffect(() => {
    dispatch(gettingMyRequests());
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-base-100">
      <TopNavbar />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <header className="flex items-start gap-3">
          <FiCheckSquare className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-2xl font-bold">{t("requests.title")}</h1>
            <p className="mt-1 text-sm text-base-content/60">{t("requests.sub")}</p>
          </div>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-base-300 bg-base-100">
          <table className="w-full text-sm">
            <thead className="bg-base-200 text-xs uppercase text-base-content/60">
              <tr>
                <th className="px-4 py-3 text-start">{t("requests.ref")}</th>
                <th className="px-4 py-3 text-start">{t("requests.what")}</th>
                <th className="px-4 py-3 text-start">{t("requests.raised")}</th>
                <th className="px-4 py-3 text-start">{t("requests.status")}</th>
                <th className="px-4 py-3 text-start">{t("requests.note")}</th>
              </tr>
            </thead>
            <tbody>
              {isloading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-base-content/50">
                    {t("requests.loading")}
                  </td>
                </tr>
              ) : myRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-base-content/50">
                    {t("requests.empty")}
                  </td>
                </tr>
              ) : (
                myRequests.map((request) => (
                  <tr key={request._id} className="border-t border-base-300">
                    <td className="px-4 py-3 font-mono font-semibold">{request.reference}</td>
                    <td className="px-4 py-3">{request.summary}</td>
                    <td className="px-4 py-3 text-base-content/60">
                      {new Date(request.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          REQUEST_STATUS_TONE[request.status]
                        }`}
                      >
                        {t(`requests.statuses.${request.status}`, request.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-content/60">
                      {request.decisionNote || request.resultNote || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MyRequestspage;
