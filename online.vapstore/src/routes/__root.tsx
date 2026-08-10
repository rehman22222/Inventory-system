import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import "../lib/i18n";
import { CartProvider } from "../lib/cart";
import { CatalogProvider } from "../lib/catalog-context";
import { getStorefront } from "../lib/catalog-api";
import { AgeGate } from "../components/AgeGate";
import { CookieConsent } from "../components/CookieConsent";
import { FloatingHomeArrow } from "../components/FloatingHomeArrow";
import { FloatingSearchButton } from "../components/FloatingSearchButton";
import { MaintenanceMode } from "../components/MaintenanceMode";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The shell's catalogue: fetched once on the server, shared by the header,
  // the footer and every tile that needs to know what the shop stocks.
  loader: () => getStorefront(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Cliffs of Puff — Premium Vape Store" },
      {
        name: "description",
        content:
          "Cliffs of Puff is an independent vape shop. Pod kits, mods, disposables, nic salts and premium e-liquid. Fast dispatch nationwide.",
      },
      { name: "author", content: "Cliffs of Puff" },
      { property: "og:title", content: "Cliffs of Puff — Premium Vape Store" },
      {
        property: "og:description",
        content: "Pod kits, mods, disposables and premium e-liquid. Same-day dispatch nationwide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Transparent PNGs cut from the COP badge. The supplied artwork was a
      // JPEG, which cannot hold transparency — its white square was flood-
      // filled out, so the mark now sits cleanly on light or dark tab chrome.
      { rel: "icon", href: "/logo-cop.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/logo-cop.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const catalog = Route.useLoaderData();
  const emergencyAlert = catalog.settings.emergencyAlert;

  return (
    <QueryClientProvider client={queryClient}>
      <CatalogProvider value={catalog}>
        <CartProvider>
          {emergencyAlert?.active ? (
            <MaintenanceMode alert={emergencyAlert} />
          ) : (
            <AgeGate>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
              <FloatingSearchButton />
              <FloatingHomeArrow />
              <CookieConsent />
            </AgeGate>
          )}
        </CartProvider>
      </CatalogProvider>
    </QueryClientProvider>
  );
}
