import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountShell, Panel } from "@/components/account/AccountShell";
import {
  changeAccountPassword,
  deleteAccountAddress,
  saveAccountAddress,
  updateAccountProfile,
  type CustomerAddress,
} from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";
import { requireAccount } from "@/lib/require-account";

export const Route = createFileRoute("/account/details")({
  beforeLoad: requireAccount,
  component: Details,
  head: () => ({
    meta: [
      { title: "Your details — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const emptyAddress = {
  id: "",
  label: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postcode: "",
  country: "Ireland",
  isDefault: false,
};

function Details() {
  const { customer, refresh } = useAccount();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AccountShell
        eyebrow="Your account"
        title="Your details"
        lede="What we call you, where we send things, and how you sign in."
      >
        <div className="space-y-5 sm:space-y-6">
          <ProfileForm customer={customer!} onSaved={refresh} />
          <AddressBook addresses={customer!.addresses} onSaved={refresh} />
          <PasswordForm />
        </div>
      </AccountShell>
      <Footer />
    </div>
  );
}

/* ── Profile ────────────────────────────────────────────────────────────── */

function ProfileForm({
  customer,
  onSaved,
}: {
  customer: { name: string; email: string; phone: string; marketingOptIn: boolean };
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    marketingOptIn: customer.marketingOptIn,
  });
  const [state, setState] = useState<Feedback>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ kind: "busy" });
    try {
      await updateAccountProfile({ data: form });
      await onSaved();
      setState({ kind: "ok", message: "Saved" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save that.",
      });
    }
  };

  return (
    <Panel title="About you">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            value={form.name}
            onChange={(value) => setForm((c) => ({ ...c, name: value }))}
            autoComplete="name"
          />
          <Field
            label="Phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(value) => setForm((c) => ({ ...c, phone: value }))}
            autoComplete="tel"
          />
        </div>

        {/* Not editable here. It is the account's identity, it is where a
            password reset goes, and it is what links orders placed before
            signing up — changing it safely needs a confirmation loop through
            the new address, which is its own piece of work. */}
        <div>
          <span className="eyebrow">Email</span>
          <div className="mt-1.5 border hair bg-muted/60 px-3 py-3 text-sm text-ink-muted">
            {customer.email}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Get in touch if you need this changed — it's how we find your orders.
          </p>
        </div>

        <Checkbox
          checked={form.marketingOptIn}
          onChange={(value) => setForm((c) => ({ ...c, marketingOptIn: value }))}
        >
          Email me about new arrivals and offers.
        </Checkbox>

        <SubmitButton busy={state.kind === "busy"}>Save changes</SubmitButton>
      </form>
    </Panel>
  );
}

/* ── Addresses ──────────────────────────────────────────────────────────── */

function AddressBook({
  addresses,
  onSaved,
}: {
  addresses: CustomerAddress[];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<typeof emptyAddress | null>(null);
  const [state, setState] = useState<Feedback>({ kind: "idle" });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setState({ kind: "busy" });
    try {
      await saveAccountAddress({ data: editing });
      await onSaved();
      setEditing(null);
      setState({ kind: "ok", message: "Address saved" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save that.",
      });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Remove this address?")) return;
    setState({ kind: "busy" });
    try {
      await deleteAccountAddress({ data: id });
      await onSaved();
      setState({ kind: "ok", message: "Address removed" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not remove that.",
      });
    }
  };

  return (
    <Panel
      title="Delivery addresses"
      description="Your default is filled in for you at checkout."
      action={
        !editing && addresses.length < 10 ? (
          <button
            type="button"
            onClick={() => setEditing({ ...emptyAddress })}
            className="inline-flex shrink-0 items-center gap-1.5 border hair px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-ink hover:text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        ) : null
      }
    >
      <div className="space-y-4">
        <Notice state={state} />

        {editing ? (
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field
              label="Label (optional)"
              value={editing.label}
              onChange={(value) => setEditing({ ...editing, label: value })}
              placeholder="Home"
            />
            <Field
              label="Street address"
              value={editing.line1}
              onChange={(value) => setEditing({ ...editing, line1: value })}
              autoComplete="address-line1"
              required
            />
            <Field
              label="Apartment, floor (optional)"
              value={editing.line2}
              onChange={(value) => setEditing({ ...editing, line2: value })}
              autoComplete="address-line2"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Town or city"
                value={editing.city}
                onChange={(value) => setEditing({ ...editing, city: value })}
                autoComplete="address-level2"
                required
              />
              <Field
                label="County (optional)"
                value={editing.region}
                onChange={(value) => setEditing({ ...editing, region: value })}
                autoComplete="address-level1"
              />
              <Field
                label="Eircode / postcode"
                value={editing.postcode}
                onChange={(value) => setEditing({ ...editing, postcode: value })}
                autoComplete="postal-code"
                required
              />
              <Field
                label="Country"
                value={editing.country}
                onChange={(value) => setEditing({ ...editing, country: value })}
                autoComplete="country-name"
                required
              />
            </div>

            <Checkbox
              checked={editing.isDefault}
              onChange={(value) => setEditing({ ...editing, isDefault: value })}
            >
              Use this one at checkout
            </Checkbox>

            {/* Stacked on a phone and full width, so the primary action is a
                comfortable thumb target rather than half of a cramped row. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <SubmitButton busy={state.kind === "busy"}>
                {editing.id ? "Save address" : "Add address"}
              </SubmitButton>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setState({ kind: "idle" });
                }}
                className="btn-outline w-full sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : addresses.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => (
              <li key={address.id} className="border hair p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {address.isDefault && (
                      <span className="mb-1.5 inline-block bg-accent px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent-foreground">
                        Default
                      </span>
                    )}
                    {address.label && (
                      <div className="text-sm font-medium">{address.label}</div>
                    )}
                    <address className="text-sm not-italic leading-relaxed text-ink-muted">
                      {[
                        address.line1,
                        address.line2,
                        address.city,
                        address.region,
                        address.postcode,
                        address.country,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </address>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      aria-label={`Edit ${address.label || "address"}`}
                      onClick={() => setEditing({ ...address })}
                      className="border hair p-2 transition-colors hover:bg-ink hover:text-primary-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${address.label || "address"}`}
                      onClick={() => remove(address.id)}
                      className="border hair p-2 text-[color:var(--sale)] transition-colors hover:bg-[color:var(--sale)] hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">
            No saved addresses yet. Add one and checkout fills itself in.
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ── Password ───────────────────────────────────────────────────────────── */

function PasswordForm() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [state, setState] = useState<Feedback>({ kind: "idle" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.next.length < 8) {
      return setState({
        kind: "error",
        message: "Please choose a password of at least 8 characters.",
      });
    }
    if (form.next !== form.confirm) {
      return setState({ kind: "error", message: "Those two passwords don't match." });
    }
    setState({ kind: "busy" });
    try {
      await changeAccountPassword({
        data: { currentPassword: form.current, newPassword: form.next },
      });
      setForm({ current: "", next: "", confirm: "" });
      setState({ kind: "ok", message: "Password changed" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not change it.",
      });
    }
  };

  return (
    <Panel title="Password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Notice state={state} />
        <Field
          label="Current password"
          type="password"
          value={form.current}
          onChange={(value) => setForm((c) => ({ ...c, current: value }))}
          autoComplete="current-password"
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            type="password"
            value={form.next}
            onChange={(value) => setForm((c) => ({ ...c, next: value }))}
            autoComplete="new-password"
            hint="At least 8 characters."
            required
          />
          <Field
            label="Again, to be sure"
            type="password"
            value={form.confirm}
            onChange={(value) => setForm((c) => ({ ...c, confirm: value }))}
            autoComplete="new-password"
            required
          />
        </div>
        <SubmitButton busy={state.kind === "busy"}>Change password</SubmitButton>
      </form>
    </Panel>
  );
}

/* ── Shared bits ────────────────────────────────────────────────────────── */

type Feedback =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function Notice({ state }: { state: Feedback }) {
  if (state.kind === "ok") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 border border-accent bg-accent/15 px-4 py-2.5 text-sm"
      >
        <Check className="h-4 w-4 shrink-0" /> {state.message}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p
        role="alert"
        className="border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
      >
        {state.message}
      </p>
    );
  }
  return null;
}

function SubmitButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ink)]"
      />
      <span className="text-sm text-ink-muted">{children}</span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {/* py-3 keeps the tap target ~44px, and the 16px font size is what stops
          iOS Safari zooming the page in the moment the field is focused. */}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border hair bg-background px-3 py-3 text-base outline-none focus:border-ink sm:text-sm"
        {...rest}
      />
      {hint && <span className="mt-1.5 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
