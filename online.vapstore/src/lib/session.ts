import { getCookie, setSessionCookie } from "./cookies";

/* A per-visitor session id, kept in a first-party cookie. It's created on the
 * first visit and has no Max-Age/Expires attribute, so the browser discards it
 * when the browsing session closes. Useful for tying an
 * age-gate consent, a basket and analytics to one browsing session without any
 * personal data. */

const SESSION_COOKIE = "cop_sid";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the non-crypto id below
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Read the current browser-session id, creating one if needed. */
export function getSessionId(): string {
  let id = getCookie(SESSION_COOKIE);
  if (!id) id = randomId();
  setSessionCookie(SESSION_COOKIE, id);
  return id;
}
