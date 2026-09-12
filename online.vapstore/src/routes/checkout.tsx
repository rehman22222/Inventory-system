import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Award, Banknote, CheckCircle2, Lock, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-context";
import { placeStorefrontOrder, validateStorefrontVoucher } from "@/lib/catalog-api";
import { formatPrice } from "@/lib/format";
import { cldProductThumbImage } from "@/lib/img";
import { getLoyaltyQuote, type LoyaltyQuote } from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Checkout — Cliffs of Puff" },
      { name: "description", content: "Place your Cliffs of Puff order." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const freshClientRef = () =>
  globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Checkout() {
  const { t, i18n } = useTranslation();
  const { lines, subtotal, clear, ready, unitPriceFor } = useCart();
  const { settings } = useCatalog();
  const { customer } = useAccount();
  // What this basket earns, and how much of a balance may go against it. Priced
  // by the server as the basket changes; every figure is worked out again for
  // real when the order is placed, so nothing here can change what is charged.
  const [quote, setQuote] = useState<LoyaltyQuote | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const { flatRate, freeThreshold } = settings.shipping;
  const clientRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    voucher: { code: string; name: string };
    discount: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<{
    orderNo: string;
    total: number;
    earned: number;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postcode: "",
    country: "Ireland",
    note: "",
  });

  const discount = appliedVoucher?.discount || 0;
  /* Set offers, as the server counted them.
   *
   * Taken from the quote rather than worked out here on purpose. "Any 5 for
   * 15" is decided by one piece of code on the server — the same code the till
   * runs — and a second opinion in the browser would only ever be a chance to
   * disagree with it on the payment screen. */
  const dealDiscount = quote?.dealDiscount ?? 0;
  const dealsGiven = quote?.deals ?? [];
  const merchandiseTotal = Math.max(0, subtotal - discount - dealDiscount);
  // Free shipping is judged BEFORE points are spent, matching the server.
  // Spending a reward must never cost somebody their free delivery.
  const shipping =
    merchandiseTotal === 0 || merchandiseTotal >= freeThreshold ? 0 : flatRate;
  const pointsValue = quote?.redeem?.value ?? 0;
  const total = Math.max(0, merchandiseTotal + shipping - pointsValue);
  const missingReferences = lines.some((line) => !line.listingId || !line.productId);
  const cartSignature = lines
    .map((line) => `${line.listingId}:${line.productId}:${line.qty}:${line.eventId || ""}`)
    .join("|");

  useEffect(() => {
    setAppliedVoucher(null);
  }, [cartSignature, form.email]);

  /* Fill the form in for somebody we already know.
   *
   * Only into fields they have not touched: a shopper who has started typing a
   * different delivery address must not have it overwritten when their session
   * resolves. That is why every branch below checks the current value first. */
  useEffect(() => {
    if (!customer) return;
    const address =
      customer.addresses.find((entry) => entry.isDefault) || customer.addresses[0];
    setForm((current) => ({
      ...current,
      name: current.name || customer.name,
      email: current.email || customer.email,
      phone: current.phone || customer.phone,
      ...(address && !current.line1
        ? {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            region: address.region,
            postcode: address.postcode,
            country: address.country || current.country,
          }
        : {}),
    }));
  }, [customer]);

  /* Re-price the points whenever the basket, the voucher or the amount they
   * want to spend changes. Debounced, because dragging the slider would
   * otherwise fire a request per pixel. */
  useEffect(() => {
    if (!ready || lines.length === 0 || missingReferences) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getLoyaltyQuote({
        data: {
          items: orderItems(),
          voucherCode: appliedVoucher?.voucher.code || "",
          redeemPoints,
        },
      })
        .then((result) => {
          if (!cancelled) setQuote(result);
        })
        // A quote is a nicety. If it fails, checkout carries on without it
        // rather than blocking a sale over a points preview.
        .catch(() => {
          if (!cancelled) setQuote(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, ready, missingReferences, appliedVoucher, redeemPoints]);

  // Never leave a slider sitting above what the basket can now absorb — a
  // removed item can drop the ceiling under a choice already made.
  const redeemMax = quote?.redeem?.max ?? 0;
  useEffect(() => {
    if (redeemPoints > redeemMax) setRedeemPoints(redeemMax);
  }, [redeemMax, redeemPoints]);

  useEffect(() => {
    setForm((current) => {
      if (!["Ireland", "Éire"].includes(current.country)) return current;
      return { ...current, country: t("checkout.defaultCountry") };
    });
  }, [i18n.language, t]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const orderItems = () =>
    lines.map((line) => ({
      listing: line.listingId,
      product: line.productId,
      quantity: line.qty,
      eventId: line.eventId || "",
    }));

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return setError(t("checkout.errors.enterVoucher"));
    if (missingReferences) return setError(t("checkout.errors.refreshBasket"));
    setVoucherBusy(true);
    setError("");
    try {
      const result = await validateStorefrontVoucher({
        data: {
          code: voucherCode.trim(),
          email: form.email,
          items: orderItems(),
        },
      });
      setAppliedVoucher(result);
      setVoucherCode(result.voucher.code);
    } catch (voucherError) {
      setAppliedVoucher(null);
      setError(
        voucherError instanceof Error ? voucherError.message : t("checkout.errors.voucherFailed"),
      );
    } finally {
      setVoucherBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || lines.length === 0) return;
    if (missingReferences) {
      setError(t("checkout.errors.oldCartItem"));
      return;
    }

    setBusy(true);
    setError("");
    if (!clientRef.current) clientRef.current = freshClientRef();

    try {
      const result = await placeStorefrontOrder({
        data: {
          clientRef: clientRef.current,
          items: orderItems(),
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone,
          },
          shippingAddress: {
            line1: form.line1,
            line2: form.line2,
            city: form.city,
            region: form.region,
            postcode: form.postcode,
            country: form.country,
          },
          note: form.note,
          voucherCode: appliedVoucher?.voucher.code || "",
          // Ignored entirely for a guest, and clamped on the server to what
          // this account actually holds.
          redeemPoints: customer ? redeemPoints : 0,
          paymentMethod: "cash_on_delivery",
        },
      });
      setConfirmed({
        orderNo: result.order.orderNo,
        total: result.order.total,
        earned: result.order.loyalty?.earned || 0,
      });
      clear();
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : t("checkout.errors.orderFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container-x py-16 md:py-24 max-w-2xl">
          <CheckCircle2 className="h-12 w-12" />
          <div className="eyebrow mt-6">{t("checkout.confirmedEyebrow")}</div>
          <h1 className="mt-3 font-display text-4xl sm:text-6xl leading-none">
            {t("checkout.thankYou")}
          </h1>
          <p className="mt-6 text-ink-muted">
            {t("checkout.confirmedCopyBefore")}{" "}
            <strong className="text-ink">{confirmed.orderNo}</strong>{" "}
            {t("checkout.confirmedCopyAfter")}
          </p>
          <div className="mt-6 border hair bg-surface p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              {t("checkout.orderTotal")}
            </div>
            <div className="mt-1 font-display text-3xl">{formatPrice(confirmed.total)}</div>
            <p className="mt-3 text-sm text-ink-muted">
              {t("checkout.pickAndPaySelected", { total: formatPrice(confirmed.total) })}
            </p>
          </div>

          {confirmed.earned > 0 && (
            <div className="mt-4 flex items-start gap-3 border border-accent bg-accent/15 p-5">
              <Award className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium">
                  {confirmed.earned.toLocaleString()}{" "}
                  {settings.loyalty?.pointsName || "points"} on the way
                </div>
                <p className="mt-0.5 text-ink-muted">
                  They land in your balance once this order is delivered.
                </p>
              </div>
            </div>
          )}

          {/* The shop's terms, shown at the one moment the shopper has just
              committed to an order and is most likely to read them. Plain
              text, one rule per line, set in admin → Settings. */}
          {settings.checkout?.orderTerms?.trim() && (
            <div className="mt-6 border hair p-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                Please note
              </div>
              <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-ink-muted">
                {settings.checkout.orderTerms
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {customer && (
              <Link
                to="/account/orders/$orderNo"
                params={{ orderNo: confirmed.orderNo }}
                className="inline-flex btn-primary"
              >
                Track this order
              </Link>
            )}
            <Link
              to="/shop"
              className={customer ? "inline-flex items-center border hair px-6 py-3 text-sm transition-colors hover:border-ink" : "inline-flex btn-primary"}
            >
              {t("checkout.continueShopping")}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (ready && lines.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container-x py-16 md:py-24 max-w-2xl">
          <div className="eyebrow">{t("checkout.title")}</div>
          <h1 className="mt-3 font-display text-5xl leading-none">
            {t("checkout.emptyTitle")}
          </h1>
          <Link to="/shop" className="mt-8 inline-flex btn-primary">
            {t("checkout.browseProducts")}
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container-x py-10 md:py-16">
        <div className="eyebrow">{t("checkout.title")}</div>
        <h1 className="mt-3 font-display text-4xl md:text-6xl leading-none">
          {t("checkout.deliveryDetails")}
        </h1>

        {/* Offered, never demanded. A checkout that stops to ask a shopper to
            make an account is a checkout that loses some of them — so this is
            one quiet line, and the form below it works either way. */}
        {!customer && settings.accounts?.enabled !== false && (
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border hair bg-surface px-4 py-3 text-sm">
            <span className="text-ink-muted">Already have an account?</span>
            <Link to="/account/login" className="font-medium underline">
              Sign in
            </Link>
            <span className="text-ink-muted">
              — your details fill themselves in
              {settings.loyalty?.enabled ? " and your points come with you" : ""}.
            </span>
          </p>
        )}

        <form onSubmit={submit} className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_0.8fr] lg:gap-14">
          <div className="space-y-8">
            <section className="border hair p-5 md:p-7">
              <h2 className="font-display text-2xl">{t("checkout.contact")}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("checkout.fullName")}
                  value={form.name}
                  onChange={(value) => set("name", value)}
                  required
                />
                <Field
                  label={t("checkout.email")}
                  type="email"
                  value={form.email}
                  onChange={(value) => set("email", value)}
                  required
                />
                <Field
                  label={t("checkout.phone")}
                  type="tel"
                  value={form.phone}
                  onChange={(value) => set("phone", value)}
                />
              </div>
            </section>

            <section className="border hair p-5 md:p-7">
              <h2 className="font-display text-2xl">{t("checkout.shippingAddress")}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    label={t("checkout.addressLine1")}
                    value={form.line1}
                    onChange={(value) => set("line1", value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label={t("checkout.addressLine2")}
                    value={form.line2}
                    onChange={(value) => set("line2", value)}
                  />
                </div>
                <Field
                  label={t("checkout.townCity")}
                  value={form.city}
                  onChange={(value) => set("city", value)}
                  required
                />
                <Field
                  label={t("checkout.county")}
                  value={form.region}
                  onChange={(value) => set("region", value)}
                />
                <Field
                  label={t("checkout.postcode")}
                  value={form.postcode}
                  onChange={(value) => set("postcode", value)}
                  required
                />
                <Field
                  label={t("checkout.country")}
                  value={form.country}
                  onChange={(value) => set("country", value)}
                  required
                />
              </div>
              <label className="mt-4 block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  {t("checkout.orderNote")}
                </span>
                <textarea
                  value={form.note}
                  onChange={(event) => set("note", event.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-2 w-full border hair bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink"
                />
              </label>
            </section>

            <section className="border hair p-5 md:p-7">
              <h2 className="font-display text-2xl">{t("checkout.payment")}</h2>
              <label className="mt-5 flex cursor-pointer items-start gap-4 border-2 border-ink bg-surface p-4">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash_on_delivery"
                  checked
                  readOnly
                  className="mt-1 h-4 w-4 accent-current"
                />
                <Banknote className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block font-display text-lg">{t("checkout.pickAndPay")}</span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    {t("checkout.pickAndPayCopy")}
                  </span>
                  {/* What the shop promises about delivery. The radius line is
                      the shop's own words (admin → Settings); the threshold
                      line is built from shipping.freeThreshold so the promise
                      and the arithmetic can never drift apart. */}
                  {settings.checkout?.deliveryNote && (
                    <span className="mt-1 block text-sm text-ink-muted">
                      {settings.checkout.deliveryNote}
                    </span>
                  )}
                  {settings.shipping?.freeThreshold > 0 && (
                    <span className="mt-1 block text-sm text-ink-muted">
                      Free delivery on orders over {formatPrice(settings.shipping.freeThreshold)}.
                    </span>
                  )}
                </span>
              </label>
            </section>
          </div>

          <aside className="self-start lg:sticky lg:top-32">
            <div className="border hair p-6">
              <div className="eyebrow">{t("checkout.orderSummary")}</div>
              <div className="mt-5 space-y-4">
                {lines.map((line) => (
                  <div key={line.id} className="flex gap-3">
                    <img
                      src={cldProductThumbImage(line.image)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-14 border hair bg-white object-contain p-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-sm leading-tight">{line.name}</div>
                      <div className="mt-1 font-mono text-[10px] text-ink-muted">
                        {t("checkout.qty", { count: line.qty })}
                      </div>
                    </div>
                    <div className="font-display text-sm">{formatPrice(unitPriceFor(line) * line.qty)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t hair pt-5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  {t("checkout.voucherCode")}
                </label>
                <div className="mt-2 flex border hair focus-within:ring-2 focus-within:ring-ink">
                  <input
                    value={voucherCode}
                    onChange={(event) => {
                      setVoucherCode(event.target.value.toUpperCase());
                      setAppliedVoucher(null);
                    }}
                    maxLength={40}
                    placeholder="WELCOME10"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm uppercase outline-none"
                  />
                  <button
                    type="button"
                    disabled={voucherBusy || !ready}
                    onClick={applyVoucher}
                    className="border-l hair bg-ink px-4 font-mono text-[10px] uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                  >
                    {voucherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("checkout.apply")}
                  </button>
                </div>
                {appliedVoucher && (
                  <div className="mt-2 flex items-start gap-2 bg-accent/20 p-2 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{appliedVoucher.message}</span>
                  </div>
                )}
              </div>

              {/* ── Rewards ──────────────────────────────────────────────
                  Signed in: spend what you have. Signed out: see what you'd be
                  collecting, which is the only moment that argument lands. */}
              {quote?.enabled && (
                <div className="mt-6 border-t hair pt-5">
                  {quote.signedIn && quote.redeem && quote.redeem.balance > 0 ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                          Your {quote.pointsName}
                        </span>
                        <span className="font-mono text-xs">
                          {quote.redeem.balance.toLocaleString()} available
                        </span>
                      </div>

                      {quote.redeem.max >= quote.redeem.minPoints ? (
                        <>
                          <div className="mt-3 flex items-baseline justify-between">
                            <span className="font-display text-lg">
                              {redeemPoints.toLocaleString()}
                            </span>
                            <span className="text-sm text-ink-muted">
                              {pointsValue > 0 ? `−${formatPrice(pointsValue)}` : "nothing yet"}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={quote.redeem.max}
                            /* Steps of the redemption rate, so every stop is a
                               whole unit of currency off. A slider that lands on
                               €1.37 is one nobody can aim. */
                            step={Math.max(1, Math.round(quote.redeem.rate))}
                            value={redeemPoints}
                            onChange={(event) =>
                              setRedeemPoints(Number(event.target.value))
                            }
                            aria-label={`How many ${quote.pointsName} to spend`}
                            className="mt-2 w-full accent-[color:var(--ink)]"
                          />
                          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-muted">
                            <button
                              type="button"
                              onClick={() => setRedeemPoints(0)}
                              className="underline-offset-2 hover:underline"
                            >
                              none
                            </button>
                            <button
                              type="button"
                              onClick={() => setRedeemPoints(quote.redeem!.max)}
                              className="underline-offset-2 hover:underline"
                            >
                              use {quote.redeem.max.toLocaleString()}
                            </button>
                          </div>
                          {quote.redeem.reason && (
                            <p className="mt-2 text-xs text-ink-muted">
                              {quote.redeem.reason}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-ink-muted">
                          {quote.redeem.balance < quote.redeem.minPoints
                            ? `You can start spending your ${quote.pointsName} at ${quote.redeem.minPoints.toLocaleString()}.`
                            : `This order is too small to put ${quote.pointsName} against.`}
                        </p>
                      )}
                    </>
                  ) : null}

                  {(quote.earn ?? 0) > 0 && (
                    <div className="mt-4 flex items-start gap-2 bg-accent/20 p-3 text-xs">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {quote.signedIn ? (
                        <span>
                          This order earns{" "}
                          <strong>{quote.earn!.toLocaleString()}</strong>{" "}
                          {quote.pointsName}
                          {quote.tier && quote.tier.multiplier > 1
                            ? ` at your ${quote.tier.name} rate`
                            : ""}
                          , once it's delivered.
                        </span>
                      ) : (
                        <span>
                          You'd collect{" "}
                          <strong>{quote.earn!.toLocaleString()}</strong>{" "}
                          {quote.pointsName} on this order.{" "}
                          <Link
                            to="/account/register"
                            className="font-medium underline"
                          >
                            Create an account
                          </Link>{" "}
                          to start keeping them.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <dl className="mt-6 space-y-3 border-t hair pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("checkout.subtotal")}</dt>
                  <dd className="font-display">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("checkout.shipping")}</dt>
                  <dd className="font-display">
                    {shipping ? formatPrice(shipping) : t("checkout.free")}
                  </dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[color:var(--sale)]">
                    <dt>{t("checkout.voucher")} ({appliedVoucher?.voucher.code})</dt>
                    <dd className="font-display">−{formatPrice(discount)}</dd>
                  </div>
                )}
                {/* Each offer on its own line, named, so the shopper can see
                    WHICH of their picks earned the discount rather than a
                    lump sum appearing above the total. */}
                {dealsGiven.map((deal, index) => (
                  <div
                    key={`${deal.name}-${index}`}
                    className="flex justify-between text-[color:var(--sale)]"
                  >
                    <dt>
                      {deal.name}
                      {deal.sets > 1 ? ` ×${deal.sets}` : ""}
                    </dt>
                    <dd className="font-display">−{formatPrice(deal.amount)}</dd>
                  </div>
                ))}
                {pointsValue > 0 && (
                  <div className="flex justify-between text-[color:var(--sale)]">
                    <dt>
                      {(quote?.redeem?.points ?? 0).toLocaleString()}{" "}
                      {quote?.pointsName || "points"}
                    </dt>
                    <dd className="font-display">−{formatPrice(pointsValue)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t hair pt-3 text-lg">
                  <dt className="font-display">{t("checkout.total")}</dt>
                  <dd className="font-display">{formatPrice(total)}</dd>
                </div>
              </dl>

              {error && (
                <div
                  role="alert"
                  className="mt-5 border border-[color:var(--sale)] p-3 text-sm text-[color:var(--sale)]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !ready}
                className="mt-5 btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("checkout.placingOrder")}
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" /> {t("checkout.placeOrder")}
                  </>
                )}
              </button>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                {t("checkout.securePickAndPay")}
              </p>
            </div>
          </aside>
        </form>
      </main>
      <Footer />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full border hair bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}
