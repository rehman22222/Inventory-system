import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../Components/Navbar';
import Footer from '../Components/Footer';
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
    question: 'What is InventoryPro?',
    answer:
      'InventoryPro is a full-featured inventory management system for product-based businesses. It combines real-time stock tracking, a built-in POS, analytics, supplier management, multi-role access, and activity logging in a single platform.',
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
    <div className="bg-base-100 text-base-content">
      <Navbar />

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-base-200 to-base-100 dark:from-slate-950 dark:to-slate-950 pb-24 pt-36">
        {/* Ambient glow orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/4 h-[520px] w-[520px] rounded-full bg-cyan-500/8 blur-[130px]" />
          <div className="absolute top-1/3 right-1/5 h-[400px] w-[400px] rounded-full bg-indigo-500/8 blur-[110px]" />
          <div className="absolute bottom-0 left-1/2 h-56 w-[700px] -translate-x-1/2 rounded-full bg-violet-500/6 blur-[90px]" />
        </div>

        {/* Subtle grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(148,163,184) 1px,transparent 1px),linear-gradient(90deg,rgb(148,163,184) 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-600 dark:text-cyan-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500 dark:bg-cyan-400" />
            Trusted by 500+ businesses worldwide
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-black leading-[1.06] tracking-tight text-slate-900 dark:text-white md:text-7xl">
            Inventory management
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              built for scale
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Real-time stock tracking, a built-in POS, multi-role access control, and powerful
            analytics — everything your team needs to move faster and sell smarter.
          </p>

          {/* CTAs */}
          <div className="mb-20 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/SignupPage"
              className="group inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-500"
            >
              Get Started Free
              <FiArrowRight className="transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-xl border border-base-300 px-8 py-4 text-base font-semibold text-base-content transition hover:border-base-content/40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Explore Features
            </a>
          </div>

          {/* Dashboard preview mockup */}
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-2xl shadow-black/70">
            <div className="overflow-hidden rounded-xl bg-slate-800">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-slate-700/50 px-5 py-3">
                <div className="h-3 w-3 rounded-full bg-red-500/70" />
                <div className="h-3 w-3 rounded-full bg-amber-500/70" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <div className="ml-4 h-5 w-40 rounded bg-slate-700" />
                <div className="ml-auto h-5 w-20 rounded bg-slate-700" />
              </div>

              <div className="p-5">
                {/* KPI cards */}
                <div className="mb-5 grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Products', val: '1,248', color: 'text-cyan-400', trend: '+12%' },
                    { label: 'Monthly Sales', val: '$48.2K', color: 'text-emerald-400', trend: '+8%' },
                    { label: 'Low Stock', val: '14', color: 'text-amber-400', trend: '−3 items' },
                    { label: 'Active Orders', val: '87', color: 'text-violet-400', trend: '+21%' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-slate-700/50 p-3 text-left">
                      <p className="text-xs text-slate-400">{stat.label}</p>
                      <p className={`mt-1 text-xl font-bold ${stat.color}`}>{stat.val}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{stat.trend} this month</p>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div className="mb-4 flex h-24 items-end gap-1.5 overflow-hidden rounded-lg bg-slate-700/30 px-4 pb-3 pt-4">
                  {CHART_BARS.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${h}%`,
                        background: `linear-gradient(to top, rgba(6,182,212,0.8), rgba(99,102,241,0.7))`,
                        opacity: 0.55 + i * 0.04,
                      }}
                    />
                  ))}
                </div>

                {/* Mini table */}
                <div className="space-y-2">
                  {[
                    { name: 'Vape Juice 6mg', pct: 75, price: '$12.99' },
                    { name: 'Disposable Pod', pct: 42, price: '$8.50' },
                    { name: 'Coil Pack ×5', pct: 90, price: '$24.00' },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded bg-slate-700/30 px-4 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 rounded bg-slate-600" />
                        <span className="text-xs text-slate-300">{row.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-600">
                          <div
                            className="h-full rounded-full bg-cyan-500"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs text-slate-400">{row.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
            Join hundreds of businesses already running smarter with InventoryPro.
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
