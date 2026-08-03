import { createFileRoute, Link } from "@tanstack/react-router";
import { Banknote, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-context";
import { placeStorefrontOrder, validateStorefrontVoucher } from "@/lib/catalog-api";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Checkout — CliffsOfPuff" },
      { name: "description", content: "Place your CliffsOfPuff order." },
    ],
  }),
});

const freshClientRef = () =>
  globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Checkout() {
  const { lines, subtotal, clear, ready, unitPriceFor } = useCart();
  const { settings } = useCatalog();
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
  const merchandiseTotal = Math.max(0, subtotal - discount);
  const shipping =
    merchandiseTotal === 0 || merchandiseTotal >= freeThreshold ? 0 : flatRate;
  const total = merchandiseTotal + shipping;
  const missingReferences = lines.some((line) => !line.listingId || !line.productId);
  const cartSignature = lines
    .map((line) => `${line.listingId}:${line.productId}:${line.qty}`)
    .join("|");

  useEffect(() => {
    setAppliedVoucher(null);
  }, [cartSignature, form.email]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const orderItems = () =>
    lines.map((line) => ({
      listing: line.listingId,
      product: line.productId,
      quantity: line.qty,
    }));

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return setError("Enter a voucher code");
    if (missingReferences) return setError("Refresh the products in your basket first.");
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
        voucherError instanceof Error ? voucherError.message : "This voucher could not be applied.",
      );
    } finally {
      setVoucherBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || lines.length === 0) return;
    if (missingReferences) {
      setError("Your cart contains an older item. Remove it and add it again before checkout.");
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
          paymentMethod: "cash_on_delivery",
        },
      });
      setConfirmed({
        orderNo: result.order.orderNo,
        total: result.order.total,
      });
      clear();
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "The order could not be placed. Please try again.",
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
          <div className="eyebrow mt-6">Order received</div>
          <h1 className="mt-3 font-display text-4xl sm:text-6xl leading-none">Thank you.</h1>
          <p className="mt-6 text-ink-muted">
            Your order <strong className="text-ink">{confirmed.orderNo}</strong> has been received
            and its stock has been reserved for you.
          </p>
          <div className="mt-6 border hair bg-surface p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Order total
            </div>
            <div className="mt-1 font-display text-3xl">{formatPrice(confirmed.total)}</div>
            <p className="mt-3 text-sm text-ink-muted">
              Cash on delivery selected. Please pay {formatPrice(confirmed.total)} when your order
              arrives.
            </p>
          </div>
          <Link to="/shop" className="mt-8 inline-flex btn-primary">
            Continue shopping
          </Link>
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
          <div className="eyebrow">Checkout</div>
          <h1 className="mt-3 font-display text-5xl leading-none">Your cart is empty.</h1>
          <Link to="/shop" className="mt-8 inline-flex btn-primary">
            Browse products
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
        <div className="eyebrow">Checkout</div>
        <h1 className="mt-3 font-display text-4xl md:text-6xl leading-none">Delivery details.</h1>

        <form onSubmit={submit} className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_0.8fr] lg:gap-14">
          <div className="space-y-8">
            <section className="border hair p-5 md:p-7">
              <h2 className="font-display text-2xl">Contact</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={form.name}
                  onChange={(value) => set("name", value)}
                  required
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => set("email", value)}
                  required
                />
                <Field
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onChange={(value) => set("phone", value)}
                />
              </div>
            </section>

            <section className="border hair p-5 md:p-7">
              <h2 className="font-display text-2xl">Shipping address</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    label="Address line 1"
                    value={form.line1}
                    onChange={(value) => set("line1", value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Address line 2"
                    value={form.line2}
                    onChange={(value) => set("line2", value)}
                  />
                </div>
                <Field
                  label="Town / city"
                  value={form.city}
                  onChange={(value) => set("city", value)}
                  required
                />
                <Field
                  label="County"
                  value={form.region}
                  onChange={(value) => set("region", value)}
                />
                <Field
                  label="Eircode / postcode"
                  value={form.postcode}
                  onChange={(value) => set("postcode", value)}
                  required
                />
                <Field
                  label="Country"
                  value={form.country}
                  onChange={(value) => set("country", value)}
                  required
                />
              </div>
              <label className="mt-4 block">
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  Order note
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
              <h2 className="font-display text-2xl">Payment</h2>
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
                  <span className="block font-display text-lg">Cash on delivery</span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    Pay the full order total in cash when your delivery arrives.
                  </span>
                </span>
              </label>
            </section>
          </div>

          <aside className="self-start lg:sticky lg:top-32">
            <div className="border hair p-6">
              <div className="eyebrow">Order summary</div>
              <div className="mt-5 space-y-4">
                {lines.map((line) => (
                  <div key={line.id} className="flex gap-3">
                    <img
                      src={line.image}
                      alt=""
                      className="h-14 w-14 border hair bg-white object-contain p-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-sm leading-tight">{line.name}</div>
                      <div className="mt-1 font-mono text-[10px] text-ink-muted">
                        Qty {line.qty}
                      </div>
                    </div>
                    <div className="font-display text-sm">{formatPrice(unitPriceFor(line) * line.qty)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t hair pt-5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  Voucher code
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
                    {voucherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </button>
                </div>
                {appliedVoucher && (
                  <div className="mt-2 flex items-start gap-2 bg-accent/20 p-2 text-xs">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{appliedVoucher.message}</span>
                  </div>
                )}
              </div>

              <dl className="mt-6 space-y-3 border-t hair pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd className="font-display">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className="font-display">{shipping ? formatPrice(shipping) : "Free"}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[color:var(--sale)]">
                    <dt>Voucher ({appliedVoucher?.voucher.code})</dt>
                    <dd className="font-display">−{formatPrice(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t hair pt-3 text-lg">
                  <dt className="font-display">Total</dt>
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Placing order
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" /> Place COD order
                  </>
                )}
              </button>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                EUR only · secure cash on delivery
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
