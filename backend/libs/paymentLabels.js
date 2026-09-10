/* What a tender is called when somebody reads it.
 *
 * The database stores "creditcard", because that is what the enum has always
 * said and changing stored values would mean rewriting every receipt and sale
 * ever taken. The shop calls it a card. Every screen in the app already does
 * too — frontend/src/i18n/locales/en.json has common.payments.creditcard =
 * "Card" — and the reports were the one place the raw value leaked out, so a
 * downloaded sales report said "creditcard" where the till said "Card".
 *
 * These labels are deliberately the SAME WORDS as that translation file. A
 * report is the screen in a file; the two disagreeing on what a card is makes
 * the file look like it came from somewhere else.
 *
 * The reports are English-only — they carry no locale — so this is a plain map
 * rather than anything that reaches for i18n. Anything unrecognised falls back
 * to the stored value, so a tender added to the enum tomorrow prints as itself
 * rather than as an empty cell.
 */

const PAYMENT_LABELS = {
  cash: "Cash",
  creditcard: "Card",
  wallet: "Wallet",
  credit: "Credit",
  // Credit from a return, spending itself on the replacement.
  refund: "Refund Credit",
  // More than one tender on one receipt; the breakdown lives on the Receipt.
  split: "Split",
};

const paymentLabel = (method) => {
  const key = String(method || "").trim();
  if (!key) return "";
  return PAYMENT_LABELS[key.toLowerCase()] || key;
};

module.exports = { PAYMENT_LABELS, paymentLabel };
