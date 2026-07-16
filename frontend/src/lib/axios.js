import axios from 'axios';

const fallbackURL = "http://localhost:3003";

const axiosInstance = axios.create({
    baseURL: `${process.env.REACT_APP_BACKEND_URL|| fallbackURL}/api`,
    withCredentials: true,
  });

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Paths where a 401 is the answer to a question, not the end of a session.
const isAuthCall = (url = "") => url.includes("auth/login") || url.includes("auth/signup");

let signingOut = false;

// The account is gone (deleted by the super admin), or the token expired. The
// server already refuses every call — without this the user just sits on a
// dashboard where nothing works and no reason is given.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401 && !isAuthCall(error.config?.url) && !signingOut) {
      // Guard against a burst of parallel 401s all trying to redirect.
      signingOut = true;

      try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
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
