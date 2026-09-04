import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import {
  FiAward,
  FiEdit2,
  FiInfo,
  FiPlus,
  FiSave,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import {
  deleteLoyaltyRule,
  getLoyaltyRules,
  saveLoyaltyRule,
  saveOnlineSettings,
} from "../../features/onlineStoreSlice";

/* The rewards programme.
 *
 * Two halves, and the split is the point:
 *
 *   THE BASE RATE, at the top, applies to everything and is the shop's answer
 *   to "how generous are we?" — one number, and a worked example beside it so
 *   nobody has to do the percentage in their head.
 *
 *   THE RULES, below, are the exceptions. Double points on e-liquids. A flat
 *   200 on this kit. A bonus on best sellers. Spend €50, get 100. This is the
 *   part the shop asked to be able to write for itself, so it is a proper
 *   editor rather than a JSON field with a warning next to it.
 */

const SCOPES = [
  {
    id: "all",
    label: "Everything",
    hint: "Every item in the basket. Use it to lift the base rate for a while.",
  },
  {
    id: "category",
    label: "A category",
    hint: "Every product in the categories you pick — the section-wide offer.",
  },
  {
    id: "product",
    label: "Chosen products",
    hint: "Only the products you pick.",
  },
  {
    id: "best_sellers",
    label: "Best sellers",
    hint: 'Anything tagged "bestseller" — the same list as the storefront row.',
  },
  { id: "brand", label: "A brand", hint: "Every product from one brand." },
  {
    id: "order",
    label: "The whole order",
    hint: "A bonus on top, once the order reaches a value. Stacks with the rest.",
  },
];

const EARN_MODES = [
  {
    id: "per_currency",
    label: "Points per €1",
    suffix: "points per €1 spent",
  },
  { id: "per_unit", label: "Points per item", suffix: "points per item taken" },
  {
    id: "multiplier",
    label: "Multiply the base rate",
    suffix: "× the base rate",
  },
  { id: "fixed", label: "A flat amount", suffix: "points" },
];

const blankRule = {
  id: "",
  name: "",
  description: "",
  active: true,
  scope: "category",
  categories: [],
  listings: [],
  brand: "",
  earnMode: "multiplier",
  value: 2,
  minSpend: 0,
  maxPointsPerOrder: 0,
  priority: 0,
  startsAt: "",
  endsAt: "",
};

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const whole = (value) => Number(value || 0).toLocaleString();

// A saved rule as the editor's form state. Written once and used by both the
// table row and the card, so the two can never open the editor differently.
const formFromRule = (rule) => ({
  id: rule._id,
  name: rule.name,
  description: rule.description || "",
  active: rule.active !== false,
  scope: rule.scope,
  categories: (rule.categories || []).map(String),
  listings: (rule.listings || []).map(String),
  brand: rule.brand || "",
  earnMode: rule.earnMode,
  value: rule.value,
  minSpend: rule.minSpend || 0,
  maxPointsPerOrder: rule.maxPointsPerOrder || 0,
  priority: rule.priority || 0,
  startsAt: toLocalDateTime(rule.startsAt),
  endsAt: toLocalDateTime(rule.endsAt),
});

// What a rule targets and what it gives, in words. Shared by the row and the
// card for the same reason as above.
const describeTargets = (rule, categories, listings) => {
  if (rule.scope === "category") {
    const names = (rule.categories || [])
      .map((id) => categories.find((c) => c._id === String(id))?.name)
      .filter(Boolean);
    return names.join(", ") || `${(rule.categories || []).length} categories`;
  }
  if (rule.scope === "product") {
    const names = (rule.listings || [])
      .map((id) => {
        const listing = listings.find((l) => l._id === String(id));
        return listing?.webName || listing?.product?.name;
      })
      .filter(Boolean);
    return names.join(", ") || `${(rule.listings || []).length} products`;
  }
  if (rule.scope === "brand") return rule.brand;
  return SCOPES.find((s) => s.id === rule.scope)?.label || rule.scope;
};

const describeEarning = (rule) => {
  const mode = EARN_MODES.find((m) => m.id === rule.earnMode);
  return `${rule.value} ${mode?.suffix || ""}`;
};

const ruleWindow = (rule) =>
  [
    rule.startsAt ? `from ${new Date(rule.startsAt).toLocaleDateString()}` : "",
    rule.endsAt ? `to ${new Date(rule.endsAt).toLocaleDateString()}` : "",
  ]
    .filter(Boolean)
    .join(" ");

function NoRules() {
  return (
    <div className="py-6 text-center">
      <div className="text-base-content/50">
        No rules yet — every product earns the base rate.
      </div>
      <div className="mt-1 text-xs text-base-content/40">
        Add one to reward a category, a brand, your best sellers or a single
        product differently.
      </div>
    </div>
  );
}

function RuleStatus({ rule }) {
  const expired = rule.endsAt && new Date(rule.endsAt) < new Date();
  if (rule.active === false) return <span className="badge badge-sm">Off</span>;
  if (expired) return <span className="badge badge-sm badge-ghost">Ended</span>;
  return <span className="badge badge-sm badge-success badge-outline">Live</span>;
}

export default function LoyaltyTab({ settings, rules, listings, categories, isActing }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    dispatch(getLoyaltyRules());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <ProgrammeSettings settings={settings} isActing={isActing} />

      <section className="rounded-xl border bg-base-100">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-display text-lg font-bold">Reward rules</h3>
            <p className="text-sm text-base-content/60">
              The exceptions to the base rate. A basket line takes the
              highest-priority rule that matches it — they don't stack, so a
              shopper is never quietly given six times what you meant. Whole-order
              bonuses are added on top.
            </p>
          </div>
          <button
            className="btn btn-sm btn-primary gap-2"
            onClick={() => setEditing({ ...blankRule })}
          >
            <FiPlus /> New rule
          </button>
        </header>

        {/* A seven-column table compares rules well on a wide screen and is
            unreadable on a phone. Same rules, drawn as cards below lg. */}
        <div className="space-y-3 p-4 lg:hidden">
          {(rules || []).map((rule) => (
            <RuleCard
              key={rule._id}
              rule={rule}
              categories={categories}
              listings={listings}
              isActing={isActing}
              onEdit={() => setEditing(formFromRule(rule))}
            />
          ))}
          {!(rules || []).length && <NoRules />}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Applies to</th>
                <th>Earns</th>
                <th className="text-right">Priority</th>
                <th>Runs</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(rules || []).map((rule) => (
                <RuleRow
                  key={rule._id}
                  rule={rule}
                  categories={categories}
                  listings={listings}
                  isActing={isActing}
                  onEdit={() => setEditing(formFromRule(rule))}
                />
              ))}
              {!(rules || []).length && (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <NoRules />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <RuleEditor
          rule={editing}
          categories={categories}
          listings={listings}
          settings={settings}
          isActing={isActing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ── The base programme ─────────────────────────────────────────────────── */

function ProgrammeSettings({ settings, isActing }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!settings) return;
    const loyalty = settings.loyalty || {};
    const accounts = settings.accounts || {};
    setForm({
      enabled: Boolean(loyalty.enabled),
      programName: loyalty.programName || "Rewards",
      pointsName: loyalty.pointsName || "points",
      earnRate: loyalty.earnRate ?? 1,
      earnOnShipping: Boolean(loyalty.earnOnShipping),
      redeemRate: loyalty.redeemRate ?? 100,
      minRedeemPoints: loyalty.minRedeemPoints ?? 200,
      maxRedeemPercent: loyalty.maxRedeemPercent ?? 50,
      signupBonus: loyalty.signupBonus ?? 0,
      reviewBonus: loyalty.reviewBonus ?? 0,
      expiryMonths: loyalty.expiryMonths ?? 0,
      terms: loyalty.terms || "",
      tiers: (loyalty.tiers || []).map((tier) => ({
        name: tier.name || "",
        threshold: tier.threshold ?? 0,
        multiplier: tier.multiplier ?? 1,
        perk: tier.perk || "",
      })),
      accountsEnabled: accounts.enabled !== false,
      guestCheckout: accounts.guestCheckout !== false,
      signupHeading: accounts.signupHeading || "Create your account",
      signupBlurb: accounts.signupBlurb || "",
    });
  }, [settings]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // What the programme actually costs, in the only unit that matters: a
  // percentage of revenue. A shop reading "1 point per €1, 100 points = €1" has
  // to do two sums to find out it is giving away 1%; this does them.
  const worth = useMemo(() => {
    if (!form) return null;
    const earn = Number(form.earnRate) || 0;
    const redeem = Number(form.redeemRate) || 1;
    const percent = (earn / redeem) * 100;
    return {
      percent,
      example: earn * 50,
      exampleValue: (earn * 50) / redeem,
    };
  }, [form]);

  if (!form) {
    return (
      <div className="rounded-xl border bg-base-100 p-8 text-center text-base-content/50">
        Loading settings…
      </div>
    );
  }

  const save = async () => {
    const result = await dispatch(
      saveOnlineSettings({
        accounts: {
          enabled: form.accountsEnabled,
          guestCheckout: form.guestCheckout,
          signupHeading: form.signupHeading,
          signupBlurb: form.signupBlurb,
        },
        loyalty: {
          enabled: form.enabled,
          programName: form.programName,
          pointsName: form.pointsName,
          earnRate: Number(form.earnRate) || 0,
          earnOnShipping: form.earnOnShipping,
          redeemRate: Number(form.redeemRate) || 1,
          minRedeemPoints: Number(form.minRedeemPoints) || 0,
          maxRedeemPercent: Number(form.maxRedeemPercent) || 0,
          signupBonus: Number(form.signupBonus) || 0,
          reviewBonus: Number(form.reviewBonus) || 0,
          expiryMonths: Number(form.expiryMonths) || 0,
          terms: form.terms,
          tiers: form.tiers,
        },
      }),
    );
    result.error
      ? toast.error(result.payload)
      : toast.success("Rewards programme saved");
  };

  return (
    <section className="space-y-4 rounded-xl border bg-base-100 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <FiAward /> Programme
          </h3>
          <p className="text-sm text-base-content/60">
            The rate everything earns unless a rule below says otherwise.
          </p>
        </div>
        <button
          className="btn btn-sm btn-primary gap-2"
          disabled={isActing}
          onClick={save}
        >
          <FiSave /> Save programme
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Toggle
            label="Rewards are live"
            hint="Off, nothing is earned or shown anywhere on the website."
            value={form.enabled}
            onChange={(value) => set("enabled", value)}
          />
          <Toggle
            label="Customer accounts"
            hint="Off, the website hides every sign-in link and checks out as it did before."
            value={form.accountsEnabled}
            onChange={(value) => set("accountsEnabled", value)}
          />
          <Toggle
            label="Allow guest checkout"
            hint="Off, shoppers must create an account before they can order."
            value={form.guestCheckout}
            onChange={(value) => set("guestCheckout", value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Programme name"
              value={form.programName}
              onChange={(value) => set("programName", value)}
              placeholder="Puff Rewards"
            />
            <Field
              label="Call points"
              value={form.pointsName}
              onChange={(value) => set("pointsName", value)}
              placeholder="points"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-base-200/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Earn per €1"
              type="number"
              step="0.1"
              value={form.earnRate}
              onChange={(value) => set("earnRate", value)}
            />
            <Field
              label="Points for €1 back"
              type="number"
              value={form.redeemRate}
              onChange={(value) => set("redeemRate", value)}
            />
          </div>
          {worth && (
            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <FiInfo className="mt-0.5 shrink-0 text-info" />
                <div>
                  A €50 order earns <strong>{whole(Math.floor(worth.example))}</strong>{" "}
                  {form.pointsName}, worth{" "}
                  <strong>€{worth.exampleValue.toFixed(2)}</strong>. This
                  programme gives back{" "}
                  <strong>{worth.percent.toFixed(2)}%</strong> of what people
                  spend.
                </div>
              </div>
            </div>
          )}
          <Toggle
            label="Earn on delivery charges too"
            hint="Usually off — shoppers shouldn't collect points on the courier's fee."
            value={form.earnOnShipping}
            onChange={(value) => set("earnOnShipping", value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Smallest redemption"
          type="number"
          value={form.minRedeemPoints}
          onChange={(value) => set("minRedeemPoints", value)}
          hint={`In ${form.pointsName}`}
        />
        <Field
          label="Max % of an order"
          type="number"
          value={form.maxRedeemPercent}
          onChange={(value) => set("maxRedeemPercent", value)}
          hint="100 lets points clear a whole basket"
        />
        <Field
          label="Welcome bonus"
          type="number"
          value={form.signupBonus}
          onChange={(value) => set("signupBonus", value)}
          hint="Given once, on sign-up"
        />
        <Field
          label="Review bonus"
          type="number"
          value={form.reviewBonus}
          onChange={(value) => set("reviewBonus", value)}
          hint="For reviewing a delivered order"
        />
      </div>

      <Field
        label="Points expire after (months)"
        type="number"
        value={form.expiryMonths}
        onChange={(value) => set("expiryMonths", value)}
        hint="0 means they never expire. A programme with no expiry is a bill that only grows."
      />

      <TierEditor
        tiers={form.tiers}
        pointsName={form.pointsName}
        onChange={(tiers) => set("tiers", tiers)}
      />

      <label className="form-control">
        <span className="label-text">Programme terms</span>
        <textarea
          className="textarea textarea-bordered min-h-28"
          placeholder={'## How it works\n\nEarn points on everything you buy…'}
          value={form.terms}
          onChange={(event) => set("terms", event.target.value)}
        />
        <span className="label-text-alt text-base-content/50">
          Shown on the customer's rewards page. Start a line with "## " to make
          it a heading.
        </span>
      </label>
    </section>
  );
}

function TierEditor({ tiers, pointsName, onChange }) {
  const update = (index, key, value) =>
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, [key]: value } : tier)));

  return (
    <div className="rounded-xl border bg-base-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">Tiers</h4>
          <p className="text-sm text-base-content/60">
            Reached on <strong>lifetime</strong> {pointsName}, so spending a
            reward never costs somebody their standing.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-xs gap-1"
          onClick={() =>
            onChange([
              ...tiers,
              { name: "", threshold: 0, multiplier: 1, perk: "" },
            ])
          }
        >
          <FiPlus /> Add tier
        </button>
      </div>

      {tiers.length > 0 && (
        <div className="mt-3 space-y-2">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg bg-base-200/40 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_7rem_6rem_1fr_auto] lg:items-end"
            >
              <Field
                label="Name"
                value={tier.name}
                onChange={(value) => update(index, "name", value)}
                placeholder="Gold"
              />
              <Field
                label={`Lifetime ${pointsName}`}
                type="number"
                value={tier.threshold}
                onChange={(value) => update(index, "threshold", Number(value) || 0)}
              />
              <Field
                label="Multiplier"
                type="number"
                step="0.1"
                value={tier.multiplier}
                onChange={(value) => update(index, "multiplier", Number(value) || 1)}
              />
              <Field
                label="Perk"
                value={tier.perk}
                onChange={(value) => update(index, "perk", value)}
                placeholder="Free delivery on every order"
              />
              <button
                type="button"
                className="btn btn-sm btn-ghost gap-2 text-error lg:w-auto"
                onClick={() => onChange(tiers.filter((_, i) => i !== index))}
              >
                <FiTrash2 />
                <span className="lg:hidden">Remove tier</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Rules ──────────────────────────────────────────────────────────────── */

function RuleCard({ rule, categories, listings, isActing, onEdit }) {
  const dispatch = useDispatch();
  const targets = useMemo(
    () => describeTargets(rule, categories, listings),
    [rule, categories, listings],
  );

  const remove = async () => {
    if (!window.confirm(`Delete "${rule.name}"? Points already given keep their reason.`)) {
      return;
    }
    const result = await dispatch(deleteLoyaltyRule(rule._id));
    result.error ? toast.error(result.payload) : toast.success("Rule deleted");
  };

  return (
    <div className="rounded-xl border bg-base-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{rule.name}</div>
          {rule.description && (
            <div className="text-xs text-base-content/50">{rule.description}</div>
          )}
        </div>
        <RuleStatus rule={rule} />
      </div>

      <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-base-content/50">Applies to</dt>
          <dd className="min-w-0 text-right">
            {SCOPES.find((s) => s.id === rule.scope)?.label}
            {["category", "product", "brand"].includes(rule.scope) && (
              <span className="block truncate text-xs text-base-content/50">
                {targets}
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-base-content/50">Earns</dt>
          <dd className="text-right">{describeEarning(rule)}</dd>
        </div>
        {rule.minSpend > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-base-content/50">Minimum</dt>
            <dd>€{rule.minSpend}</dd>
          </div>
        )}
        {rule.maxPointsPerOrder > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-base-content/50">Cap per order</dt>
            <dd>{whole(rule.maxPointsPerOrder)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-base-content/50">Priority</dt>
          <dd className="tabular-nums">{rule.priority || 0}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-base-content/50">Runs</dt>
          <dd className="text-right text-xs">{ruleWindow(rule) || "Always"}</dd>
        </div>
      </dl>

      <div className="mt-3 flex gap-2 border-t pt-3">
        <button className="btn btn-sm flex-1 gap-2" onClick={onEdit}>
          <FiEdit2 /> Edit
        </button>
        <button
          className="btn btn-sm btn-ghost text-error"
          disabled={isActing}
          onClick={remove}
          aria-label={`Delete ${rule.name}`}
        >
          <FiTrash2 />
        </button>
      </div>
    </div>
  );
}

function RuleRow({ rule, categories, listings, isActing, onEdit }) {
  const dispatch = useDispatch();

  const targets = useMemo(
    () => describeTargets(rule, categories, listings),
    [rule, categories, listings],
  );
  const earns = useMemo(() => describeEarning(rule), [rule]);

  const remove = async () => {
    if (!window.confirm(`Delete "${rule.name}"? Points already given keep their reason.`)) {
      return;
    }
    const result = await dispatch(deleteLoyaltyRule(rule._id));
    result.error ? toast.error(result.payload) : toast.success("Rule deleted");
  };

  const window_ = ruleWindow(rule);

  return (
    <tr className="hover">
      <td>
        <div className="font-medium">{rule.name}</div>
        {rule.description && (
          <div className="max-w-xs truncate text-xs text-base-content/50">
            {rule.description}
          </div>
        )}
      </td>
      <td className="max-w-[220px]">
        <div className="text-sm">
          {SCOPES.find((s) => s.id === rule.scope)?.label}
        </div>
        {["category", "product", "brand"].includes(rule.scope) && (
          <div className="truncate text-xs text-base-content/50" title={targets}>
            {targets}
          </div>
        )}
        {rule.minSpend > 0 && (
          <div className="text-xs text-base-content/50">over €{rule.minSpend}</div>
        )}
      </td>
      <td className="text-sm">
        {earns}
        {rule.maxPointsPerOrder > 0 && (
          <div className="text-xs text-base-content/50">
            capped at {whole(rule.maxPointsPerOrder)}/order
          </div>
        )}
      </td>
      <td className="text-right tabular-nums">{rule.priority || 0}</td>
      <td className="text-xs text-base-content/60">{window_ || "Always"}</td>
      <td>
        <RuleStatus rule={rule} />
      </td>
      <td className="whitespace-nowrap text-right">
        <button className="btn btn-ghost btn-xs" onClick={onEdit}>
          <FiEdit2 />
        </button>
        <button
          className="btn btn-ghost btn-xs text-error"
          disabled={isActing}
          onClick={remove}
        >
          <FiTrash2 />
        </button>
      </td>
    </tr>
  );
}

function RuleEditor({ rule, categories, listings, settings, isActing, onClose }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState(rule);
  const [productSearch, setProductSearch] = useState("");

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const pointsName = settings?.loyalty?.pointsName || "points";
  const baseRate = Number(settings?.loyalty?.earnRate ?? 1);

  const scope = SCOPES.find((s) => s.id === form.scope);
  const mode = EARN_MODES.find((m) => m.id === form.earnMode);

  const filteredListings = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    const rows = listings || [];
    if (!query) return rows.slice(0, 60);
    return rows
      .filter((listing) =>
        `${listing.webName || ""} ${listing.product?.name || ""} ${listing.brand || ""}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 60);
  }, [listings, productSearch]);

  // A plain-English restatement of the rule as configured. The single most
  // useful thing on this form: it catches "2 points per €1" typed where
  // "2× the base rate" was meant, before it reaches a customer.
  const preview = useMemo(() => {
    const value = Number(form.value) || 0;
    const what =
      form.scope === "order"
        ? "the order"
        : form.scope === "all"
          ? "every item"
          : scope?.label?.toLowerCase() || "matching items";
    if (form.earnMode === "multiplier") {
      return `${what} earns ${value}× the base rate — ${(baseRate * value).toFixed(2)} ${pointsName} per €1.`;
    }
    if (form.earnMode === "per_currency") {
      return `${what} earns ${value} ${pointsName} for every €1 spent on it.`;
    }
    if (form.earnMode === "per_unit") {
      return `${what} earns ${value} ${pointsName} per item, whatever it costs.`;
    }
    return form.scope === "order"
      ? `A flat ${value} ${pointsName} once the order reaches €${form.minSpend || 0}.`
      : `A flat ${value} ${pointsName} per matching line.`;
  }, [form, scope, baseRate, pointsName]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Give the rule a name");
    const result = await dispatch(
      saveLoyaltyRule({
        id: form.id || undefined,
        name: form.name,
        description: form.description,
        active: form.active,
        scope: form.scope,
        categories: form.categories,
        listings: form.listings,
        brand: form.brand,
        earnMode: form.earnMode,
        value: Number(form.value) || 0,
        minSpend: Number(form.minSpend) || 0,
        maxPointsPerOrder: Number(form.maxPointsPerOrder) || 0,
        priority: Number(form.priority) || 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      }),
    );
    if (result.error) return toast.error(result.payload);
    toast.success(form.id ? "Rule saved" : "Rule created");
    onClose();
  };

  const toggleIn = (key, id) =>
    set(
      key,
      form[key].includes(id)
        ? form[key].filter((item) => item !== id)
        : [...form[key], id],
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-base-100 shadow-2xl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-display text-lg font-bold">
            {form.id ? "Edit reward rule" : "New reward rule"}
          </h3>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
            <FiX />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              value={form.name}
              onChange={(value) => set("name", value)}
              placeholder="Double points on e-liquids"
              hint="The customer sees this on their statement"
            />
            <Field
              label="Note (optional)"
              value={form.description}
              onChange={(value) => set("description", value)}
              placeholder="Autumn promotion"
            />
          </div>

          <div>
            <span className="label-text">Applies to</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {SCOPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => set("scope", option.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.scope === option.id
                      ? "border-primary bg-primary/10"
                      : "hover:bg-base-200"
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-0.5 text-xs text-base-content/60">
                    {option.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {form.scope === "category" && (
            <div>
              <span className="label-text">Categories</span>
              <div className="mt-1 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border p-3">
                {(categories || []).map((category) => (
                  <button
                    key={category._id}
                    type="button"
                    onClick={() => toggleIn("categories", category._id)}
                    className={`badge badge-lg cursor-pointer ${
                      form.categories.includes(category._id)
                        ? "badge-primary"
                        : "badge-outline"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
                {!(categories || []).length && (
                  <span className="text-sm text-base-content/50">
                    No website categories yet.
                  </span>
                )}
              </div>
            </div>
          )}

          {form.scope === "product" && (
            <div>
              <div className="flex items-center justify-between">
                <span className="label-text">Products</span>
                <span className="text-xs text-base-content/50">
                  {form.listings.length} selected
                </span>
              </div>
              <input
                type="search"
                className="input input-sm input-bordered mt-1 w-full"
                placeholder="Search products"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
              />
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                {filteredListings.map((listing) => (
                  <label
                    key={listing._id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-base-200"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={form.listings.includes(listing._id)}
                      onChange={() => toggleIn("listings", listing._id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {listing.webName || listing.product?.name}
                    </span>
                    {listing.brand && (
                      <span className="shrink-0 text-xs text-base-content/40">
                        {listing.brand}
                      </span>
                    )}
                  </label>
                ))}
                {!filteredListings.length && (
                  <div className="p-2 text-sm text-base-content/50">
                    Nothing matches that.
                  </div>
                )}
              </div>
            </div>
          )}

          {form.scope === "brand" && (
            <Field
              label="Brand"
              value={form.brand}
              onChange={(value) => set("brand", value)}
              placeholder="Elf Bar"
              hint="Matched against the brand on each listing, ignoring case"
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text">Earns</span>
              <select
                className="select select-bordered"
                value={form.earnMode}
                onChange={(event) => set("earnMode", event.target.value)}
              >
                {EARN_MODES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Amount"
              type="number"
              step="0.01"
              value={form.value}
              onChange={(value) => set("value", value)}
              hint={mode?.suffix}
            />
          </div>

          <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <FiInfo className="mt-0.5 shrink-0 text-info" />
              <span>{preview}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={form.scope === "order" ? "Order must reach (€)" : "Line must reach (€)"}
              type="number"
              step="0.01"
              value={form.minSpend}
              onChange={(value) => set("minSpend", value)}
              hint="0 = no minimum"
            />
            <Field
              label="Cap per order"
              type="number"
              value={form.maxPointsPerOrder}
              onChange={(value) => set("maxPointsPerOrder", value)}
              hint="0 = uncapped. Worth setting on a multiplier."
            />
            <Field
              label="Priority"
              type="number"
              value={form.priority}
              onChange={(value) => set("priority", value)}
              hint="Higher wins when two rules match"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(value) => set("startsAt", value)}
              hint="Leave blank to start now"
            />
            <Field
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(value) => set("endsAt", value)}
              hint="Leave blank to run until switched off"
            />
          </div>

          <Toggle
            label="Rule is live"
            hint="Off keeps it here without giving anything away."
            value={form.active}
            onChange={(value) => set("active", value)}
          />
        </div>

        <footer className="flex justify-end gap-2 border-t px-5 py-4">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm gap-2"
            disabled={isActing}
            onClick={submit}
          >
            <FiSave /> {form.id ? "Save rule" : "Create rule"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── Small shared inputs ────────────────────────────────────────────────── */

function Field({ label, hint, value, onChange, type = "text", ...rest }) {
  return (
    <label className="form-control w-full">
      <span className="label-text">{label}</span>
      <input
        type={type}
        className="input input-sm input-bordered w-full"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
      {hint && (
        <span className="label-text-alt text-base-content/50">{hint}</span>
      )}
    </label>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-base-200"
    >
      {value ? (
        <FiToggleRight className="mt-0.5 shrink-0 text-2xl text-primary" />
      ) : (
        <FiToggleLeft className="mt-0.5 shrink-0 text-2xl text-base-content/30" />
      )}
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span className="block text-xs text-base-content/60">{hint}</span>
        )}
      </span>
    </button>
  );
}
