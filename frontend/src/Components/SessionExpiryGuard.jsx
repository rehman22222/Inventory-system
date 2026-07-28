import { useEffect } from "react";
import { useSelector } from "react-redux";

// End-of-day auto-logout for the whole till/back-office (all roles).
//
// The server already makes the session cookie expire at the shop's next local
// midnight, so any API call after that fails with a 401 and the axios
// interceptor bounces the user to the login page. But a POS terminal left open
// and untouched makes no request, so it would sit on a dead session until the
// next click. This guard closes that gap: it schedules a logout for the exact
// expiry instant the server sent at login (stored in `sessionExpiresAt`), so
// the screen returns to the login page on the dot even when idle.
const forceLogout = () => {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("authUser");
    localStorage.removeItem("sessionExpiresAt");
  } catch {
    /* private mode — the redirect below still ends the session */
  }
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/LoginPage")) {
    window.location.replace("/LoginPage?reason=session-expired");
  }
};

const SessionExpiryGuard = () => {
  // Re-run whenever the logged-in user changes (login / logout) so a fresh
  // login re-arms the timer with its new expiry.
  const authUser = useSelector((state) => state.auth?.Authuser);

  useEffect(() => {
    const raw = (() => {
      try {
        return localStorage.getItem("sessionExpiresAt");
      } catch {
        return null;
      }
    })();

    // Not logged in, or no expiry recorded (e.g. a legacy session) — nothing to
    // schedule. A legacy session's next API call still 401s at midnight.
    if (!authUser || !raw) return;

    const expiresAt = new Date(raw).getTime();
    if (Number.isNaN(expiresAt)) return;

    const msLeft = expiresAt - Date.now();

    // Already past midnight (tab was asleep across the boundary) — log out now.
    if (msLeft <= 0) {
      forceLogout();
      return;
    }

    const timer = setTimeout(forceLogout, msLeft);
    return () => clearTimeout(timer);
  }, [authUser]);

  return null;
};

export default SessionExpiryGuard;
