/* Proof that archiving sales takes the right rows out of the books.
 *
 *   node scripts/verifySalesArchive.js
 *
 * Needs no database and no network, so it runs anywhere the repo does — the
 * same reasoning as verifyBlogSecurity.js. The only database this machine is
 * pointed at is the shop's live one, and a check that can only run against
 * production is a check nobody dares run.
 *
 * Three things here are dangerous to get wrong, and all three are silent when
 * they are wrong — the screen still shows a number, it is just the wrong one.
 *
 *   1. THE HIDING. An archived row must vanish from every read on Sale and
 *      Receipt: the sales list, the profit report, the POS history, the credit
 *      book, the online/counter split. That is not done by editing those
 *      queries — there are a dozen of them in five controllers, and the
 *      thirteenth would be written without knowing. It is a schema hook, and
 *      this checks the hook covers find, count, distinct, update and aggregate.
 *
 *   2. WHAT A SELECTION MEANS. "From this sale to that sale" and "this window
 *      of time" both have to land on the same kind of answer, and the sale the
 *      superadmin named at the end has to be inside it.
 *
 *   3. WHAT COMES WITH IT. A receipt is one transaction and is archived whole,
 *      and a refund travels with the sale it reverses — IN BOTH DIRECTIONS.
 *      Archiving a return on its own leaves the sale behind and the shop's
 *      revenue goes UP by the refund, which is the worst kind of bug this
 *      feature could have.
 */

const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const { __testables } = require("../controller/salesArchiveController");

const { seedFilter, expandSelection, describe: summarise } = __testables;

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const section = (title) => console.log(`\n${title}`);

// The query chain the controller uses: .select().sort().lean()
const chain = (rows) => {
  const self = { select: () => self, sort: () => self, lean: async () => rows };
  return self;
};

const oid = (n) => "0".repeat(23) + String(n);

// Run a model's registered middleware the way mongoose does before exec, then
// read back the filter it settled on.
const filterAfterHooks = (query, hook) =>
  new Promise((resolve, reject) =>
    query.model.schema.s.hooks.execPre(hook, query, [], (err) =>
      err ? reject(err) : resolve(query.getFilter()),
    ),
  );

const firstStageAfterHooks = async (model, pipeline, options) => {
  const agg = model.aggregate(pipeline);
  if (options) agg.option(options);
  await new Promise((resolve, reject) =>
    model.schema.s.hooks.execPre("aggregate", agg, [], (err) => (err ? reject(err) : resolve())),
  );
  return agg.pipeline()[0];
};

const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);

async function hiding() {
  section("1. An archived row is hidden from every kind of read");

  check(
    "find",
    same(await filterAfterHooks(Sale.find({ source: "pos" }), "find"), {
      source: "pos",
      archivedAt: null,
    }),
  );
  check("find, on receipts too", same(await filterAfterHooks(Receipt.find({}), "find"), { archivedAt: null }));
  check(
    "countDocuments",
    same(await filterAfterHooks(Sale.countDocuments({ "products.product": "p" }), "countDocuments"), {
      "products.product": "p",
      archivedAt: null,
    }),
  );
  check(
    "findOneAndUpdate — an archived sale cannot be edited by a screen that cannot see it",
    same(await filterAfterHooks(Sale.findOneAndUpdate({ receiptNo: "POS-1" }, {}), "findOneAndUpdate"), {
      receiptNo: "POS-1",
      archivedAt: null,
    }),
  );
  check(
    "aggregate — matched out before any $group can fold it into a total",
    same(await firstStageAfterHooks(Sale, [{ $group: { _id: null, n: { $sum: 1 } } }]), {
      $match: { archivedAt: null },
    }),
  );

  section("   …and the ways of asking for archived rows on purpose still work");

  check(
    "a query that names archivedAt is left alone",
    same(await filterAfterHooks(Sale.find({ archivedAt: { $ne: null } }), "find"), {
      archivedAt: { $ne: null },
    }),
  );
  check(
    "withArchived opts out — this is what lets a restore reach them",
    same(
      await filterAfterHooks(
        Sale.updateMany({ archiveBatch: "ARC-000001" }, { $set: {} }, { withArchived: true }),
        "updateMany",
      ),
      { archiveBatch: "ARC-000001" },
    ),
  );
  check(
    "an archive without that opt-out still cannot archive twice",
    same(await filterAfterHooks(Sale.updateMany({ _id: { $in: [oid(1)] } }, { $set: {} }), "updateMany"), {
      _id: { $in: [oid(1)] },
      archivedAt: null,
    }),
  );
  check(
    "an aggregate naming archivedAt is left alone",
    same(await firstStageAfterHooks(Sale, [{ $match: { archivedAt: { $ne: null } } }]), {
      $match: { archivedAt: { $ne: null } },
    }),
  );
}

async function selection() {
  section("2. What a selection resolves to");

  const start = new Date("2026-09-01T10:00:00Z");
  const end = new Date("2026-09-01T18:30:00Z");

  Sale.find = () =>
    chain([
      { receiptNo: "POS-000008", createdAt: start },
      { receiptNo: "POS-000042", createdAt: end },
    ]);

  const span = await seedFilter({ fromReceiptNo: "POS-000008", toReceiptNo: "POS-000042" });
  check(
    "sale-to-sale becomes a window of time, not a string comparison",
    span.createdAt.$gte.getTime() === start.getTime(),
  );
  check(
    "the sale named at the end is inside the window",
    span.createdAt.$lte.getTime() === end.getTime() + 999,
    "a busy till rings up two sales in the same second",
  );

  const openEnded = await seedFilter({ from: "2026-09-01T00:00:00Z" });
  check(
    "one end is enough — 'everything since' is a selection",
    Boolean(openEnded.createdAt.$gte) && !openEnded.createdAt.$lte,
  );

  let refused = false;
  try {
    await seedFilter({});
  } catch (error) {
    refused = error.status === 400;
  }
  check("an empty selection is refused rather than matching the ledger", refused);

  let missing = false;
  try {
    Sale.find = () => chain([]);
    await seedFilter({ fromReceiptNo: "POS-999999" });
  } catch (error) {
    missing = error.status === 404;
  }
  check("a receipt number that is not in the ledger is an error, not an empty window", missing);
}

async function whatComesWithIt() {
  section("3. What one selected row drags in with it");

  // One receipt: two sale lines, and a refund against it whose own Sale row is
  // written under an RFD- reference.
  const receipt = {
    _id: oid(5),
    receiptNo: "POS-000008",
    saleIds: [oid(1), oid(2)],
    refunds: [{ reference: "RFD-000003" }],
    dayClosing: oid(7),
  };

  const wire = (seedRows) => {
    Sale.find = (query) => {
      if (query.receiptNo?.$in?.some((no) => String(no).startsWith("RFD-"))) {
        return chain([{ _id: oid(9) }]);
      }
      return chain(seedRows);
    };
    Receipt.find = (query) => {
      const clauses = query.$or || [];
      const hit =
        clauses.some((c) =>
          c.saleIds?.$in?.some((id) => receipt.saleIds.map(String).includes(String(id))),
        ) ||
        clauses.some((c) => c.receiptNo?.$in?.includes(receipt.receiptNo)) ||
        clauses.some((c) => c["refunds.reference"]?.$in?.includes("RFD-000003"));
      return chain(hit ? [receipt] : []);
    };
  };

  wire([{ _id: oid(1), receiptNo: "POS-000008" }]);
  let out = await expandSelection({});
  let got = out.saleIds.map(String);
  check(
    "one line of a basket brings the whole receipt",
    got.includes(oid(1)) && got.includes(oid(2)),
    "half an archived receipt prints a total nothing adds up to",
  );
  check("and the refund put through against it", got.includes(oid(9)));
  check("nothing is counted twice", new Set(got).size === got.length);
  check("the closed day it belongs to is reported for recounting", out.dayClosingIds[0] === oid(7));

  // The other direction, and the reason it is here: a window that catches a
  // return but not the sale it reverses — the goods went back a week later.
  wire([{ _id: oid(9), receiptNo: "RFD-000003" }]);
  out = await expandSelection({});
  got = out.saleIds.map(String);
  check(
    "a refund on its own brings the sale it reverses",
    got.includes(oid(1)) && got.includes(oid(2)),
    "archiving the return alone would put the sale's revenue BACK",
  );

  section("   …and what the superadmin is shown before any of it happens");

  Sale.find = () =>
    chain([
      { totalAmount: 40, source: "pos", receiptNo: "POS-000008", createdAt: new Date("2026-09-01") },
      { totalAmount: 60, source: "pos", receiptNo: "POS-000009", createdAt: new Date("2026-09-01") },
      { totalAmount: -25, source: "refund", receiptNo: "RFD-000003", createdAt: new Date("2026-09-02") },
    ]);
  const totals = await summarise([oid(1), oid(2), oid(9)]);
  check("sales and refunds are counted apart", totals.sales === 2 && totals.refunds === 1);
  check(
    "the revenue quoted is the NET the reports will drop by",
    totals.revenue === 75,
    `${totals.revenue}`,
  );
  check(
    "the span is named first to last",
    totals.first.receiptNo === "POS-000008" && totals.last.receiptNo === "RFD-000003",
  );
}

(async () => {
  console.log("Verifying the sales archive\n===========================");
  await hiding();
  await selection();
  await whatComesWithIt();

  console.log(
    failures === 0
      ? "\nAll good — archived sales stay out of the books, and nothing is archived by halves."
      : `\n${failures} check(s) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\nverifySalesArchive crashed:", error);
  process.exit(1);
});
