import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

function staticAssetCacheControl(pathname: string): string | null {
  if (!/\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i.test(pathname)) return null;
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=2592000";
}

function escapeNulInHtmlStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const nulEscape = new Uint8Array([0x5c, 0x75, 0x30, 0x30, 0x30, 0x30]); // \\u0000

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        let nulCount = 0;
        for (const byte of chunk) {
          if (byte === 0) nulCount += 1;
        }
        if (nulCount === 0) {
          controller.enqueue(chunk);
          return;
        }

        // TanStack's streamed hydration payload uses NUL separators inside JS
        // string values. Emit the equivalent JS escape so the value survives
        // hydration without placing an invalid NUL character in HTML.
        const escaped = new Uint8Array(chunk.length + nulCount * (nulEscape.length - 1));
        let offset = 0;
        for (const byte of chunk) {
          if (byte === 0) {
            escaped.set(nulEscape, offset);
            offset += nulEscape.length;
          } else {
            escaped[offset] = byte;
            offset += 1;
          }
        }
        controller.enqueue(escaped);
      },
    }),
  );
}

function secureResponse(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  const pathname = request ? new URL(request.url).pathname : "";
  const assetCache = staticAssetCacheControl(pathname);
  const isHtml = (headers.get("content-type") ?? "").includes("text/html");
  headers.delete("server");
  headers.delete("x-powered-by");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    headers.set("content-security-policy", PRODUCTION_CSP);
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  if (assetCache) {
    headers.set("cache-control", assetCache);
  }

  if (isHtml && response.body) headers.delete("content-length");
  const body = isHtml && response.body ? escapeNulInHtmlStream(response.body) : response.body;

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return secureResponse(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return secureResponse(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
