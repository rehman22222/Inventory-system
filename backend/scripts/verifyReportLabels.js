/* Proof that a downloaded report calls things what the till calls them.
 *
 *   node scripts/verifyReportLabels.js
 *
 * Needs no database and no network, like verifyBlogSecurity.js.
 *
 * The database stores "creditcard" and always will — the enum is written into
 * every receipt and sale ever taken. Every screen already translates it, and
 * the reports were the one place the raw value leaked out: the shop downloaded
 * its sales report and found "creditcard" where the till says "Card".
 *
 * That is a small thing to read and an easy thing to break again, because the
 * fix lives in two codebases: the tenders the server knows (libs/paymentLabels)
 * and the words the app shows (the frontend's translation file). Nothing else
 * compares them, so a tender added to one and forgotten in the other would go
 * unnoticed until a report came out with a raw enum value in it.
 *
 * This reads them BOTH and insists they agree.
 */

const path = require("path");
const { paymentLabel, PAYMENT_LABELS } = require("../libs/paymentLabels");

const appLabels = require(
  path.join(__dirname, "..", "..", "frontend", "src", "i18n", "locales", "en.json"),
).common.payments;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log("Report tender names\n===================\n");
console.log("Every tender the app names, as a report will print it:");

for (const [stored, word] of Object.entries(appLabels)) {
  const printed = paymentLabel(stored);
  check(
    `${stored.padEnd(11)} -> ${String(printed).padEnd(14)}`,
    printed === word,
    printed === word ? "" : `the app calls this "${word}"`,
  );
}

console.log("\nAnd the rules around them:");

check(
  'the complaint this was written for: "creditcard" reads as "Card"',
  paymentLabel("creditcard") === "Card",
);
check(
  "no tender the app knows is missing from the report's map",
  Object.keys(appLabels).every((key) => key in PAYMENT_LABELS),
  "a tender added to the app and forgotten here prints as a raw enum value",
);
check(
  "no tender is named here that the app has never heard of",
  Object.keys(PAYMENT_LABELS).every((key) => key in appLabels),
  "two names for one thing is how a report starts disagreeing with a screen",
);
check(
  "an unrecognised tender prints as itself rather than as a blank cell",
  paymentLabel("bitcoin") === "bitcoin",
);
check(
  "a missing method is an empty cell, not the word undefined",
  paymentLabel(undefined) === "" && paymentLabel(null) === "" && paymentLabel("") === "",
);
check("case does not matter", paymentLabel("CreditCard") === "Card");

console.log(
  failures === 0
    ? "\nAll good — the report speaks the same language as the till."
    : `\n${failures} check(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
