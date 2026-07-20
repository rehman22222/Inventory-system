import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaTwitter, FaLinkedinIn, FaGithub } from 'react-icons/fa';
import e360LogoDark from '../images/e360-logo-dark.png';

function FooterLink({ children }) {
  return (
    <a href="#" className="group relative inline-block text-sm text-paper/55 transition-colors hover:text-paper">
      {children}
      <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
    </a>
  );
}

function Footer() {
  const { t } = useTranslation();
  const productLinks = t('footer.product', { returnObjects: true }) || [];
  return (
    <footer className="bg-ink font-body text-paper">
      <div className="mx-auto max-w-7xl border-x border-white/10 px-6">
        {/* Top — brand + status */}
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 py-12 md:grid-cols-12">
          <div className="md:col-span-6">
            <img src={e360LogoDark} className="h-14 w-auto object-contain" alt="E360 Inventory Suite by Eiretech" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/50">{t('footer.tagline')}</p>
          </div>

          <div className="md:col-span-3">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">{t('footer.colProduct')}</p>
            <ul className="space-y-3">
              {productLinks.map((l) => (
                <li key={l}>
                  <FooterLink>{l}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">{t('footer.colContact')}</p>
            <ul className="space-y-3 font-mono text-xs text-paper/55">
              <li>support@e360pro.com</li>
              <li>+022 338 983 902</li>
              <li>Dublin · Tech City</li>
            </ul>
            <div className="mt-5 flex gap-3">
              {[FaTwitter, FaLinkedinIn, FaGithub].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center border border-white/15 text-paper/60 transition-colors hover:border-accent hover:text-accent"
                >
                  <Icon className="text-sm" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom — colophon line */}
        <div className="flex flex-col gap-3 py-6 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} {t('footer.rights')}</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 bg-accent" />
            SYS.STATUS — OPERATIONAL · v1.0
          </span>
          <span className="hidden md:block">LAT 53.34 / LON -6.26</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
