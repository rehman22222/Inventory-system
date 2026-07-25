const nodemailer = require("nodemailer");

// One shared mailbox sends every shop's mail (configured once in the server
// environment — never in the app UI, never in the database). Each message is
// branded per‑shop through its content and From display‑name, so the same
// sender serves many shops while every email still reads as that shop's.
//
// Required env (system account — reorder alerts, low-stock, contact, shop alerts):
//   SMTP_HOST   e.g. smtp.hostinger.com
//   SMTP_PORT   465 (SSL) or 587 (STARTTLS)
//   SMTP_SECURE "true" for 465, "false" for 587
//   SMTP_USER   the mailbox, e.g. orders@e360pro.com
//   SMTP_PASS   the mailbox password
//
// Optional env (store account — customer order confirmations). Same shape,
// STORE_SMTP_ prefix. When unset, order confirmations fall back to the system
// account above.
//   STORE_SMTP_HOST / STORE_SMTP_PORT / STORE_SMTP_SECURE
//   STORE_SMTP_USER   e.g. orders@cliffsofpuff.com
//   STORE_SMTP_PASS
//
// When these are absent (e.g. local dev, or a host that blocks SMTP such as
// Render's free tier), mail is quietly skipped — the app keeps working and the
// caller is told it didn't send, rather than crashing.

// Two sending identities:
//   system — the platform/operator mailbox (SMTP_*). Reorder alerts, low-stock
//            digests, the contact form and shop notifications go from here.
//   store  — the shop's own customer-facing mailbox (STORE_SMTP_*). Order
//            confirmations to shoppers go from here, so a customer sees the
//            store's brand, not the operator's.
// If the store account isn't configured, mail routed to it falls back to the
// system account, so a shop that hasn't set up its own mailbox still gets mail
// out (just from the system address).
const buildAccount = (prefix) => {
  const port = Number(process.env[`${prefix}PORT`]) || 465;
  return {
    host: process.env[`${prefix}HOST`],
    port,
    secure:
      process.env[`${prefix}SECURE`] !== undefined
        ? process.env[`${prefix}SECURE`] === "true"
        : port === 465,
    user: process.env[`${prefix}USER`],
    pass: process.env[`${prefix}PASS`],
  };
};

const accounts = {
  system: buildAccount("SMTP_"),
  store: buildAccount("STORE_SMTP_"),
};

const accountConfigured = (account) =>
  Boolean(account && account.host && account.user && account.pass);

// Pick the requested account if it's configured; otherwise fall back to system.
const resolveAccount = (name) => {
  if (accountConfigured(accounts[name])) return accounts[name];
  if (accountConfigured(accounts.system)) return accounts.system;
  return null;
};

const isMailConfigured = () =>
  accountConfigured(accounts.system) || accountConfigured(accounts.store);

// One transporter per distinct mailbox, built on first use.
const transporters = new Map();
const getTransport = (account) => {
  const key = `${account.user}@${account.host}:${account.port}`;
  if (!transporters.has(key)) {
    transporters.set(
      key,
      nodemailer.createTransport({
        host: account.host,
        port: account.port,
        secure: account.secure,
        auth: { user: account.user, pass: account.pass },
      }),
    );
  }
  return transporters.get(key);
};

// Escape anything that lands inside the HTML template, so a supplier name or
// note can't inject markup.
const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Wrap a body in the shop's letterhead — the same identity used on receipts and
// reports, pulled from Store settings.
const brandedHtml = (shop, bodyHtml) => {
  const name = esc(shop?.name || "Shop");
  const address = (shop?.addressLines || []).filter(Boolean).map(esc).join(" · ");
  const phone = esc(shop?.phone || "");
  const contact = [address, phone].filter(Boolean).join("  ·  ");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#1e293b;color:#ffffff;padding:20px 28px;">
        <div style="font-size:20px;font-weight:bold;">${name}</div>
        ${contact ? `<div style="font-size:12px;opacity:.8;margin-top:4px;">${contact}</div>` : ""}
      </div>
      <div style="padding:28px;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">
        Sent automatically by ${name}. Please do not reply to this address.
      </div>
    </div>
  </body>
</html>`;
};

// Low‑level send. Returns { ok, skipped?, error? } and never throws, so a mail
// failure can't take down the action that triggered it.
// `account` selects the sending identity: "system" (default) or "store".
const sendMail = async ({ to, subject, html, fromName, account = "system" }) => {
  const resolved = resolveAccount(account);
  if (!resolved) return { ok: false, skipped: true, reason: "mail-not-configured" };
  if (!to) return { ok: false, skipped: true, reason: "no-recipient" };

  try {
    const transport = getTransport(resolved);
    // From display‑name is the shop; the address is always the authenticated
    // mailbox of the chosen account (any other From would be rejected).
    const from = fromName
      ? `"${String(fromName).replace(/"/g, "")}" <${resolved.user}>`
      : resolved.user;
    const info = await transport.sendMail({ from, to, subject, html });
    return { ok: true, id: info.messageId };
  } catch (error) {
    console.error("[mailer] send failed:", error.message);
    return { ok: false, error: error.message };
  }
};

module.exports = { isMailConfigured, sendMail, brandedHtml, esc };
