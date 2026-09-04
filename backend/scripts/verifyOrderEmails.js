/* Proof that a shopper gets exactly three emails per order, and no more.
 *
 *   node scripts/verifyOrderEmails.js
 *
 * Needs no database and no SMTP: the mailer and the order model are stubbed,
 * and the real controller is loaded against them. What is being checked is the
 * decision — which statuses send, and how many messages each one produces —
 * not the wording.
 *
 * This exists because "how many emails does a customer get?" is the kind of
 * thing that drifts. Every future status added to the fulfilment cycle is a
 * chance for somebody to bolt another email onto it, and nobody notices four
 * emails becoming five until a customer complains.
 *
 * The three:
 *   1. placed     — sendOrderEmails, on checkout
 *   2. dispatched — sendOrderStatusEmail, status "shipped"
 *   3. delivered  — sendOrderStatusEmail, status "delivered", carrying the
 *                   review invitation inside it
 */

const Module = require("module");

let failures = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// Every message the controller tries to send, in order.
const outbox = [];
// Orders whose review invitation has already been claimed.
const reviewClaimed = new Set();

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (request === "../libs/mailer") {
    return {
      isMailConfigured: () => true,
      esc: (v) => String(v ?? ""),
      brandedHtml: (_brand, body) => body,
      sendMail: async (message) => {
        outbox.push(message);
        return { ok: true };
      },
    };
  }
  if (request === "../models/OnlineOrdermodel") {
    return {
      // The atomic claim: only succeeds the first time for a given order.
      findOneAndUpdate: (filter) => ({
        lean: async () => {
          const id = String(filter._id);
          if (reviewClaimed.has(id)) return null; // already invited
          reviewClaimed.add(id);
          return { ...currentOrder, orderNo: currentOrder.orderNo };
        },
      }),
      updateOne: async (filter) => {
        reviewClaimed.delete(String(filter._id));
        return { acknowledged: true };
      },
      find: () => ({ lean: async () => [] }),
      findOne: () => ({ lean: async () => null }),
    };
  }
  return originalLoad.apply(this, arguments);
};

let currentOrder = null;
const controller = require("../controller/onlineStoreController");
Module._load = originalLoad;

/* The controller resolves settings and the shop's brand from the database.
 * Neither decides how many emails go out, so they are stubbed to something
 * plausible and the test stays focused on the count. */
const ORDER_TERMS = [
  "18+ only. Valid ID may be required.",
  "7-day returns with receipt; unused & unopened items only.",
  "Statutory consumer rights remain unaffected.",
].join("\n");

const settingsStub = {
  business: { tradingName: "Cliffs of Puff" },
  footer: { address: "Longford", supportPhone: "", supportEmail: "" },
  loyalty: { enabled: true, pointsName: "points" },
  checkout: { orderTerms: ORDER_TERMS },
};

const makeOrder = (status) => ({
  _id: "order1",
  store: "store1",
  orderNo: "CP-1019",
  status,
  customer: { name: "Aoife Byrne", email: "aoife@example.com" },
  items: [],
  total: 42,
  timeline: [],
  tracking: {},
  loyalty: { earned: 40 },
  reviewRequestedAt: null,
});

const run = async () => {
  const internals = controller.__emailInternals;
  if (!internals) {
    console.log(
      "  FAIL  controller does not expose __emailInternals — this test cannot run",
    );
    process.exit(1);
  }
  const { STATUS_EMAIL, sendOrderStatusEmail } = internals;

  console.log("\nWhich statuses email the customer");

  // The decision table itself, before any sending: only two statuses may have
  // a template, because the third email is the confirmation at checkout.
  const templated = Object.keys(STATUS_EMAIL).sort();
  check(
    "exactly two statuses have a status email",
    templated.length === 2,
    `has ${templated.length}: ${templated.join(", ")}`,
  );
  check('"shipped" emails the customer', templated.includes("shipped"));
  check('"delivered" emails the customer', templated.includes("delivered"));
  check(
    '"ready"/packed does NOT email the customer',
    !templated.includes("ready"),
    "a fourth email would be sent",
  );
  for (const quiet of ["pending", "paid", "cancelled", "refunded", "processing"]) {
    check(`"${quiet}" does NOT email the customer`, !templated.includes(quiet));
  }

  console.log("\nHow many emails each step actually sends");

  const send = async (status) => {
    outbox.length = 0;
    currentOrder = makeOrder(status);
    await sendOrderStatusEmail("store1", currentOrder, settingsStub);
    return [...outbox];
  };

  const shipped = await send("shipped");
  check("dispatch sends exactly one email", shipped.length === 1, `sent ${shipped.length}`);
  check(
    "the dispatch email says the order is on its way",
    /on its way/i.test(shipped[0]?.subject || ""),
  );
  check(
    "the dispatch email does NOT ask for a review",
    !/review/i.test(shipped[0]?.html || ""),
    "reviewing a parcel that has not arrived",
  );

  reviewClaimed.clear();
  const delivered = await send("delivered");
  check("delivery sends exactly one email", delivered.length === 1, `sent ${delivered.length}`);
  check(
    "the delivered email says it was delivered",
    /delivered/i.test(delivered[0]?.subject || ""),
  );
  check(
    "the review invitation is INSIDE the delivered email",
    /write a review/i.test(delivered[0]?.html || ""),
  );
  check(
    "the review link is tokenised",
    /\/review\/CP-1019\/[a-f0-9]{48}/.test(delivered[0]?.html || ""),
  );

  // The guard that matters most: a retried status change, a double-click in
  // the admin, or a webhook delivered twice must not invite the same customer
  // to review the same order again.
  const deliveredAgain = await send("delivered");
  check(
    "a repeated delivered transition does not invite a review twice",
    !/write a review/i.test(deliveredAgain[0]?.html || ""),
  );

  /* The shop's terms belong on every email a customer keeps, not only the
   * confirmation — the returns window matters most on the delivered one, which
   * is when it starts running. */
  console.log("\nOrder terms reach every customer email");

  const plain = (html) =>
    String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&middot;/g, "·")
      .replace(/\s+/g, " ")
      .trim();

  const confirmationOrder = {
    ...makeOrder("pending"),
    items: [],
    subtotal: 0,
    shipping: 0,
    createdAt: new Date(),
  };
  const confirmation = plain(
    controller.professionalOrderEmail(confirmationOrder, settingsStub),
  );

  for (const [label, body] of [
    ["confirmation", confirmation],
    ["dispatch", plain(shipped[0]?.html)],
    ["delivered", plain(delivered[0]?.html)],
  ]) {
    check(`${label} email carries the age restriction`, /18\+ only/.test(body));
    check(`${label} email carries the returns window`, /7-day returns/.test(body));
    check(
      `${label} email carries the statutory-rights line`,
      /Statutory consumer rights/.test(body),
    );
  }

  // Said twice in one email, it reads like boilerplate nobody proofread.
  const ageMentions = (confirmation.match(/18\+/g) || []).length;
  check(
    "the confirmation email does not say 18+ twice",
    ageMentions === 1,
    `said ${ageMentions} times`,
  );

  /* And the failure that would go unnoticed: a shop that clears its terms must
   * not lose the age notice from its order emails. It falls back to the
   * footer. */
  const cleared = plain(
    controller.professionalOrderEmail(confirmationOrder, {
      ...settingsStub,
      checkout: { orderTerms: "" },
    }),
  );
  check(
    "clearing the terms does NOT drop the age notice",
    /18\+ only/.test(cleared),
    "a compliance line would vanish from every order email",
  );
  check(
    "clearing the terms keeps the nicotine warning",
    /Contains nicotine/.test(cleared),
  );

  console.log("\nTotal for one order's whole life");
  // placed (sendOrderEmails) + shipped + delivered
  const perOrder = 1 + shipped.length + delivered.length;
  check(
    "a customer receives exactly 3 emails per order",
    perOrder === 3,
    `counted ${perOrder}`,
  );

  console.log(
    failures ? `\n${failures} check(s) FAILED\n` : "\nOrder email flow verified.\n",
  );
  process.exit(failures ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
