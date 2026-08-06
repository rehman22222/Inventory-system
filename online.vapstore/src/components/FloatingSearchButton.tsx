import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FloatingSearchButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 260);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ to: "/search", search: { q: query.trim() } });
    setOpen(false);
  };

  return (
    <div
      className={`fixed bottom-20 right-5 z-40 md:bottom-24 md:right-7 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      } transition-all duration-300`}
    >
      {open && (
        <form
          onSubmit={submit}
          className="mb-3 flex w-[min(20rem,calc(100vw-2.5rem))] items-center gap-2 rounded-full border border-white/55 bg-white/85 p-2 text-ink shadow-[0_18px_45px_rgba(0,0,0,0.25)] backdrop-blur-md"
        >
          <Search className="ml-2 h-4 w-4 shrink-0 text-ink-muted" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("nav.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            className="rounded-full bg-ink px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            {t("nav.search")}
          </button>
        </form>
      )}

      <button
        type="button"
        aria-label={t("nav.searchProducts")}
        onClick={() => setOpen((value) => !value)}
        className="ml-auto grid h-12 w-12 place-items-center rounded-full border border-white/55 bg-white/70 text-ink shadow-[0_18px_45px_rgba(0,0,0,0.25)] backdrop-blur-md transition hover:bg-white hover:shadow-[0_22px_55px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {open ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>
    </div>
  );
}
