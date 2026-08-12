import axios from 'axios';
import { clearDemoMode, handleDemoAxiosRequest } from './demoMode';

// When the app is served by its own backend (production, full-stack deploy) the
// API is same-origin, so no base URL is needed — "/api" is relative to whatever
// domain the page is on. This makes it work on the final domain AND on the
// temporary Hostinger URL without rebuilding. Local dev sets
// REACT_APP_BACKEND_URL (e.g. http://localhost:3003) in frontend/.env.
const base = process.env.REACT_APP_BACKEND_URL || "";

const axiosInstance = axios.create({
    baseURL: `${base}/api`,
    withCredentials: true,
  });

// The session rides on the httpOnly `Inventorymanagmentsystem` cookie, which
// `withCredentials` sends on every call. We deliberately do NOT read a JWT out
// of localStorage and attach it as a Bearer header: anything JavaScript can
// read, an XSS can steal, and that token is valid for seven days. The cookie is
// httpOnly + sameSite=Lax, so script can't read it and it isn't sent
// cross-site. The API is same-origin in production and same-site in dev
// (localhost:3000 -> localhost:3003), so the cookie covers both.
//
// Clear any token left in storage by an older build, so upgrading actually
// removes the copy rather than leaving it behind forever.
try {
  localStorage.removeItem("token");
} catch {
  /* private mode — nothing to clean up */
}

// Paths where a 401 is the answer to a question, not the end of a session.
const isAuthCall = (url = "") => url.includes("auth/login") || url.includes("auth/signup");

let signingOut = false;

axiosInstance.interceptors.request.use((config) => {
  const demoResult = handleDemoAxiosRequest(config);

  if (demoResult) {
    return Promise.reject({
      __demoResponse: true,
      result: demoResult,
      config,
    });
  }

  return config;
});

// The account is gone (deleted by the super admin), or the token expired. The
// server already refuses every call — without this the user just sits on a
// dashboard where nothing works and no reason is given.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.__demoResponse) {
      if (error.result?.error) return Promise.reject(error.result.error);
      return Promise.resolve(error.result?.response);
    }

    const status = error.response?.status;

    if (status === 401 && !isAuthCall(error.config?.url) && !signingOut) {
      // Guard against a burst of parallel 401s all trying to redirect.
      signingOut = true;

      try {
        clearDemoMode();
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("sessionExpiresAt");
      } catch {
        /* private mode — the redirect below still ends the session */
      }

      const reason = error.response?.data?.message || "";
      // Tell the login page why it happened, so the user isn't left guessing.
      const query = /not found/i.test(reason) ? "?reason=account-removed" : "?reason=session-expired";

      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/LoginPage")) {
        window.location.replace(`/LoginPage${query}`);
      } else {
        signingOut = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance
