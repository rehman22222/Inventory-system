import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiGlobe, FiChevronDown } from "react-icons/fi";
import { LANGUAGES } from "../i18n";

/**
 * Language switcher. Changing the language is persisted (localStorage) and
 * applied app-wide via i18next + <html lang/dir>, so every page follows it.
 *
 * @param {"dark"|"light"|"auto"} tone  color scheme of the surrounding surface.
 *   "auto" follows the active DaisyUI theme (base-content/base-100).
 */
export default function LanguageSwitcher({ tone = "dark" }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current =
    LANGUAGES.find((l) => l.code === (i18n.language || "en").split("-")[0]) || LANGUAGES[0];

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  const dark = tone === "dark";
  const auto = tone === "auto";
  const triggerColor = auto
    ? "text-base-content/70 hover:text-base-content"
    : dark
    ? "text-paper/70 hover:text-paper"
    : "text-ink/70 hover:text-ink";
  const panelBg = auto
    ? "bg-base-100 border-base-300 text-base-content"
    : dark
    ? "bg-ink border-white/15 text-paper"
    : "bg-paper border-black/15 text-ink";
  const rowHover = auto ? "hover:bg-base-200" : dark ? "hover:bg-white/[0.06]" : "hover:bg-black/[0.05]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors ${triggerColor}`}
      >
        <FiGlobe className="text-sm" />
        {current.native}
        <FiChevronDown className={`text-xs transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          className={`absolute right-0 z-50 mt-3 w-44 border py-1 shadow-xl ${panelBg}`}
          style={{ borderRadius: 0 }}
        >
          {LANGUAGES.map((l) => {
            const active = l.code === current.code;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => choose(l.code)}
                  dir={l.dir}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${rowHover} ${
                    active ? "text-accent" : ""
                  }`}
                >
                  <span className="text-sm">{l.native}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-50">
                    {l.code}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
