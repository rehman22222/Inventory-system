import { Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Facebook, Instagram } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { subscribeNewsletter } from "@/lib/catalog-api";
import logo from "@/assets/logo-cop.png";

const footerBrandLogos = [
  { src: "/brand-marquee/elfbar.png", alt: "Elf Bar" },
  { src: "/brand-marquee/ivg.png", alt: "IVG" },
  { src: "/brand-marquee/aspire.png", alt: "Aspire" },
  { src: "/brand-marquee/lost-mary.png", alt: "Lost Mary", featured: true },
  { src: "/brand-marquee/vaporesso.png", alt: "Vaporesso", featured: true },
];

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
  const [email, setEmail] = useState("");
  const [newsletterState, setNewsletterState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const year = new Date().getFullYear();

  const categoryLinks = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  const social = [
    { key: "facebook", label: "Facebook", href: settings.social.facebook, Icon: Facebook },
    { key: "instagram", label: "Instagram", href: settings.social.instagram, Icon: Instagram },
    { key: "tiktok", label: "TikTok", href: settings.social.tiktok, Icon: TikTokIcon },
    { key: "twitter", label: "Twitter", href: settings.social.twitter, Icon: XIcon },
  ].filter((item) => item.href);

  const submitNewsletter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterState("saving");
    setNewsletterMessage("");
    try {
      const result = await subscribeNewsletter({ data: { email } });
      setNewsletterState("done");
      setNewsletterMessage(
        result.message ||
          t("footer.newsletterSuccess", { defaultValue: "Thanks — you're subscribed." }),
      );
      setEmail("");
    } catch (error) {
      setNewsletterState("error");
      setNewsletterMessage(
        error instanceof Error
          ? error.message
          : t("footer.newsletterError", {
              defaultValue: "Could not subscribe. Please try again.",
            }),
      );
    }
  };

  return (
    <footer className="mt-16 overflow-hidden bg-black text-white">
      <FooterBrandMarquee />
      <div className="container-x grid gap-9 py-12 text-center md:grid-cols-[1.05fr_1.35fr_0.9fr_0.9fr_1.25fr] md:text-left lg:gap-10">
        <div className="flex flex-col items-center md:items-start">
          <Link to="/" className="mb-6 flex justify-center md:justify-start" aria-label="Cliffs of Puff home">
            <img
              src={logo}
              alt="Cliffs of Puff"
              className="h-28 w-auto object-contain drop-shadow-[0_10px_30px_rgba(198,255,46,0.18)]"
              loading="lazy"
            />
          </Link>
          {settings.footer.supportEmail && (
            <p className="text-sm">
              Email:{" "}
              <a
                href={`mailto:${settings.footer.supportEmail}`}
                className="underline underline-offset-4 transition-colors hover:text-accent"
              >
                {settings.footer.supportEmail}
              </a>
            </p>
          )}
          {settings.footer.openingHours && (
            <p className="mt-3 text-sm text-white/85">{settings.footer.openingHours}</p>
          )}
        </div>

        <ul className="grid grid-cols-2 gap-x-7 gap-y-3.5 text-sm">
          {categoryLinks.map((category) => (
            <FooterLink key={category.slug}>
              <Link to="/category/$slug" params={{ slug: category.slug }}>
                {category.name}
              </Link>
            </FooterLink>
          ))}
        </ul>

        <FooterColumn>
          <FooterLink>
            <Link to="/contact">Contact us</Link>
          </FooterLink>
          <FooterLink>
            <span>Terms and Conditions</span>
          </FooterLink>
          <FooterLink>
            <span>Privacy Policy</span>
          </FooterLink>
          <FooterLink>
            <span>Return &amp; Refund</span>
          </FooterLink>
          <FooterLink>
            <span>About Us</span>
          </FooterLink>
        </FooterColumn>

        <FooterColumn>
          <FooterLink>
            <a href="/#best-sellers">Best Sellers</a>
          </FooterLink>
          <FooterLink>
            <span>{settings.footer.whyECigarettesTitle || "Why e-cigarettes?"}</span>
          </FooterLink>
          <FooterLink>
            <Link to="/sale">Deals</Link>
          </FooterLink>
        </FooterColumn>

        <div>
          <form className="mx-auto flex max-w-xs border border-white/60 md:mx-0" onSubmit={submitNewsletter}>
            <label className="sr-only" htmlFor="footer-email">
              {t("footer.emailLabel")}
            </label>
            <input
              id="footer-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={settings.footer.newsletterHeading || "Subscribe to our news letter"}
              required
              className="min-w-0 flex-1 bg-[#e9e7df] px-3 py-2 text-sm text-black outline-none placeholder:text-black/65"
            />
            <button
              type="submit"
              disabled={newsletterState === "saving"}
              className="border-l border-red-600 px-2.5 font-display text-[10px] uppercase tracking-widest text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {newsletterState === "saving" ? "Saving" : "Subscribe"}
            </button>
          </form>
          {newsletterMessage && (
            <p
              className={`mt-3 text-xs ${
                newsletterState === "error" ? "text-red-300" : "text-accent"
              }`}
            >
              {newsletterMessage}
            </p>
          )}
          {social.length > 0 && (
            <div className="mt-6 space-y-3">
              {social.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 text-sm transition-colors hover:text-accent md:justify-start"
                >
                  <span className="grid h-6 w-6 place-items-center">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span>Follow us on {label}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container-x grid items-center gap-5 pb-10 text-center text-sm md:grid-cols-[1fr_auto_1fr]">
        <div className="order-1 flex justify-center gap-5 md:justify-start">
          {settings.footer.paymentImage && (
            <img
              src={settings.footer.paymentImage}
              alt="Accepted payment methods"
              className="h-9 w-auto object-contain"
              loading="lazy"
            />
          )}
        </div>
        <p className="order-3 mx-auto max-w-[18rem] text-xs leading-5 text-white/85 sm:max-w-none sm:text-sm md:order-2">
          &copy; {year} Copyright Cliffs of Puff
          <span className="hidden sm:inline">&nbsp; | &nbsp;</span>
          <span className="block sm:inline">Created by Eiretech360</span>
        </p>
        <div className="order-2 flex justify-center md:order-3 md:justify-end">
          {settings.footer.restrictionImage && (
            <img
              src={settings.footer.restrictionImage}
              alt="Age restricted product warnings"
              className="h-9 w-auto object-contain"
              loading="lazy"
            />
          )}
        </div>
      </div>

      {(settings.business.tradingName ||
        settings.business.legalName ||
        settings.business.companyNumber ||
        settings.business.vatNumber) && (
        <div className="border-t border-white/10">
          <div className="container-x flex flex-wrap justify-center gap-x-6 gap-y-2 py-4 text-xs text-white/40">
            {[
              settings.business.tradingName,
              settings.business.legalName,
              settings.business.companyNumber,
              settings.business.vatNumber,
            ]
              .filter(Boolean)
              .map((item) => (
                <span key={item}>{item}</span>
              ))}
          </div>
        </div>
      )}
    </footer>
  );
}

function FooterBrandMarquee() {
  const sequence = [...footerBrandLogos, ...footerBrandLogos];
  const row = [...sequence, ...sequence];

  return (
    <section
      className="border-y border-black/10 bg-[#efeee9] text-black"
      aria-label="Featured brands"
    >
      <div className="overflow-hidden">
        <div className="footer-brand-marquee-track flex items-center whitespace-nowrap py-2.5 sm:py-3.5">
          {row.map((brand, index) => (
            <div
              key={`${brand.alt}-${index}`}
              className="mx-2.5 flex h-9 w-[5.7rem] shrink-0 items-center justify-center sm:mx-4 sm:h-10 sm:w-[6.9rem] lg:mx-5 lg:h-11 lg:w-[8.2rem]"
            >
              <img
                src={brand.src}
                alt={brand.alt}
                className={`max-h-full max-w-full object-contain opacity-90 grayscale-[8%] contrast-110 transition duration-300 hover:opacity-100 hover:grayscale-0 ${
                  brand.featured ? "scale-[1.12]" : ""
                }`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FooterColumn({ children }: { children: ReactNode }) {
  return <ul className="space-y-5 text-sm">{children}</ul>;
}

function FooterLink({ children }: { children: ReactNode }) {
  return (
    <li className="[&_a]:text-white [&_a]:transition-colors [&_a:hover]:text-accent [&_span]:text-white">
      {children}
    </li>
  );
}
