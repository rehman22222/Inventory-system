import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Components/Navbar';
import Footer from '../Components/Footer';
import Reveal from '../Components/Reveal';
import CountUp from '../Components/CountUp';
import {
  FiPackage,
  FiBarChart2,
  FiShoppingCart,
  FiUsers,
  FiZap,
  FiShield,
  FiArrowRight,
  FiCheck,
  FiPlus,
  FiTrendingUp,
  FiRefreshCw,
  FiClock,
} from 'react-icons/fi';

const FEATURES = [
  {
    icon: FiPackage,
    title: 'Real-Time Stock Tracking',
    description:
      'Monitor inventory levels across every category the moment they change. Automated low-stock alerts keep you one step ahead.',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/20',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
    accent: 'group-hover:border-cyan-500/40',
  },
  {
    icon: FiUsers,
    title: 'Multi-Role Access Control',
    description:
      'Assign Admin, Manager, and Staff roles with granular permissions. Your data stays secure without slowing your team down.',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    accent: 'group-hover:border-indigo-500/40',
  },
  {
    icon: FiShoppingCart,
    title: 'Built-In Point of Sale',
    description:
      'Full POS with barcode scanning, receipt printing, and five payment methods — cash, card, bank transfer, Easypaisa, JazzCash.',
    iconBg: 'bg-violet-50 dark:bg-violet-900/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
    accent: 'group-hover:border-violet-500/40',
  },
  {
    icon: FiBarChart2,
    title: 'Sales & Analytics',
    description:
      'Track revenue trends, top-selling products, and performance KPIs with interactive charts that update in real-time.',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    accent: 'group-hover:border-emerald-500/40',
  },
  {
    icon: FiRefreshCw,
    title: 'Supplier & Order Management',
    description:
      'Manage supplier relationships, track purchase orders, and automate restock workflows — all from one dashboard.',
    iconBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    accent: 'group-hover:border-amber-500/40',
  },
  {
    icon: FiClock,
    title: 'Full Activity Log',
    description:
      'Every action is timestamped, attributed, and logged. Know exactly who changed what and when, with IP address tracking.',
    iconBg: 'bg-rose-50 dark:bg-rose-900/20',
    iconColor: 'text-rose-600 dark:text-rose-400',
    accent: 'group-hover:border-rose-500/40',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Set Up Your Catalog',
    description: 'Add products, categories, and suppliers. Import in bulk or one at a time. Your store is ready in minutes.',
    icon: FiPackage,
    numColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    iconColor: 'text-cyan-400',
  },
  {
    number: '02',
    title: 'Manage Daily Operations',
    description: 'Process sales through the POS, handle stock transfers, manage orders — your whole workflow in one place.',
    icon: FiShoppingCart,
    numColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    iconColor: 'text-indigo-400',
  },
  {
    number: '03',
    title: 'Analyze & Grow',
    description: 'Review reports, monitor trends, spot opportunities. Make data-driven decisions that actually move the needle.',
    icon: FiTrendingUp,
    numColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    iconColor: 'text-violet-400',
  },
];

const FAQS = [
  {
    question: 'What is E360?',
    answer:
      'E360 is a full-featured inventory management system for product-based businesses. It combines real-time stock tracking, a built-in POS, analytics, supplier management, multi-role access, and activity logging in a single platform.',
  },
  {
    question: 'What user roles are supported?',
    answer:
      'Three roles: Admin (full system access), Manager (inventory, reports, suppliers), and Staff (POS and basic operations). Each role has carefully scoped permissions so your team only sees what they need.',
  },
  {
    question: 'Does it include a Point of Sale system?',
    answer:
      'Yes — the built-in POS supports barcode scanning, five payment methods (cash, card, bank transfer, Easypaisa, JazzCash), receipt generation, and automatic stock deduction on checkout.',
  },
  {
    question: 'Can it run without an internet connection?',
    answer:
      'The system supports a local storage mode (USE_LOCAL_STORAGE=true) for offline environments. The default mode uses a cloud MongoDB database with real-time Socket.IO updates.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes! Sign up and explore every feature for free. No credit card required and no artificial limits during the trial.',
  },
];

const CHART_BARS = [55, 70, 45, 88, 60, 78, 52, 92, 67, 95, 72, 85];

function HomePage() {
  const [openFAQ, setOpenFAQ] = useState(null);

  return (
    <div className="bg-base-100 font-body text-base-content">
      <Navbar />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-ink text-paper">
        {/* technical grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(#ffffff 1px,transparent 1px),linear-gradient(90deg,#ffffff 1px,transparent 1px)',
            backgroundSize: '88px 88px',
          }}
        />

        <div className="relative mx-auto max-w-7xl border-x border-white/10 px-6">
          {/* corner crosshairs */}
          <span aria-hidden className="pointer-events-none absolute -left-[6px] -top-[6px] font-mono text-xs text-paper/40">+</span>
          <span aria-hidden className="pointer-events-none absolute -right-[6px] -top-[6px] font-mono text-xs text-paper/40">+</span>
          <span aria-hidden className="pointer-events-none absolute -bottom-[6px] -left-[6px] font-mono text-xs text-paper/40">+</span>
          <span aria-hidden className="pointer-events-none absolute -bottom-[6px] -right-[6px] font-mono text-xs text-paper/40">+</span>

          {/* section label */}
          <div className="flex items-center justify-between border-b border-white/10 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-paper/50">
            <span>E360 — Inventory Control System</span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 bg-accent" />
              SYS.01 / Live
            </span>
          </div>

          {/* asymmetric headline grid */}
          <div className="grid grid-cols-1 gap-y-10 py-14 lg:grid-cols-12 lg:gap-x-10 lg:py-20">
            <div className="lg:col-span-8">
              <Reveal>
                <h1
                  className="font-display font-semibold text-paper"
                  style={{ fontSize: 'clamp(2.75rem,8.5vw,7.75rem)', lineHeight: 0.92, letterSpacing: '-0.02em' }}
                >
                  Inventory,
                  <br />
                  measured to
                  <br />
                  <span className="text-accent">the unit.</span>
                </h1>
              </Reveal>
            </div>

            <div className="flex flex-col justify-end lg:col-span-4 lg:pb-3">
              <Reveal delay={120}>
                <p className="max-w-sm text-base leading-relaxed text-paper/60">
                  Real-time stock, a built-in POS, and role-based control in one system. Close the
                  month in minutes — with zero guesswork about what you hold.
                </p>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    to="/SignupPage"
                    className="border border-accent bg-accent px-8 py-4 text-center font-mono text-[12px] uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-transparent hover:text-accent"
                  >
                    Start free
                  </Link>
                  <a
                    href="#system"
                    className="group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.2em] text-paper/70 transition-colors hover:text-paper"
                  >
                    See the system
                    <span className="transition-transform duration-200 group-hover:translate-x-1">↘</span>
                  </a>
                </div>
              </Reveal>
            </div>
          </div>

          {/* stat row — mono, hairline separated */}
          <div className="grid grid-cols-2 border-t border-white/10 md:grid-cols-4">
            {[
              { render: <><CountUp to={99.98} decimals={2} suffix="%" /></>, label: 'System uptime' },
              { render: <CountUp to={12480} />, label: 'SKUs tracked' },
              { render: <CountUp to={87} />, label: 'Open orders' },
              { render: <CountUp to={5} prefix="0" />, label: 'Payment rails' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`border-white/10 py-8 ${i % 2 === 1 ? 'border-l' : ''} md:border-l md:first:border-l-0 md:pl-8`}
              >
                <div className="font-mono text-3xl font-medium tracking-tight text-paper md:text-4xl">
                  {stat.render}
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* dashboard — data-dense product surface, clipped edge + subtle perspective */}
        <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-16 lg:pb-28">
          <Reveal delay={80}>
            <div className="relative" style={{ perspective: '1600px' }}>
              <div
                className="border border-white/12 bg-[#0d0d0d]"
                style={{
                  transform: 'rotateX(2.5deg) rotateY(-7deg)',
                  transformOrigin: 'center left',
                  clipPath: 'polygon(0 0, 100% 0, 100% 92%, 97% 100%, 0 100%)',
                }}
              >
                {/* panel header */}
                <div className="flex items-center justify-between border-b border-white/12 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">
                  <span>E360 :// Dashboard</span>
                  <span className="flex items-center gap-2 text-paper/60">
                    <span className="inline-block h-1.5 w-1.5 bg-accent" /> Live
                  </span>
                </div>

                {/* KPI grid */}
                <div className="grid grid-cols-2 md:grid-cols-4">
                  {[
                    { label: 'Total Products', val: '1,248', delta: '+12%' },
                    { label: 'Monthly Sales', val: '$48.2K', delta: '+8%' },
                    { label: 'Low Stock', val: '14', delta: '-3' },
                    { label: 'Active Orders', val: '87', delta: '+21%' },
                  ].map((kpi, i) => (
                    <div
                      key={kpi.label}
                      className={`border-b border-white/12 p-5 ${i !== 0 ? 'border-l' : ''}`}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">
                        {kpi.label}
                      </p>
                      <p className="mt-2 font-mono text-2xl font-medium text-paper">{kpi.val}</p>
                      <p className="mt-1 font-mono text-[11px] text-accent">{kpi.delta} MTD</p>
                    </div>
                  ))}
                </div>

                {/* chart + table */}
                <div className="grid gap-0 md:grid-cols-2">
                  <div className="border-b border-white/12 p-5 md:border-b-0 md:border-r">
                    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">
                      Revenue / 12 mo
                    </p>
                    <div className="flex h-32 items-end gap-1.5">
                      {CHART_BARS.map((h, i) => (
                        <div
                          key={i}
                          className="flex-1"
                          style={{ height: `${h}%`, background: i === 9 ? '#2A5BFF' : 'rgba(250,250,248,0.18)' }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">
                      Top SKUs
                    </p>
                    <div className="space-y-3">
                      {[
                        { sku: 'VJ-6MG-30', pct: 75, price: '$12.99' },
                        { sku: 'POD-DISP-01', pct: 42, price: '$8.50' },
                        { sku: 'COIL-X5', pct: 90, price: '$24.00' },
                      ].map((row) => (
                        <div key={row.sku} className="flex items-center gap-4 font-mono text-[11px]">
                          <span className="w-24 shrink-0 text-paper/70">{row.sku}</span>
                          <span className="h-1.5 flex-1 bg-white/10">
                            <span className="block h-full bg-accent" style={{ width: `${row.pct}%` }} />
                          </span>
                          <span className="w-14 text-right text-paper/50">{row.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* coordinate garnish */}
              <span className="absolute -left-[6px] -top-[6px] font-mono text-xs text-paper/40">+</span>
              <span className="pointer-events-none absolute right-6 top-1/2 hidden font-mono text-[10px] uppercase tracking-[0.25em] text-paper/25 lg:block">
                FIG.01 — LIVE DATA SURFACE
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      <section className="border-y border-base-300 bg-base-200 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-6 md:grid-cols-4 md:divide-x md:divide-base-300 dark:md:divide-slate-800">
          {[
            { value: '500+', label: 'Active businesses' },
            { value: '99.9%', label: 'Platform uptime' },
            { value: '60%', label: 'Efficiency boost' },
            { value: '24/7', label: 'Expert support' },
          ].map((stat) => (
            <div key={stat.label} className="py-10 text-center">
              <p className="text-4xl font-black text-base-content">{stat.value}</p>
              <p className="mt-1 text-sm text-base-content/60">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="bg-base-200 py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-base-content/60">
              <FiZap className="text-cyan-500" />
              Powerful Features
            </div>
            <h2 className="text-4xl font-black text-base-content md:text-5xl">
              Everything you need,
              <br />
              nothing you don't
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base-content/60">
              Built for product-based businesses that demand speed, accuracy, and seamless team
              coordination.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className={`group rounded-2xl border border-base-300 bg-base-100 p-8 transition duration-300 hover:-translate-y-1 hover:shadow-xl ${feature.accent}`}
              >
                <div
                  className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.iconBg}`}
                >
                  <feature.icon className={`text-xl ${feature.iconColor}`} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-base-content">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-base-content/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how-it-works" className="bg-base-100 py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200 px-4 py-2 text-sm font-medium text-base-content/60">
              <FiCheck className="text-emerald-500" />
              Simple Workflow
            </div>
            <h2 className="text-4xl font-black text-base-content md:text-5xl">
              Up and running
              <br />
              in three steps
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base-content/60">
              No complicated setup. Start tracking inventory in minutes, not days.
            </p>
          </div>

          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-1/2 translate-x-full bg-gradient-to-r from-base-300 to-transparent md:block" />
                )}
                <div
                  className={`mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border ${step.border} ${step.iconBg}`}
                >
                  <step.icon className={`text-2xl ${step.iconColor}`} />
                </div>
                <p className={`mb-2 text-xs font-black uppercase tracking-[0.22em] ${step.numColor}`}>
                  {step.number}
                </p>
                <h3 className="mb-3 text-xl font-bold text-base-content">{step.title}</h3>
                <p className="text-sm leading-relaxed text-base-content/60">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Highlights strip ─── */}
      <section className="bg-base-200 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: FiShield,
                title: 'Secure by default',
                body: 'JWT auth in HTTP-only cookies, role-based route protection, and full audit trails.',
                color: 'text-cyan-500',
              },
              {
                icon: FiZap,
                title: 'Real-time updates',
                body: 'Socket.IO pushes stock changes, notifications, and activity logs instantly across all sessions.',
                color: 'text-indigo-500',
              },
              {
                icon: FiTrendingUp,
                title: 'Scales with you',
                body: 'From a single store to a multi-role enterprise — the platform grows as your business does.',
                color: 'text-violet-500',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-5 rounded-2xl border border-base-300 bg-base-100 p-6"
              >
                <div className="mt-0.5 shrink-0">
                  <item.icon className={`text-2xl ${item.color}`} />
                </div>
                <div>
                  <h4 className="mb-1 font-bold text-base-content">{item.title}</h4>
                  <p className="text-sm leading-relaxed text-base-content/60">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="bg-base-100 py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-black text-base-content">Frequently Asked Questions</h2>
            <p className="mt-4 text-base-content/60">
              Can't find the answer?{' '}
              <a href="mailto:support@inventorypro.com" className="text-cyan-500 hover:underline">
                Reach out to us
              </a>
              .
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-base-300 bg-base-100 transition"
              >
                <button
                  onClick={() => setOpenFAQ(openFAQ === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-5 text-left text-base font-semibold text-base-content transition hover:bg-base-200"
                >
                  {faq.question}
                  <span
                    className={`ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm transition-all duration-200 ${
                      openFAQ === i
                        ? 'rotate-45 border-cyan-500 bg-cyan-500/10 text-cyan-500'
                        : 'border-base-300 text-base-content/40'
                    }`}
                  >
                    <FiPlus />
                  </span>
                </button>
                {openFAQ === i && (
                  <div className="border-t border-base-300 px-6 py-5 text-sm leading-relaxed text-base-content/70">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="relative overflow-hidden bg-base-200 dark:bg-slate-950 py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-[90px]" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-indigo-500/10 blur-[90px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(148,163,184) 1px,transparent 1px),linear-gradient(90deg,rgb(148,163,184) 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-600 dark:text-cyan-400">
            <FiZap className="text-cyan-500 dark:text-cyan-400" />
            Start in minutes
          </div>
          <h2 className="mb-4 text-4xl font-black text-base-content md:text-5xl">
            Ready to take control
            <br />
            of your inventory?
          </h2>
          <p className="mb-10 text-lg text-base-content/60">
            Join hundreds of businesses already running smarter with E360.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/SignupPage"
              className="group inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-500"
            >
              Create Free Account
              <FiArrowRight className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/loginPage"
              className="inline-flex items-center gap-2 rounded-xl border border-base-300 px-10 py-4 text-base font-semibold text-base-content transition hover:border-base-content/40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Sign In
            </Link>
          </div>

          <p className="mt-8 text-sm text-base-content/50">
            No credit card required · Free to start · Cancel anytime
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default HomePage;
