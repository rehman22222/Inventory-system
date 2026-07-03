import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../Components/Navbar';
import Footer from '../Components/Footer';
import Reveal from '../Components/Reveal';
import CountUp from '../Components/CountUp';

const CHART_BARS = [55, 70, 45, 88, 60, 78, 52, 92, 67, 95, 72, 85];
const FEATURE_TAGS = ['RT-STOCK', 'ACCESS', 'POS', 'ANALYTICS', 'SUPPLY', 'AUDIT'];
const SPEC_KEYS = ['AUTH', 'REALTIME', 'DATA', 'EXPORTS', 'SECURITY'];

function SectionLabel({ index, name, meta, dark }) {
  const base = dark ? 'text-paper/50 border-white/10' : 'text-ink/50 border-black/10';
  return (
    <div className={`flex items-center justify-between border-b py-4 font-mono text-[11px] uppercase tracking-[0.25em] ${base}`}>
      <span>
        {index} / {name}
      </span>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function HomePage() {
  const { t } = useTranslation();
  const [openFAQ, setOpenFAQ] = useState(0);

  const featureItems = t('features.items', { returnObjects: true }) || [];
  const steps = t('workflow.steps', { returnObjects: true }) || [];
  const specs = t('system.specs', { returnObjects: true }) || [];
  const faqs = t('faq.items', { returnObjects: true }) || [];

  return (
    <div className="bg-paper font-body text-ink">
      <Navbar />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-paper text-ink">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(#000000 1px,transparent 1px),linear-gradient(90deg,#000000 1px,transparent 1px)',
            backgroundSize: '88px 88px',
          }}
        />

        <div className="relative mx-auto max-w-7xl border-x border-black/10 px-6">
          <span aria-hidden className="pointer-events-none absolute -left-[6px] -top-[6px] font-mono text-xs text-ink/30">+</span>
          <span aria-hidden className="pointer-events-none absolute -right-[6px] -top-[6px] font-mono text-xs text-ink/30">+</span>
          <span aria-hidden className="pointer-events-none absolute -bottom-[6px] -left-[6px] font-mono text-xs text-ink/30">+</span>
          <span aria-hidden className="pointer-events-none absolute -bottom-[6px] -right-[6px] font-mono text-xs text-ink/30">+</span>

          <SectionLabel index="SYS.01" name={t('hero.label')} meta="LIVE" />

          <div className="grid grid-cols-1 gap-y-10 py-14 lg:grid-cols-12 lg:gap-x-10 lg:py-20">
            <div className="lg:col-span-8">
              <Reveal>
                <h1
                  className="font-display font-semibold text-ink"
                  style={{ fontSize: 'clamp(2.5rem,8vw,7.25rem)', lineHeight: 0.94, letterSpacing: '-0.02em' }}
                >
                  {t('hero.headline')} <span className="text-accent">{t('hero.accent')}</span>
                </h1>
              </Reveal>
            </div>

            <div className="flex flex-col justify-end lg:col-span-4 lg:pb-3">
              <Reveal delay={120}>
                <p className="max-w-sm text-base leading-relaxed text-ink/60">{t('hero.sub')}</p>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    to="/LoginPage"
                    className="border border-accent bg-accent px-8 py-4 text-center font-mono text-[12px] uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-transparent hover:text-accent"
                  >
                    {t('hero.cta')}
                  </Link>
                  <a
                    href="#features"
                    className="group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.2em] text-ink/70 transition-colors hover:text-ink"
                  >
                    {t('hero.secondary')}
                    <span className="transition-transform duration-200 group-hover:translate-x-1">↘</span>
                  </a>
                </div>
              </Reveal>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-black/10 md:grid-cols-4">
            {[
              { render: <CountUp to={99.98} decimals={2} suffix="%" />, label: t('hero.s_uptime') },
              { render: <CountUp to={12480} />, label: t('hero.s_skus') },
              { render: <CountUp to={87} />, label: t('hero.s_orders') },
              { render: <CountUp to={5} prefix="0" />, label: t('hero.s_rails') },
            ].map((stat, i) => (
              <div
                key={i}
                className={`border-black/10 py-8 ${i % 2 === 1 ? 'border-l' : ''} md:border-l md:first:border-l-0 md:pl-8`}
              >
                <div className="font-mono text-3xl font-medium tracking-tight text-ink md:text-4xl">{stat.render}</div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/40">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* dashboard — dark product surface */}
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
                <div className="flex items-center justify-between border-b border-white/12 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/40">
                  <span>E360 :// Dashboard</span>
                  <span className="flex items-center gap-2 text-paper/60">
                    <span className="inline-block h-1.5 w-1.5 bg-accent" /> Live
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4">
                  {[
                    { label: 'Total Products', val: '1,248', delta: '+12%' },
                    { label: 'Monthly Sales', val: '$48.2K', delta: '+8%' },
                    { label: 'Low Stock', val: '14', delta: '-3' },
                    { label: 'Active Orders', val: '87', delta: '+21%' },
                  ].map((kpi, i) => (
                    <div key={kpi.label} className={`border-b border-white/12 p-5 ${i !== 0 ? 'border-l' : ''}`}>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">{kpi.label}</p>
                      <p className="mt-2 font-mono text-2xl font-medium text-paper">{kpi.val}</p>
                      <p className="mt-1 font-mono text-[11px] text-accent">{kpi.delta} MTD</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-0 md:grid-cols-2">
                  <div className="border-b border-white/12 p-5 md:border-b-0 md:border-r">
                    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">Revenue / 12 mo</p>
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
                    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">Top SKUs</p>
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
              <span className="absolute -left-[6px] -top-[6px] font-mono text-xs text-paper/40">+</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── 02 / Features ───────────────────────────────────────── */}
      <section id="features" className="scroll-mt-28 bg-ink text-paper">
        <div className="mx-auto max-w-7xl border-x border-white/10 px-6">
          <SectionLabel index="02" name={t('features.label')} meta="06 MODULES" dark />

          <div className="grid grid-cols-1 gap-8 py-14 lg:grid-cols-12 lg:py-20">
            <div className="lg:col-span-7">
              <Reveal>
                <h2 className="font-display font-semibold text-paper" style={{ fontSize: 'clamp(2rem,5vw,4.25rem)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {t('features.title')}
                </h2>
              </Reveal>
            </div>
            <div className="flex items-end lg:col-span-5">
              <Reveal delay={100}>
                <p className="max-w-md text-base leading-relaxed text-paper/60">{t('features.intro')}</p>
              </Reveal>
            </div>
          </div>

          <div className="border-t border-white/10">
            {featureItems.map((f, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="group relative grid grid-cols-12 items-baseline gap-y-2 border-b border-white/10 py-8 transition-colors duration-200 hover:bg-white/[0.03]">
                  <span aria-hidden className="absolute left-0 top-0 h-full w-[2px] origin-top scale-y-0 bg-accent transition-transform duration-300 group-hover:scale-y-100" />
                  <div className="col-span-3 pl-4 md:col-span-2 md:pl-6">
                    <span className="font-mono text-sm text-paper/40 transition-colors group-hover:text-accent">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-paper/30">{FEATURE_TAGS[i]}</span>
                  </div>
                  <h3 className="col-span-9 font-display text-2xl text-paper md:col-span-4 md:text-[1.7rem]">{f.title}</h3>
                  <p className="col-span-12 text-sm leading-relaxed text-paper/55 md:col-span-5 md:px-6">{f.desc}</p>
                  <div className="hidden text-paper/30 transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent md:col-span-1 md:flex md:justify-end md:pr-6">↘</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 03 / Workflow ───────────────────────────────────────── */}
      <section id="workflow" className="scroll-mt-28 bg-paper text-ink">
        <div className="mx-auto max-w-7xl border-x border-black/10 px-6">
          <SectionLabel index="03" name={t('workflow.label')} meta="03 STEPS" />

          <div className="grid grid-cols-1 gap-8 py-14 lg:grid-cols-12 lg:py-20">
            <div className="lg:col-span-7">
              <Reveal>
                <h2 className="font-display font-semibold text-ink" style={{ fontSize: 'clamp(2rem,5vw,4.25rem)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {t('workflow.title')}
                </h2>
              </Reveal>
            </div>
            <div className="flex items-end lg:col-span-5">
              <Reveal delay={100}>
                <p className="max-w-md text-base leading-relaxed text-ink/60">{t('workflow.intro')}</p>
              </Reveal>
            </div>
          </div>

          <div className="grid grid-cols-1 border-t border-black/10 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 80}>
                <div className={`h-full border-black/10 py-10 md:pe-8 ${i !== 0 ? 'border-t md:border-t-0 md:border-s md:ps-8' : ''}`}>
                  <span className="font-mono text-5xl font-medium tracking-tight text-ink/15 md:text-6xl">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-6 font-display text-2xl text-ink">{s.title}</h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink/60">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="h-14" />
        </div>
      </section>

      {/* ─── 04 / System ─────────────────────────────────────────── */}
      <section id="system" className="scroll-mt-28 bg-ink text-paper">
        <div className="mx-auto max-w-7xl border-x border-white/10 px-6">
          <SectionLabel index="04" name={t('system.label')} meta="UNDER THE HOOD" dark />

          <div className="grid grid-cols-1 gap-y-12 py-14 lg:grid-cols-12 lg:gap-x-16 lg:py-20">
            <div className="lg:col-span-5">
              <Reveal>
                <h2 className="font-display font-semibold text-paper" style={{ fontSize: 'clamp(2rem,4.5vw,3.75rem)', lineHeight: 1.02, letterSpacing: '-0.02em' }}>
                  {t('system.title')} <span className="text-accent">{t('system.accent')}</span>
                </h2>
                <p className="mt-6 max-w-sm text-base leading-relaxed text-paper/60">{t('system.intro')}</p>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <div className="border-t border-white/10">
                {specs.map((v, i) => (
                  <Reveal key={i} delay={i * 60}>
                    <div className="group grid grid-cols-12 items-baseline gap-y-1 border-b border-white/10 py-6 transition-colors duration-200 hover:bg-white/[0.03]">
                      <span className="col-span-12 font-mono text-[11px] uppercase tracking-[0.25em] text-accent md:col-span-3">{SPEC_KEYS[i]}</span>
                      <span className="col-span-12 text-base leading-relaxed text-paper/80 md:col-span-9">{v}</span>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 05 / FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-28 bg-paper text-ink">
        <div className="mx-auto max-w-7xl border-x border-black/10 px-6">
          <SectionLabel index="05" name={t('faq.label')} meta="COLOPHON" />

          <div className="grid grid-cols-1 gap-y-10 py-14 lg:grid-cols-12 lg:gap-x-16 lg:py-20">
            <div className="lg:col-span-4">
              <Reveal>
                <h2 className="font-display font-semibold text-ink" style={{ fontSize: 'clamp(2rem,4vw,3.25rem)', lineHeight: 1.02, letterSpacing: '-0.02em' }}>
                  {t('faq.title')}
                </h2>
                <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink/60">
                  {t('faq.helpPre')}{' '}
                  <a href={`mailto:${t('faq.helpLink')}`} className="text-accent underline underline-offset-4">
                    {t('faq.helpLink')}
                  </a>
                </p>
              </Reveal>
            </div>

            <div className="lg:col-span-8">
              <div className="border-t border-black/10">
                {faqs.map((faq, i) => {
                  const isOpen = openFAQ === i;
                  return (
                    <div key={i} className="border-b border-black/10">
                      <button onClick={() => setOpenFAQ(isOpen ? -1 : i)} className="flex w-full items-center gap-6 py-6 text-left">
                        <span className="font-mono text-xs text-ink/40">F.0{i + 1}</span>
                        <span className="flex-1 font-display text-lg text-ink md:text-xl">{faq.q}</span>
                        <span className={`font-mono text-xl leading-none transition-colors ${isOpen ? 'text-accent' : 'text-ink/40'}`}>
                          {isOpen ? '–' : '+'}
                        </span>
                      </button>
                      <div className="grid overflow-hidden transition-all duration-300" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                        <div className="min-h-0">
                          <p className="max-w-2xl pb-6 ps-12 text-sm leading-relaxed text-ink/60">{faq.a}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────── */}
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-7xl border-x border-white/10 px-6">
          <div className="grid grid-cols-1 items-end gap-10 py-20 lg:grid-cols-12 lg:py-28">
            <div className="lg:col-span-8">
              <Reveal>
                <h2 className="font-display font-semibold text-paper" style={{ fontSize: 'clamp(2.5rem,7vw,6rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
                  {t('cta.title')} <span className="text-accent">{t('cta.accent')}</span>
                </h2>
              </Reveal>
            </div>
            <div className="flex flex-col gap-6 lg:col-span-4 lg:items-end lg:pb-3">
              <Reveal delay={120}>
                <p className="max-w-sm text-base leading-relaxed text-paper/60 lg:text-end">{t('cta.sub')}</p>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row lg:justify-end">
                  <Link
                    to="/LoginPage"
                    className="border border-accent bg-accent px-8 py-4 text-center font-mono text-[12px] uppercase tracking-[0.2em] text-white transition-colors duration-200 hover:bg-transparent hover:text-accent"
                  >
                    {t('cta.primary')}
                  </Link>
                  <Link
                    to="/LoginPage"
                    className="border border-white/20 px-8 py-4 text-center font-mono text-[12px] uppercase tracking-[0.2em] text-paper/80 transition-colors duration-200 hover:border-paper hover:text-paper"
                  >
                    {t('cta.signin')}
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default HomePage;
