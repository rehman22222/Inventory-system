import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiMenu, FiX } from 'react-icons/fi';
import logo2 from '../images/e360-logo-dark.png';
import LanguageSwitcher from './LanguageSwitcher';

const NAV = [
  { key: 'features', href: '#features' },
  { key: 'workflow', href: '#workflow' },
  { key: 'system', href: '#system' },
  { key: 'faq', href: '#faq' },
];

const TICKER = [
  'SKUs TRACKED 12,480',
  'OPEN ORDERS 87',
  'LOW STOCK 14',
  'UPTIME 99.98%',
  'PAYMENT RAILS 05',
  'ROLES 03',
  'STOCK VARIANCE ±0',
];

function NavLink({ href, label, onClick }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="group relative font-mono text-[11px] uppercase tracking-[0.2em] text-paper/60 transition-colors hover:text-paper"
    >
      {label}
      <span className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
    </a>
  );
}

function Navbar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#08090A] font-body text-paper" dir="ltr">
      {/* Ticker strip */}
      <div className="overflow-hidden border-b border-white/10">
        <div className="flex w-max animate-ticker whitespace-nowrap py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="flex items-center">
              <span className="px-6">{item}</span>
              <span className="text-accent">/</span>
            </span>
          ))}
        </div>
      </div>

      {/* Nav row */}
      <div className="border-b border-white/10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center">
            <img
              src={logo2}
              className="h-32 w-auto object-contain"
              alt="E360 Inventory Suite by Eiretech"
            />
          </Link>

          <div className="hidden items-center gap-10 lg:flex">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href} label={t(`nav.${item.key}`)} />
            ))}
          </div>

          <div className="hidden items-center gap-6 lg:flex">
            <LanguageSwitcher tone="dark" />
            <span className="h-4 w-px bg-white/15" />
            <Link
              to="/LoginPage"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/70 transition-colors hover:text-paper"
            >
              {t('nav.signin')}
            </Link>
            <Link
              to="/LoginPage"
              className="border border-accent bg-accent px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-transparent hover:text-accent"
            >
              {t('nav.startFree')}
            </Link>
          </div>

          <div className="flex items-center gap-4 lg:hidden">
            <LanguageSwitcher tone="dark" />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              className="text-paper"
            >
              {open ? <FiX className="text-2xl" /> : <FiMenu className="text-2xl" />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-white/10 px-6 py-6 lg:hidden">
            <div className="flex flex-col gap-5">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={t(`nav.${item.key}`)}
                  onClick={() => setOpen(false)}
                />
              ))}
              <div className="mt-2 flex items-center gap-4">
                <Link
                  to="/LoginPage"
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/70"
                >
                  {t('nav.signin')}
                </Link>
                <Link
                  to="/LoginPage"
                  className="border border-accent bg-accent px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white"
                >
                  {t('nav.startFree')}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Navbar;
