import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Clock3,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  Twitter,
} from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import logo from "@/assets/logo-cop.png";

function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.4 3h3.1c.3 1.7 1.3 3.1 2.9 4v3.1a8.3 8.3 0 0 1-2.9-1v6.2A5.7 5.7 0 1 1 12 9.6v3.2a2.6 2.6 0 1 0 2.4 2.6V3Z" />
    </svg>
  );
}

export function Footer() {
  const { categories, settings } = useCatalog();
  const year = new Date().getFullYear();
  const social = [
    { key: "instagram", label: "Instagram", href: settings.social.instagram, Icon: Instagram },
    { key: "facebook", label: "Facebook", href: settings.social.facebook, Icon: Facebook },
    { key: "twitter", label: "X / Twitter", href: settings.social.twitter, Icon: Twitter },
    { key: "tiktok", label: "TikTok", href: settings.social.tiktok, Icon: TikTokIcon },
  ].filter((item) => item.href);

  return (
    <footer className="mt-24 overflow-hidden bg-ink text-primary-foreground">
      <div className="border-y border-primary-foreground/10">
        <div className="container-x grid divide-y divide-primary-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { Icon: Truck, title: "Free shipping", sub: "On orders over €50" },
            { Icon: Clock3, title: "Same-day dispatch", sub: "Fast local fulfilment" },
            { Icon: ShieldCheck, title: "Authentic products", sub: "Stock shared with E360Pro" },
          ].map(({ Icon, title, sub }) => (
            <div key={title} className="flex items-center gap-3 py-5 sm:px-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <div className="font-display text-sm">{title}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-primary-foreground/50">
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute -right-10 top-0 select-none font-display text-[18vw] leading-none text-primary-foreground/[0.025]">
          CANDY
        </div>
        <div className="container-x relative grid gap-12 py-14 md:grid-cols-2 lg:grid-cols-[1.5fr_0.8fr_0.9fr]">
          <div>
            <img
              src={logo}
              alt="Candy Cloud Vape"
              width={640}
              height={640}
              loading="lazy"
              className="h-32 w-auto sm:h-40"
            />
            <p className="mt-5 max-w-md text-sm leading-7 text-primary-foreground/60">
              {settings.footer.description}
            </p>
            {social.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {social.map(({ key, label, href, Icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${label}`}
                    title={label}
                    className="group inline-flex h-10 items-center gap-2 border border-primary-foreground/20 px-3 font-mono text-[10px] uppercase tracking-widest transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <FooterHeading>Shop</FooterHeading>
            <ul className="mt-5 space-y-2.5 text-sm">
              {categories.slice(0, 7).map((category) => (
                <li key={category.slug}>
                  <Link
                    to="/category/$slug"
                    params={{ slug: category.slug }}
                    className="text-primary-foreground/65 transition-colors hover:text-accent"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/sale" className="text-accent transition-opacity hover:opacity-80">
                  Current offers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <FooterHeading>Contact & support</FooterHeading>
            <div className="mt-5 space-y-4 text-sm text-primary-foreground/65">
              {settings.footer.supportEmail && (
                <a
                  className="flex items-start gap-3 transition-colors hover:text-accent"
                  href={`mailto:${settings.footer.supportEmail}`}
                >
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{settings.footer.supportEmail}</span>
                </a>
              )}
              {settings.footer.supportPhone && (
                <a
                  className="flex items-start gap-3 transition-colors hover:text-accent"
                  href={`tel:${settings.footer.supportPhone.replace(/[^\d+]/g, "")}`}
                >
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{settings.footer.supportPhone}</span>
                </a>
              )}
              {settings.footer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{settings.footer.address}</span>
                </div>
              )}
              <Link to="/shop" className="block transition-colors hover:text-accent">
                Browse all products
              </Link>
              <Link to="/cart" className="block transition-colors hover:text-accent">
                View basket
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container-x flex flex-col gap-3 py-6 font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Candy Cloud Vape</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-accent" />
            Contains nicotine · Highly addictive substance
          </span>
          <span>21+ only · EUR storefront</span>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{children}</div>
      <span className="mt-3 block h-px w-8 bg-primary-foreground/20" />
    </>
  );
}
