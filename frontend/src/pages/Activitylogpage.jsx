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

  const { activityLogs, isFetching, userdata, accessError } = useSelector(
    (state) => state.activity
  );
  const { Authuser } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [asking, setAsking] = useState(false);

  // The audit trail records what everyone did, including this admin, so it is
  // not theirs to browse at will — they ask the owner for a look.
  const askForAccess = async () => {
    setAsking(true);
    const result = await dispatch(RaiseRequest({ type: "view_activity_logs" }));
    setAsking(false);

    if (result.error) {
      toast.error(result.payload || t("activity.requestFailed"));
      return;
    }
    toast.success(
      t("activity.requested", { ref: result.payload?.request?.reference || "" })
    );
  };

  const socket = io(socketURL, {
     withCredentials: true,
     transports: ["websocket", "polling"], });

  useEffect(() => {
    if (Authuser?.id) {
      dispatch(getAllActivityLogs());
      dispatch(getsingleUserActivityLogs(Authuser.id));
    }

    socket.on("newActivityLog", (newLog) => {
      setLogs((prevLogs) => [newLog, ...prevLogs]);
    });

    return () => {
      socket.off("newActivityLog");
    };
  }, [dispatch, Authuser?.id]);

  useEffect(() => {
    setLogs(activityLogs);
  }, [activityLogs]);

  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = logs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(logs.length / logsPerPage);

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

            <button
              type="button"
              onClick={askForAccess}
              disabled={asking}
              className="mt-5 h-11 w-full rounded-lg bg-blue-800 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
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
        <div className="mb-4 flex items-center justify-between pr-5">
          <h1 className="text-xl font-semibold">{t("activity.title")}</h1>
          <ReportButton reportKey="activity" label={t("activity.downloadReport")} />
        </div>
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
                    <td className="px-3 py-2 border">{log.userId.name}</td>
                    <td className="px-3 py-2 border">{log.userId.email}</td>
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
