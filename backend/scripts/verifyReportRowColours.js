/* Proof that a downloaded sales report marks the rows worth noticing.
 *
 *   node scripts/verifyReportRowColours.js
 *
 * No database and no network, like verifyBlogSecurity.js.
 *
 * This BUILDS A REAL WORKBOOK AND A REAL PDF and reads them back, rather than
 * asserting on the source. Colour is exactly the kind of thing that is written
 * confidently and never appears: a fill set on the wrong object, a colour name
 * that does not exist in the palette, a row index off by the header. None of
 * that throws — the file simply comes out plain, and nobody notices until the
 * shop opens it.
 *
 * Three kinds are marked, in one order: refund, then credit, then deal. A
 * refund taken on credit is a refund first (money left the drawer); a deal sold
 * on credit is unpaid first (the shop is owed for it). The same order the sales
 * screen uses, so a row does not change meaning between screen and download.
 */

const ExcelJS = require("exceljs");
const { buildWorkbookBuffer } = require("../libs/excel");
const { buildPdfBuffer } = require("../libs/pdf");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};
const section = (title) => console.log(`\n${title}`);

const HEADERS = ["Receipt No", "Date & Time", "Customer", "Charged", "Payment", "Status"];
const ROWS = [
  ["POS-001", "01 Sep 2026 10:00", "Walk-in", "10.00", "Cash", "completed"],
  ["POS-002", "01 Sep 2026 10:05", "Walk-in", "-4.00", "Cash", "completed"],
  ["POS-003", "01 Sep 2026 10:10", "Jo", "12.00", "Credit", "completed"],
  ["POS-004", "01 Sep 2026 10:15", "Walk-in", "18.00", "Cash", "completed"],
];
const KINDS = ["", "refund", "credit", "deal"];

const report = {
  reportType: "combined-sales",
  title: "Sales Report",
  subtitle: "Test",
  generatedBy: "test",
  headers: HEADERS,
  rows: ROWS,
  rowKinds: KINDS,
  summary: [["Total Sale Lines", ROWS.length]],
  shop: { name: "Test Shop" },
  currency: "EUR",
  timezone: "UTC",
};

async function excel() {
  section("1. The spreadsheet");

  const buffer = await buildWorkbookBuffer(report);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  // Find the data rows by their receipt numbers rather than by counting from
  // the top: the sheet has a title block above the table whose height is not
  // this test's business.
  const rowFor = (receiptNo) => {
    let found = null;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value || "") === receiptNo) found = row;
    });
    return found;
  };

  const fillOf = (row) => row?.getCell(1)?.fill?.fgColor?.argb || "";
  const inkOf = (row) => row?.getCell(1)?.font?.color?.argb || "";

  const plain = rowFor("POS-001");
  const refund = rowFor("POS-002");
  const credit = rowFor("POS-003");
  const deal = rowFor("POS-004");

  check("every row made it into the sheet", Boolean(plain && refund && credit && deal));

  check("the refund row is filled", Boolean(fillOf(refund)), fillOf(refund));
  check("the credit row is filled", Boolean(fillOf(credit)), fillOf(credit));
  check("the deal row is filled", Boolean(fillOf(deal)), fillOf(deal));

  check(
    "the deal row is PURPLE",
    fillOf(deal) === "FFF3E8FF" && inkOf(deal) === "FF6B21A8",
    `${fillOf(deal)} on ${inkOf(deal)}`,
  );
  check("the refund row is RED", fillOf(refund) === "FFFEE2E2", fillOf(refund));
  check(
    "the credit row is the till's own credit colour",
    fillOf(credit) === "FFFEF3C7" && inkOf(credit) === "FFB45309",
    "amber — the same as the credit button and the sales screen",
  );

  check(
    "and the three are told apart",
    new Set([fillOf(refund), fillOf(credit), fillOf(deal)]).size === 3,
  );

  section("   ...and an ordinary row is left alone");

  // Zebra striping still applies, so "left alone" means: not one of the three.
  const marked = ["FFFEE2E2", "FFFEF3C7", "FFF3E8FF"];
  check("a plain sale wears none of the three", !marked.includes(fillOf(plain)), fillOf(plain));
}

/* Everything the PDF actually draws, as text.
 *
 * PDFKit Flate-compresses its content streams, so the drawing operators are not
 * in the raw bytes — searching those finds nothing whatever the file contains,
 * which is a test that can only ever pass by accident. The streams have to be
 * inflated first.
 */
const drawnIn = (buffer) => {
  const zlib = require("zlib");
  const raw = buffer.toString("latin1");
  let out = "";
  let at = 0;

  while (true) {
    const start = raw.indexOf("stream", at);
    if (start < 0) break;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;

    // Skip the EOL that follows the `stream` keyword.
    let from = start + "stream".length;
    if (raw[from] === "\r") from += 1;
    if (raw[from] === "\n") from += 1;

    const chunk = Buffer.from(raw.slice(from, end), "latin1");
    try {
      out += zlib.inflateSync(chunk).toString("latin1");
    } catch {
      // Not a compressed stream, or not one we can read — the next one may be.
    }
    at = end + 1;
  }
  return out;
};

async function pdf() {
  section("2. The PDF");

  const buffer = await buildPdfBuffer(report);

  check("a PDF was produced", buffer.length > 1000, `${buffer.length} bytes`);
  check("it is a PDF", buffer.toString("latin1").startsWith("%PDF"));
  const pageCount = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  check(
    "numbering the report does not append a footer-only page",
    pageCount === 1,
    `${pageCount} PDF pages for a one-page report`,
  );

  const drawn = drawnIn(buffer);
  check(
    "its drawing instructions could be read",
    /[\d.]+ [\d.]+ [\d.]+ scn/.test(drawn),
    drawn ? `${drawn.length} bytes of operators` : "nothing inflated",
  );

  /* A fill is written as "r g b scn" — not "rg", and at FULL precision, each
     channel being the byte over 255 printed by JavaScript without rounding.
     Both of those were guessed wrong the first time this was written, and a
     matcher that is wrong about the format reports "not painted" for a file
     that is painted perfectly well. */
  const rgb = (hex) =>
    [1, 3, 5]
      .map((i) => String(parseInt(hex.slice(i, i + 2), 16) / 255))
      .join(" ");

  const painted = (hex) => drawn.includes(`${rgb(hex)} scn`);

  check("the deal row's purple is painted", painted("#f3e8ff"), rgb("#f3e8ff"));
  check("the refund row's red is painted", painted("#fee2e2"), rgb("#fee2e2"));
  check("the credit row's amber is painted", painted("#fef3c7"), rgb("#fef3c7"));

  // And the one that proves the three are told apart rather than all filled
  // with whatever colour happened to be last.
  check(
    "all three appear in the same file",
    ["#f3e8ff", "#fee2e2", "#fef3c7"].every(painted),
  );
}

async function untouchedReports() {
  section("3. A report that sends no kinds is unchanged");

  /* Every other report — inventory, activity, day closing — passes no rowKinds.
   * They must print exactly as they always did, which for the sales-shaped ones
   * still includes the old credit marking read off the Payment column. */
  const buffer = await buildWorkbookBuffer({ ...report, rowKinds: undefined });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  let credit = null;
  let deal = null;
  ws.eachRow((row) => {
    if (String(row.getCell(1).value || "") === "POS-003") credit = row;
    if (String(row.getCell(1).value || "") === "POS-004") deal = row;
  });

  check(
    "credit is still marked from the Payment column",
    credit?.getCell(1)?.fill?.fgColor?.argb === "FFFEF3C7",
    "this is how it worked before rowKinds existed",
  );
  check(
    "and nothing else is invented",
    deal?.getCell(1)?.fill?.fgColor?.argb !== "FFF3E8FF",
    "a deal cannot be known without the receipts, so it must not be guessed",
  );

  // And a report with no rows at all must not throw on the way through.
  const empty = await buildWorkbookBuffer({ ...report, rows: [], rowKinds: [] });
  check("an empty report still builds", empty.length > 1000);
}

(async () => {
  console.log("Report row colours");
  console.log("==================");
  await excel();
  await pdf();
  await untouchedReports();
  console.log(
    failures === 0
      ? "\nAll good — the rows worth noticing are marked."
      : `\n${failures} check(s) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\nverifyReportRowColours failed:", error);
  process.exit(1);
});
