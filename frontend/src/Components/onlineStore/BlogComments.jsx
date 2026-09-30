/* The blog comment moderation queue.
 *
 * Readers write comments on the website; nothing appears on an article until
 * somebody here approves it. Hiding takes an approved comment back off the
 * article without losing it; deleting removes it for good.
 *
 * Shown to admins and the super admin only — the server refuses everyone else
 * (see commentModerators in onlineStoreRouter), so this only decides whether to
 * draw a panel that would be refused.
 *
 * State is kept here rather than in the online store slice: the queue is used
 * on this one panel and nowhere else.
 */

import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import { FiCheck, FiEyeOff, FiRefreshCw, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import axiosInstance from "../../lib/axios";
import { socketURL } from "../../lib/socket";

const FILTERS = [
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "Shown" },
  { id: "hidden", label: "Hidden" },
  { id: "all", label: "All" },
];

const STATUS_BADGE = {
  pending: "badge-warning",
  approved: "badge-success",
  hidden: "badge-ghost",
};

const STATUS_LABEL = { pending: "Waiting", approved: "Shown", hidden: "Hidden" };

const when = (value) =>
  new Date(value).toLocaleString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function BlogComments() {
  const [filter, setFilter] = useState("pending");
  const [comments, setComments] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, hidden: 0 });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get("online/blog-comments", {
        params: filter === "all" ? {} : { status: filter },
      });
      setComments(data.comments || []);
      setCounts(data.counts || { pending: 0, approved: 0, hidden: 0 });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // A new comment on the website refreshes the queue while it is open.
  useEffect(() => {
    const socket = io(socketURL, { withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("blogCommentSubmitted", () => {
      load();
      toast("New blog comment waiting for approval", { id: "blog-comment-new" });
    });
    return () => socket.disconnect();
  }, [load]);

  const setStatus = async (comment, status) => {
    setBusyId(comment._id);
    try {
      await axiosInstance.patch(`online/blog-comments/${comment._id}`, { status });
      toast.success(
        status === "approved" ? "Comment is now shown on the article" : status === "hidden" ? "Comment hidden" : "Moved back to waiting",
      );
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not update the comment");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (comment) => {
    if (!window.confirm(`Delete this comment by ${comment.name}? This cannot be undone.`)) return;
    setBusyId(comment._id);
    try {
      await axiosInstance.delete(`online/blog-comments/${comment._id}`);
      toast.success("Comment deleted");
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not delete the comment");
    } finally {
      setBusyId("");
    }
  };

  const total = counts.pending + counts.approved + counts.hidden;

  return (
    <section className="min-w-0 rounded-xl border bg-base-100 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Reader comments</h2>
          <p className="mt-1 text-xs text-base-content/50">
            Nothing a reader writes appears on the website until it is approved here.
          </p>
        </div>
        <button type="button" className="btn btn-sm gap-2" onClick={load} disabled={loading}>
          <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="tabs tabs-boxed mt-4 w-fit max-w-full flex-nowrap overflow-x-auto">
        {FILTERS.map((item) => {
          const count = item.id === "all" ? total : counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={`tab shrink-0 gap-2 whitespace-nowrap ${filter === item.id ? "tab-active" : ""}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className={`badge badge-sm ${item.id === "pending" && count ? "badge-warning" : ""}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        {!loading && !comments.length && (
          <p className="rounded-lg border border-dashed border-base-300 p-6 text-center text-sm text-base-content/50">
            {filter === "pending" ? "No comments waiting — you're all caught up." : "No comments here."}
          </p>
        )}

        {comments.map((comment) => (
          <article key={comment._id} className="rounded-lg border border-base-300 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  {comment.name}
                  {comment.customer && <span className="badge badge-sm badge-info ml-2">Customer</span>}
                </p>
                <p className="break-all text-xs text-base-content/50">{comment.email}</p>
              </div>
              <span className={`badge ${STATUS_BADGE[comment.status] || ""}`}>{STATUS_LABEL[comment.status]}</span>
            </div>
            <p className="mt-2 text-xs text-base-content/50">
              On <span className="font-medium text-base-content/70">{comment.postTitle || "an article"}</span> · {when(comment.createdAt)}
              {comment.moderatedByName && comment.status !== "pending" && (
                <> · {STATUS_LABEL[comment.status]} by {comment.moderatedByName}</>
              )}
            </p>
            {/* Plain text on purpose: a reader's comment never becomes HTML. */}
            <p className="mt-3 whitespace-pre-line break-words text-sm leading-6">{comment.body}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {comment.status !== "approved" && (
                <button type="button" className="btn btn-success btn-xs gap-1" disabled={busyId === comment._id} onClick={() => setStatus(comment, "approved")}>
                  <FiCheck /> Approve
                </button>
              )}
              {comment.status !== "hidden" && (
                <button type="button" className="btn btn-xs gap-1" disabled={busyId === comment._id} onClick={() => setStatus(comment, "hidden")}>
                  <FiEyeOff /> Hide
                </button>
              )}
              {comment.status !== "pending" && (
                <button type="button" className="btn btn-ghost btn-xs gap-1" disabled={busyId === comment._id} onClick={() => setStatus(comment, "pending")}>
                  <FiRotateCcw /> Back to waiting
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-xs gap-1 text-error" disabled={busyId === comment._id} onClick={() => remove(comment)}>
                <FiTrash2 /> Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
