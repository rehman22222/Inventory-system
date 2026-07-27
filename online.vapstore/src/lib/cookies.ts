/* Minimal first-party cookie helpers (client-side only).
 *
 * Everything here is safe to call during SSR — it no-ops when there is no
 * `document`. Cookies are set SameSite=Lax and (on https) Secure, so they ride
 * along with normal navigations but aren't exposed to cross-site requests. */

const isBrowser = () => typeof document !== "undefined";

export function getCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const found = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (!isBrowser()) return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}` +
    `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` +
    `; Path=/; SameSite=Lax${secure}`;
}

export function deleteCookie(name: string): void {
  setCookie(name, "", 0);
}
