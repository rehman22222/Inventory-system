import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MapPin, Phone, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCatalog } from "@/lib/catalog-context";
import { submitContactMessage } from "@/lib/catalog-api";

export const Route = createFileRoute("/contact")({
  component: Contact,
  head: () => ({
    meta: [
      { title: "Contact — CliffsOfPuff" },
      { name: "description", content: "Get in touch with the CliffsOfPuff team." },
    ],
  }),
});

function Contact() {
  const { settings } = useCatalog();
  const { footer } = settings;
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    website: "", // honeypot — must stay empty
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await submitContactMessage({ data: form });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  };

  const details = [
    footer.supportEmail && {
      Icon: Mail,
      label: footer.supportEmail,
      href: `mailto:${footer.supportEmail}`,
    },
    footer.supportPhone && {
      Icon: Phone,
      label: footer.supportPhone,
      href: `tel:${footer.supportPhone.replace(/[^\d+]/g, "")}`,
    },
    footer.address && { Icon: MapPin, label: footer.address, href: undefined },
  ].filter(Boolean) as { Icon: typeof Mail; label: string; href?: string }[];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="border-b hair">
        <div className="container-x py-10 md:py-14">
          <div className="eyebrow">Support</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight">
            Contact us.
          </h1>
          <p className="mt-4 max-w-xl text-ink-muted">
            Questions about an order, a product or stock? Send us a message and we'll get back to
            you.
          </p>
        </div>
      </section>

      <section className="container-x py-10 md:py-14 grid gap-10 lg:grid-cols-[1fr_360px]">
        {sent ? (
          <div className="border hair bg-surface p-8">
            <CheckCircle2 className="h-10 w-10" />
            <h2 className="mt-4 font-display text-2xl">Message sent.</h2>
            <p className="mt-3 text-ink-muted">
              Thanks for getting in touch — we'll reply to you as soon as we can.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Honeypot: hidden from users, catches bots. */}
            <div className="hidden" aria-hidden="true">
              <label>
                Leave this field empty
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(event) => set("website", event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name">
                <input
                  className="input-field"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="input-field"
                  required
                  maxLength={200}
                  value={form.email}
                  onChange={(event) => set("email", event.target.value)}
                />
              </Field>
            </div>
            <Field label="Subject">
              <input
                className="input-field"
                maxLength={150}
                value={form.subject}
                onChange={(event) => set("subject", event.target.value)}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="input-field min-h-[160px]"
                required
                minLength={5}
                maxLength={4000}
                value={form.message}
                onChange={(event) => set("message", event.target.value)}
              />
            </Field>

            {error && <p className="text-sm text-[color:var(--sale)]">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary disabled:opacity-40">
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        )}

        <aside className="space-y-5">
          {details.length > 0 && (
            <div className="border hair bg-surface p-6">
              <div className="eyebrow mb-4">Reach us directly</div>
              <ul className="space-y-3 text-sm">
                {details.map(({ Icon, label, href }) => (
                  <li key={label} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                    {href ? (
                      <a href={href} className="transition-colors hover:text-accent-foreground">
                        {label}
                      </a>
                    ) : (
                      <span>{label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border hair bg-surface p-6 text-sm text-ink-muted">
            <div className="eyebrow mb-3">Age-restricted store</div>
            You must be 18 or over to purchase from this store. Nicotine is an addictive substance.
          </div>
        </aside>
      </section>

      <Footer />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
