import React from 'react';
import { FaFacebook, FaTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa';
import { FiMail, FiPhone, FiMapPin } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import e360LogoWhite from '../images/e360-logo-white.png';

function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="mx-auto max-w-7xl border-t border-slate-800 px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <img
              src={e360LogoWhite}
              className="h-12 w-auto object-contain"
              alt="E360 Inventory Suite by Eiretech"
            />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Efficient inventory management for product-based businesses — track stock, manage orders, and sell smarter.
            </p>
            <div className="mt-6 flex gap-4">
              {[
                { icon: FaFacebook, href: '#' },
                { icon: FaTwitter, href: '#' },
                { icon: FaLinkedin, href: '#' },
                { icon: FaInstagram, href: '#' },
              ].map(({ icon: Icon, href }) => (
                <a
                  key={href + Icon}
                  href={href}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-500 transition hover:border-slate-600 hover:text-white"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-300">
              Product
            </h3>
            <ul className="space-y-3 text-sm">
              {['Dashboard', 'Products', 'Point of Sale', 'Analytics', 'Reports'].map((item) => (
                <li key={item}>
                  <a href="#" className="transition hover:text-white">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-300">
              Company
            </h3>
            <ul className="space-y-3 text-sm">
              {['About Us', 'Blog', 'Careers', 'Privacy Policy', 'Terms of Service'].map((item) => (
                <li key={item}>
                  <a href="#" className="transition hover:text-white">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-300">
              Contact
            </h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <FiMail className="mt-0.5 shrink-0 text-cyan-500" />
                <span>support@inventorypro.com</span>
              </li>
              <li className="flex items-start gap-3">
                <FiPhone className="mt-0.5 shrink-0 text-cyan-500" />
                <span>022-338-983-902</span>
              </li>
              <li className="flex items-start gap-3">
                <FiMapPin className="mt-0.5 shrink-0 text-cyan-500" />
                <span>123 Inventory St, Tech City</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 px-6 py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-sm text-slate-600 md:flex-row">
          <p>© {new Date().getFullYear()} E360 Inventory Suite by Eiretech. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="transition hover:text-slate-400">
              Privacy
            </a>
            <a href="#" className="transition hover:text-slate-400">
              Terms
            </a>
            <a href="#" className="transition hover:text-slate-400">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
