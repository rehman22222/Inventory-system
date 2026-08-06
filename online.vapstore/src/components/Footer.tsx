import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
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
  const { t } = useTranslation();
  const { categories, settings } = useCatalog();
  const year = new Date().getFullYear();
  const social = [
    { key: "instagram", label: "Instagram", href: settings.social.instagram, Icon: Instagram },
    { key: "facebook", label: "Facebook", href: settings.social.facebook, Icon: Facebook },
    { key: "twitter", label: "X / Twitter", href: settings.social.twitter, Icon: XIcon },
    { key: "tiktok", label: "TikTok", href: settings.social.tiktok, Icon: TikTokIcon },
  ].filter((item) => item.href);

  const legal = [
    { to: "/terms" as const, label: t("footer.terms") },
    { to: "/privacy" as const, label: t("footer.privacy") },
    { to: "/shipping-returns" as const, label: t("footer.shippingReturns") },
  ];
  const business = [
    settings.business.tradingName && {
      label: t("footer.tradingName", { defaultValue: "Trading name" }),
      value: settings.business.tradingName,
    },
    settings.business.legalName && {
      label: t("footer.legalName", { defaultValue: "Legal name" }),
      value: settings.business.legalName,
    },
    settings.business.companyNumber && {
      label: t("footer.companyNumber", { defaultValue: "Company no." }),
      value: settings.business.companyNumber,
    },
    settings.business.vatNumber && {
      label: t("footer.vatNumber", { defaultValue: "VAT no." }),
      value: settings.business.vatNumber,
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <footer className="mt-16 overflow-hidden bg-black text-white">
      <div className="container-x grid gap-12 py-14 md:grid-cols-[1.4fr_1fr_1fr] lg:gap-16 lg:py-20">
        <div className="md:border-r md:border-white/15 md:pr-10">
          <Link to="/" className="mb-8 flex justify-center md:justify-start" aria-label="CliffsOfPuff home">
            <img
              src={logo}
              alt="CliffsOfPuff"
              className="h-24 w-auto object-contain drop-shadow-[0_10px_30px_rgba(255,255,255,0.14)]"
              loading="lazy"
            />
          </Link>
          <FooterHeading>{t("footer.newsletter")}</FooterHeading>
          <form className="mt-8 flex border border-white/55">
            <label className="sr-only" htmlFor="footer-email">
              {t("footer.emailLabel")}
            </label>
            <input
              id="footer-email"
              type="email"
              placeholder={t("footer.emailPlaceholder")}
              className="min-w-0 flex-1 bg-white/12 px-5 py-4 text-sm text-white outline-none placeholder:text-white/45"
            />
            <button
              type="button"
              className="px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/65 transition-colors hover:text-accent"
            >
              {t("footer.submit")}
            </button>
          </form>
          {(settings.footer.description || t("footer.description")) && (
            <p className="mt-6 max-w-lg text-sm leading-7 text-white/55">
              {settings.footer.description || t("footer.description")}
            </p>
          )}

          {social.length > 0 && (
            <div className="mt-10">
              <FooterHeading>{t("footer.followUs")}</FooterHeading>
              <div className="mt-6 flex flex-wrap gap-5">
                {social.map(({ key, label, href, Icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${label}`}
                    title={label}
                    className="grid h-9 w-9 place-items-center text-white transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <FooterHeading>{t("footer.information")}</FooterHeading>
          <ul className="mt-8 space-y-6 text-sm">
            {categories.slice(0, 8).map((category) => (
              <li key={category.slug}>
                <Link
                  to="/category/$slug"
                  params={{ slug: category.slug }}
                  className="line-clamp-1 text-white transition-colors hover:text-accent"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/sale" className="text-white transition-colors hover:text-accent">
                {t("footer.currentOffers")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <FooterHeading>{t("footer.contact")}</FooterHeading>
          <div className="mt-8 space-y-6 text-sm text-white">
            {settings.footer.address && (
              <div className="flex items-start gap-3 uppercase">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{settings.footer.address}</span>
              </div>
            )}
            {settings.footer.supportEmail && (
              <a
                className="flex items-start gap-3 transition-colors hover:text-accent"
                href={`mailto:${settings.footer.supportEmail}`}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{settings.footer.supportEmail}</span>
              </a>
            )}
            {settings.footer.supportPhone && (
              <a
                className="flex items-start gap-3 transition-colors hover:text-accent"
                href={`tel:${settings.footer.supportPhone.replace(/[^\d+]/g, "")}`}
              >
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{settings.footer.supportPhone}</span>
              </a>
            )}
          </div>
          {business.length > 0 && (
            <div className="mt-10 border-t border-white/15 pt-8">
              <FooterHeading>
                {t("footer.businessLegal", { defaultValue: "Business & legal" })}
              </FooterHeading>
              <dl className="mt-6 space-y-3 text-sm">
                {business.map((item) => (
                  <div key={item.label} className="grid gap-1">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                      {item.label}
                    </dt>
                    <dd className="text-white/80">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="container-x flex flex-wrap justify-center gap-x-6 gap-y-2 py-6 text-sm">
          {legal.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-white/65 transition-colors hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-x py-7 text-center text-xs text-white/30">
          {t("footer.copyright", { year })}
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-base font-medium uppercase tracking-[0.08em] text-white md:text-left">
      {children}
    </div>
  );
}
