import React from "react";

/**
 * E360 brand lockup rendered as crisp, theme-aware markup (no raster logo).
 * - `variant`: "full" (icon + wordmark + tagline) | "compact" (icon + wordmark) | "icon"
 * - `tone`: "light" for dark surfaces, "dark" for light surfaces, "auto" for theme surfaces
 */
const toneStyles = {
  light: { tagline: "text-slate-300", by: "text-slate-400" },
  dark: { tagline: "text-slate-600", by: "text-slate-400" },
  auto: { tagline: "text-base-content/70", by: "text-base-content/40" },
};

export function BrandIcon({ className = "h-9 w-9" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="e360-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="43" height="43" rx="12" fill="url(#e360-badge)" />
      {/* Stylised "E" shelves */}
      <rect x="13.5" y="12.5" width="5.5" height="23" rx="2" fill="#fff" />
      <rect x="13.5" y="12.5" width="19.5" height="5.5" rx="2" fill="#fff" />
      <rect x="13.5" y="21.25" width="15" height="5.5" rx="2" fill="#fff" />
      <rect x="13.5" y="30" width="19.5" height="5.5" rx="2" fill="#fff" />
      {/* Green stock box accent */}
      <rect x="30.5" y="28.5" width="9" height="9" rx="2.3" fill="#84cc16" />
    </svg>
  );
}

function Brandmark({ variant = "full", tone = "auto", className = "", iconClass = "h-9 w-9" }) {
  const t = toneStyles[tone] || toneStyles.auto;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandIcon className={`${iconClass} shrink-0`} />
      {variant !== "icon" && (
        <span className="flex flex-col leading-none">
          <span className="bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 bg-clip-text text-2xl font-black tracking-tight text-transparent">
            E360
          </span>
          {variant === "full" && (
            <span className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${t.tagline}`}>
              Inventory Suite
              <span className={t.by}> · by Eiretech</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default Brandmark;
