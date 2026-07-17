import { io } from "socket.io-client";

// Same-origin in production (served by its own backend); falls back to the
// current page origin so it works on any domain. Local dev sets
// REACT_APP_BACKEND_URL in frontend/.env.
export const socketURL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

const socket = io(socketURL, {
  withCredentials: true,
  transports: ["websocket", "polling"],
});

export default socket;
