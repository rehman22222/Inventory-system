const nodemailer = require("nodemailer");

// One shared mailbox sends every shop's mail (configured once in the server
// environment — never in the app UI, never in the database). Each message is
// branded per‑shop through its content and From display‑name, so the same
// sender serves many shops while every email still reads as that shop's.
//
// Required env:
//   SMTP_HOST   e.g. smtp.hostinger.com
//   SMTP_PORT   465 (SSL) or 587 (STARTTLS)
//   SMTP_SECURE "true" for 465, "false" for 587
//   SMTP_USER   the mailbox, e.g. orders@inventory.eiretech360.com
//   SMTP_PASS   the mailbox password
//
// When these are absent (e.g. local dev, or a host that blocks SMTP such as
// Render's free tier), mail is quietly skipped — the app keeps working and the
// caller is told it didn't send, rather than crashing.

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT) || 465;
const secure =
  process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const isMailConfigured = () => Boolean(host && user && pass);

let transporter = null;
const getTransport = () => {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return transporter;
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
const sendMail = async ({ to, subject, html, fromName }) => {
  const transport = getTransport();
  if (!transport) return { ok: false, skipped: true, reason: "mail-not-configured" };
  if (!to) return { ok: false, skipped: true, reason: "no-recipient" };

  try {
    // From display‑name is the shop; the address is always the one authenticated
    // mailbox (any other From would be rejected by the mail server).
    const from = fromName ? `"${String(fromName).replace(/"/g, "")}" <${user}>` : user;
    const info = await transport.sendMail({ from, to, subject, html });
    return { ok: true, id: info.messageId };
  } catch (error) {
    console.error("[mailer] send failed:", error.message);
    return { ok: false, error: error.message };
  }
};

module.exports = { isMailConfigured, sendMail, brandedHtml, esc };
