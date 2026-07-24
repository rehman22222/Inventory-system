import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import { socketURL } from "../lib/socket";
import { useEffect, useState } from "react";
import { getAllActivityLogs, getsingleUserActivityLogs } from "../features/activitySlice";
import { RaiseRequest } from "../features/approvalSlice";
import { FiLock } from "react-icons/fi";
import toast from "react-hot-toast";
import TopNavbar from "../Components/TopNavbar";
import ReportButton from "../Components/ReportButton";
import FormattedTime from "../lib/FormattedTime ";

function Activitylogpage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 10;

  const { activityLogs, accessError, logRange } = useSelector(
    (state) => state.activity
  );
  const { Authuser } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [asking, setAsking] = useState(false);

  // The window the admin wants to see. They ask for it; the superadmin approves
  // exactly that, and it bounds everything they can then see or print.
  const [reqFrom, setReqFrom] = useState("");
  const [reqTo, setReqTo] = useState("");

  // The owner sees everything, so they get a free date/time filter to narrow the
  // trail to any moment — down to the minute. (An admin is already bounded to a
  // granted window, so no filter is offered there.)
  const isOwner = Authuser?.role === "superadmin";
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // The audit trail records what everyone did, including this admin, so it is
  // not theirs to browse at will — they ask the owner for a specific window.
  const askForAccess = async () => {
    if (!reqFrom || !reqTo) {
      toast.error(t("activity.pickRange"));
      return;
    }
    if (reqFrom > reqTo) {
      toast.error(t("activity.rangeOrder"));
      return;
    }

    setAsking(true);
    const result = await dispatch(
      RaiseRequest({ type: "view_activity_logs", payload: { from: reqFrom, to: reqTo } })
    );
    setAsking(false);

    if (result.error) {
      toast.error(result.payload || t("activity.requestFailed"));
      return;
    }
    toast.success(
      t("activity.requested", { ref: result.payload?.request?.reference || "" })
    );
  };

  useEffect(() => {
    const socket = io(socketURL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    if (Authuser?.id) {
      dispatch(getAllActivityLogs());
      dispatch(getsingleUserActivityLogs(Authuser.id));
    }

    socket.on("newActivityLog", (newLog) => {
      // The server only sends the entry itself to sockets allowed to read the
      // audit trail; everyone else gets the event with no payload. If our grant
      // expired while the page was open we'd land here empty-handed, so ignore
      // it rather than pushing an undefined row into the table.
      if (!newLog) return;
      setLogs((prevLogs) => [newLog, ...prevLogs]);
    });

    return () => {
      socket.disconnect();
    };
  }, [dispatch, Authuser?.id]);

  useEffect(() => {
    setLogs(activityLogs);
  }, [activityLogs]);

  // Owner-only date/time filter, applied to the already-loaded trail.
  const filteredLogs =
    isOwner && (filterFrom || filterTo)
      ? logs.filter((log) => {
          const when = new Date(log.createdAt).getTime();
          if (filterFrom && when < new Date(filterFrom).getTime()) return false;
          if (filterTo && when > new Date(filterTo).getTime()) return false;
          return true;
        })
      : logs;

  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  // A narrower filter can leave the current page past the end — snap back.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterFrom, filterTo]);

  // Locked: show the way in rather than an error and an empty table.
  if (accessError) {
    return (
      <div className="bg-base-200 min-h-screen">
        <TopNavbar />
        <div className="mx-auto mt-20 max-w-md px-5 text-center">
          <div className="rounded-2xl border border-base-300 bg-base-100 p-8 shadow-sm">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <FiLock className="h-6 w-6" />
            </span>
            <h1 className="text-xl font-semibold">{t("activity.locked")}</h1>
            <p className="mt-2 text-sm text-base-content/60">{accessError.message}</p>
            <p className="mt-1 text-xs text-base-content/50">{t("activity.grantHint")}</p>

            {/* Pick the window to request — access is only ever for a slice of
                the history, not the whole trail. */}
            <div className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">
                  {t("activity.from")}
                </label>
                <input
                  type="date"
                  value={reqFrom}
                  onChange={(event) => setReqFrom(event.target.value)}
                  className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">
                  {t("activity.to")}
                </label>
                <input
                  type="date"
                  value={reqTo}
                  onChange={(event) => setReqTo(event.target.value)}
                  className="h-11 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={askForAccess}
              disabled={asking}
              className="mt-4 h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {asking ? t("activity.requesting") : t("activity.requestAccess")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />
      <div className="mt-10 ml-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pr-5">
          <div>
            <h1 className="text-xl font-semibold">{t("activity.title")}</h1>
            {/* An admin sees a granted slice; say which, so it is clear the page
                isn't the whole trail. The superadmin sees everything (no range). */}
            {logRange?.from && (
              <p className="mt-1 text-xs text-base-content/60">
                {t("activity.showingWindow", {
                  from: new Date(logRange.from).toLocaleDateString(),
                  to: new Date(logRange.to).toLocaleDateString(),
                })}
                {logRange.until && (
                  <span className="ms-2 text-base-content/40">
                    {t("activity.accessUntil", {
                      until: new Date(logRange.until).toLocaleString(),
                    })}
                  </span>
                )}
              </p>
            )}
          </div>
          {/* PDF/CSV/Excel — the print-out. Server clamps an admin's export to
              the same granted window, so this can't reach past it. */}
          <ReportButton reportKey="activity" label={t("activity.print")} />
        </div>

        {/* Owner-only: narrow the trail to a day/time window. */}
        {isOwner && (
          <div className="mb-4 flex flex-wrap items-end gap-3 pr-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">
                {t("activity.from")}
              </label>
              <input
                type="datetime-local"
                value={filterFrom}
                onChange={(event) => setFilterFrom(event.target.value)}
                className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">
                {t("activity.to")}
              </label>
              <input
                type="datetime-local"
                value={filterTo}
                onChange={(event) => setFilterTo(event.target.value)}
                className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm"
              />
            </div>
            {(filterFrom || filterTo) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom("");
                    setFilterTo("");
                  }}
                  className="h-10 rounded-lg border-2 border-base-300 px-3 text-sm font-semibold hover:bg-base-200"
                >
                  {t("activity.clearFilter")}
                </button>
                <span className="text-xs text-base-content/50">
                  {t("activity.matches", { count: filteredLogs.length })}
                </span>
              </>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full bg-base-100 mb-24 border border-base-300 rounded-lg shadow-md">
            <thead className="bg-base-200">
              <tr>
                <th className="px-3 py-2 border w-5">#</th>
                <th className="px-3 py-2 border">{t("common.name")}</th>
                <th className="px-3 py-2 border">{t("common.email")}</th>
                <th className="px-3 py-2 border">{t("activity.action")}</th>
                <th className="px-3 py-2 border">{t("activity.affectedPart")}</th>
                <th className="px-3 py-2 border">{t("common.description")}</th>
                <th className="px-3 py-2 border">{t("activity.time")}</th>
                <th className="px-3 py-2 border">{t("activity.ipAddress")}</th>
              </tr>
            </thead>
            <tbody>
              {currentLogs.length > 0 ? (
                currentLogs.map((log, index) => (
                  <tr key={log._id}>
                    <td className="px-3 py-2 border">{indexOfFirstLog + index + 1}</td>
                    <td className="px-3 py-2 border">{log.userId?.name || t("activity.systemUser")}</td>
                    <td className="px-3 py-2 border">{log.userId?.email || "—"}</td>
                    <td className="px-3 py-2 border">{log.action}</td>
                    <td className="px-3 py-2 border">{log.entity}</td>
                    <td className="px-3 py-2 border">{log.description}</td>
                    <td className="px-4 py-2 border">
                      <FormattedTime timestamp={log.createdAt} />
                    </td>
                    <td className="px-4 py-2 border">{log.ipAddress}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="text-center py-4">
                    <p>{t("activity.noLogs")}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="join mt-4 mb-20 ml-72 flex justify-center">
          <button
            className="join-item btn"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            {t("activity.prev")}
          </button>
          {[...Array(totalPages)].map((_, index) => (
            <button
              key={index}
              className={`join-item btn ${currentPage === index + 1 ? "btn-active" : ""}`}
              onClick={() => setCurrentPage(index + 1)}
            >
              {index + 1}
            </button>
          ))}
          <button
            className="join-item btn"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            {t("activity.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Activitylogpage;
