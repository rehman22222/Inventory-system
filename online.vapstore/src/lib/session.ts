import { getCookie, setCookie } from "./cookies";

/* A per-visitor session id, kept in a first-party cookie. It's created on the
 * first visit and refreshed on each call, so it rolls forward for as long as
 * the visitor keeps coming back within the window (24h). Useful for tying an
 * age-gate consent, a basket and analytics to one browsing session without any
 * personal data. */

const SESSION_COOKIE = "cop_sid";
export const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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

/** Read the current session id, creating one if needed. Refreshes the 24h TTL. */
export function getSessionId(): string {
  let id = getCookie(SESSION_COOKIE);
  if (!id) id = randomId();
  setCookie(SESSION_COOKIE, id, SESSION_TTL_SECONDS);
  return id;
}
