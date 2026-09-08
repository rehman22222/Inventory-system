import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle } from "react-icons/fi";
import axiosInstance from "../lib/axios";

/* One browser, one session — and a tab that has lost it must stop pretending.
 *
 * The session is a single httpOnly cookie (see libs/Tokengenerator.js), and a
 * cookie belongs to the ORIGIN, not to the tab. That is the browser's rule, not
 * a storage choice this app made: signing in as anyone, in any tab, replaces
 * the cookie for every tab at once.
 *
 * What that used to look like was the dangerous part. A staff tab left open
 * while somebody signed in as admin next door kept its own screen — React state
 * is per tab, so the menus stayed a cashier's — but every request it sent now
 * carried the admin cookie, and the server answered as admin. The screen said
 * staff and the authority was admin, silently, with nothing on screen wrong
 * enough to notice.
 *
 * NOTE THAT MOVING THE TOKEN TO sessionStorage WOULD FIX NOTHING. There is no
 * token in storage to move — lib/axios.js deliberately keeps it out of reach of
 * script, and the cookie would still be replaced. The only real cures are
 * per-tab sessions (a different auth transport) or this: notice, and get out.
 *
 * So the tab watches for the takeover two ways:
 *
 *   - `storage`, which fires in the OTHER tabs when localStorage changes. The
 *     login writes the profile there, so this lands the instant it happens and
 *     costs nothing.
 *
 *   - the cookie's own answer on returning to the foreground, for the cases the
 *     event cannot cover: the tab was asleep, storage was cleared, or the
 *     write never happened. This is the authoritative one — it asks the server
 *     who the COOKIE says this is, rather than trusting a copy of the profile
 *     that is just as shared as the cookie.
 *
 * On a takeover the tab does not quietly redirect. It says what happened and
 * stops being usable, because a cashier mid-sale deserves to know why the
 * screen went away rather than finding themselves back at a login box.
 */

const SIGNED_OUT_PATHS = ["/LoginPage", "/about"];

const SessionOwnerGuard = () => {
  const { t } = useTranslation();
  const authUser = useSelector((state) => state.auth?.Authuser);
  const [takenBy, setTakenBy] = useState(null);

  // The identity this tab believes it is, held in a ref so the listeners below
  // are registered once rather than re-registered on every render.
  const mineRef = useRef(null);
  mineRef.current = authUser?._id ? String(authUser._id) : null;

  const onSignedOutPage =
    typeof window !== "undefined" &&
    SIGNED_OUT_PATHS.some((path) => window.location.pathname.startsWith(path));

  const surrender = useCallback((name) => {
    // The profile is this tab's, and it is now somebody else's. Dropping it
    // stops a reload from coming back up wearing the wrong identity; the cookie
    // is httpOnly and stays where it is, which is correct — it belongs to
    // whoever just signed in.
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("authUser");
      localStorage.removeItem("sessionExpiresAt");
    } catch {
      /* private mode — the overlay still ends this tab's usefulness */
    }
    setTakenBy(name || "");
  }, []);

  /* The instant signal. A login in another tab writes the profile, and every
   * OTHER tab of this origin hears it. Only a different user matters: signing
   * in again as the same person is not a takeover, and neither is the logout
   * that clears the key — the axios interceptor and SessionExpiryGuard own
   * that path already. */
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== "user" || !event.newValue) return;
      const mine = mineRef.current;
      if (!mine) return;

      let next = null;
      try {
        next = JSON.parse(event.newValue);
      } catch {
        return;
      }
      if (next?._id && String(next._id) !== mine) surrender(next?.name);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [surrender]);

  /* The authoritative backstop, on coming back to this tab.
   *
   * Asked of the server rather than of localStorage, because localStorage is
   * shared too — the check that matters is what the COOKIE resolves to, since
   * that is what every request this tab makes will be judged by. A failure here
   * is deliberately ignored: a 401 is already the interceptor's business, and
   * the shop's till has to survive a dropped network without throwing the
   * cashier out. */
  useEffect(() => {
    if (!authUser?._id || takenBy !== null || onSignedOutPage) return undefined;

    let alive = true;
    const verify = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await axiosInstance.get("auth/me");
        const holder = data?.user;
        if (!alive || !holder?._id) return;
        if (String(holder._id) !== mineRef.current) surrender(holder.name);
      } catch {
        /* offline, or a 401 the interceptor is already handling */
      }
    };

    verify();
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", verify);
    return () => {
      alive = false;
      window.removeEventListener("focus", verify);
      document.removeEventListener("visibilitychange", verify);
    };
  }, [authUser?._id, takenBy, onSignedOutPage, surrender]);

  if (takenBy === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-base-300/95 p-6 backdrop-blur"
    >
      <div className="max-w-md rounded-lg bg-base-100 p-6 text-center shadow-2xl">
        <FiAlertTriangle className="mx-auto h-10 w-10 text-warning" />
        <h2 className="mt-3 text-lg font-bold">
          {t("session.takenTitle", "This tab has been signed out")}
        </h2>
        <p className="mt-2 text-sm opacity-80">
          {takenBy
            ? t(
                "session.takenBy",
                "{{name}} signed in on this computer, and a browser can only hold one session at a time. This tab was still showing yours.",
                { name: takenBy },
              )
            : t(
                "session.takenAnon",
                "Somebody else signed in on this computer, and a browser can only hold one session at a time. This tab was still showing yours.",
              )}
        </p>
        <p className="mt-2 text-xs opacity-60">
          {t(
            "session.takenHint",
            "To use two accounts at once, open the second one in a private window or a different browser.",
          )}
        </p>
        <button
          type="button"
          onClick={() => window.location.replace("/LoginPage?reason=session-taken")}
          className="btn btn-primary btn-sm mt-4"
        >
          {t("session.signInAgain", "Sign in again")}
        </button>
      </div>
    </div>
  );
};

export default SessionOwnerGuard;
