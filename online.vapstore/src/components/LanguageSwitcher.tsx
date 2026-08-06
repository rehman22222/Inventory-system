import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe2, ChevronDown } from "lucide-react";
import { languages } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current =
    languages.find((language) => language.code === (i18n.language || "en").split("-")[0]) ||
    languages[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (code: string) => {
    void i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Change language"
        className="inline-flex items-center gap-1.5 text-current/80 transition-colors hover:text-current"
      >
        <Globe2 className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] uppercase tracking-widest">{current.short}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-36 border border-white/15 bg-ink py-1 text-primary-foreground shadow-xl">
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => choose(language.code)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
                language.code === current.code ? "text-accent" : ""
              }`}
            >
              <span>{language.native}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-55">
                {language.short}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
