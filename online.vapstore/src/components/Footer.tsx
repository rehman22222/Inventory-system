import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Clock3, Facebook, Instagram, Mail, MapPin, Phone, ShieldCheck, Truck } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { openCookiePreferences } from "@/components/CookieConsent";
import logo from "@/assets/logo-cop.png";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.9-6.4L6.5 22H3.4l7.2-8.2L2.9 2h6.4l4.4 5.9L18.9 2Zm-1.1 17.8h1.7L8.4 4.1H6.6l11.2 15.7Z" />
    </svg>
  );
}

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
    { key: "twitter", label: "X / Twitter", href: settings.social.twitter, Icon: XIcon },
    { key: "tiktok", label: "TikTok", href: settings.social.tiktok, Icon: TikTokIcon },
  ].filter((item) => item.href);

  const business = settings.business;
  // Legal transparency row — company number / VAT only. The trading name is
  // already shown in the copyright line, so it isn't repeated here.
  const businessBits = [
    business.companyNumber && `Company no. ${business.companyNumber}`,
    business.vatNumber && `VAT ${business.vatNumber}`,
  ].filter(Boolean);

  const legal = [
    { to: "/terms" as const, label: "Terms" },
    { to: "/privacy" as const, label: "Privacy" },
    { to: "/shipping-returns" as const, label: "Shipping & Returns" },
    { to: "/refunds" as const, label: "Refunds" },
    { to: "/cookies" as const, label: "Cookies" },
    { to: "/contact" as const, label: "Contact" },
  ];

  return (
    <footer className="mt-16 overflow-hidden bg-ink text-primary-foreground">
      <div className="border-y border-primary-foreground/10 bg-primary-foreground/[0.025]">
        <div className="container-x grid divide-y divide-primary-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            {
              Icon: Truck,
              title: "Free shipping",
              sub: `On orders over €${settings.shipping.freeThreshold}`,
            },
            { Icon: Clock3, title: settings.promises.dispatch, sub: "Fast local fulfilment" },
            { Icon: ShieldCheck, title: "Authentic products", sub: "Genuine, sealed stock" },
          ].map(({ Icon, title, sub }) => (
            <div key={title} className="flex items-center gap-3 py-3.5 sm:px-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <div className="font-display text-[13px]">{title}</div>
                <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-primary-foreground/45">
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container-x grid gap-9 py-8 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1.05fr] lg:gap-12">
        <div>
          <img
            src={logo}
            alt="CliffsOfPuff"
            width={640}
            height={640}
            loading="lazy"
            className="h-24 w-auto"
          />
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-primary-foreground/60">
            {settings.footer.description}
          </p>
          {social.length > 0 && (
            <div>
              <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-primary-foreground/40">
                Follow us
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {social.map(({ key, label, href, Icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${label}`}
                    title={label}
                    className="grid h-9 w-9 place-items-center rounded-full border border-primary-foreground/20 text-primary-foreground/75 transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <FooterHeading>Shop</FooterHeading>
          <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[13px]">
            {categories.slice(0, 7).map((category) => (
              <li key={category.slug}>
                <Link
                  to="/category/$slug"
                  params={{ slug: category.slug }}
                  className="line-clamp-1 text-primary-foreground/65 transition-colors hover:text-accent"
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
          <div className="mt-4 space-y-2.5 text-[13px] text-primary-foreground/65">
            {settings.footer.supportEmail && (
              <a
                className="flex items-start gap-2.5 transition-colors hover:text-accent"
                href={`mailto:${settings.footer.supportEmail}`}
              >
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{settings.footer.supportEmail}</span>
              </a>
            )}
            {settings.footer.supportPhone && (
              <a
                className="flex items-start gap-2.5 transition-colors hover:text-accent"
                href={`tel:${settings.footer.supportPhone.replace(/[^\d+]/g, "")}`}
              >
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{settings.footer.supportPhone}</span>
              </a>
            )}
            {settings.footer.address && (
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{settings.footer.address}</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-primary-foreground/10 pt-3 text-[12px]">
            <Link
              to="/shop"
              className="text-primary-foreground/65 transition-colors hover:text-accent"
            >
              Browse products
            </Link>
            <Link
              to="/cart"
              className="text-primary-foreground/65 transition-colors hover:text-accent"
            >
              View basket
            </Link>
            <Link
              to="/contact"
              className="text-primary-foreground/65 transition-colors hover:text-accent"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container-x flex flex-wrap gap-x-5 gap-y-2 py-4 text-[12px]">
          {legal.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-primary-foreground/60 transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={openCookiePreferences}
            className="text-primary-foreground/60 transition-colors hover:text-accent"
          >
            Cookie settings
          </button>
        </div>
      </div>

      {businessBits.length > 0 && (
        <div className="border-t border-primary-foreground/10">
          <div className="container-x py-3 font-mono text-[10px] tracking-[0.05em] text-primary-foreground/45">
            {businessBits.join("  ·  ")}
          </div>
        </div>
      )}

      <div className="border-t border-primary-foreground/10">
        <div className="container-x flex flex-col gap-2 py-4 font-mono text-[9px] uppercase tracking-[0.15em] text-primary-foreground/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} CliffsOfPuff</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Contains nicotine · Highly addictive substance
          </span>
          <span>18+ only</span>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{children}</div>
      <span className="mt-2.5 block h-px w-7 bg-primary-foreground/20" />
    </>
  );
}
