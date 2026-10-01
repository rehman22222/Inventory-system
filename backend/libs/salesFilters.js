/* One definition of "which sales" for the sales screen and its downloads.
 *
 * The sales page lets the shop narrow the ledger by what was sold (a product
 * or flavour name, a receipt number, a customer), by how it was paid, and by
 * date. The list on screen and the report downloaded beside it must apply
 * exactly the same narrowing — a report that disagrees with the screen it was
 * taken from is worse than no filter at all — so both build it here.
 *
 *   ?q=        product / flavour name, receipt number or customer (any match)
 *   ?payment=  cash | card | wallet | split | credit   (absent = every tender)
 *   ?from= / ?to=   YYYY-MM-DD, inclusive, in the shop's own timezone
 *
 * "card" is the card terminal (stored as "creditcard"). A split receipt — part
 * cash, part card — is its own option rather than being counted under both,
 * because each of its rows records one total, not how it was divided.
 */

const ProductModel = require("../models/Productmodel");
const { startOfDay, endOfDay } = require("./time");

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const PAYMENT_FILTERS = {
  cash: { methods: ["cash"], label: "Cash" },
  card: { methods: ["creditcard"], label: "Card" },
  wallet: { methods: ["wallet"], label: "Wallet (Apple / Google Pay)" },
  split: { methods: ["split"], label: "Split (cash + card)" },
  credit: { methods: ["credit"], label: "Store credit" },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {object} query  req.query (q, payment, from, to)
 * @param {string} tz     the shop's IANA timezone
 * @returns {Promise<{ filter: object, labels: string[] }>}
 *   filter — to be merged into a Sale.find() alongside the caller's own scope
 *   labels — human-readable description of what was applied, for report titles
 */
async function salesFilter(query = {}, tz = "Europe/Dublin") {
  const filter = {};
  const labels = [];

  const payment = PAYMENT_FILTERS[String(query.payment || "").toLowerCase()];
  if (payment) {
    filter.paymentMethod = { $in: payment.methods };
    labels.push(`Payment: ${payment.label}`);
  }

  const from = DATE.test(String(query.from || "")) ? query.from : "";
  const to = DATE.test(String(query.to || "")) ? query.to : "";
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = startOfDay(from, tz);
    if (to) filter.createdAt.$lte = endOfDay(to, tz);
  }

  const text = String(query.q || query.query || "").trim().slice(0, 100);
  if (text) {
    // Escaped: a flavour with a bracket in its name is a search, not a regex.
    const like = { $regex: text.replace(REGEX_SPECIALS, "\\$&"), $options: "i" };
    // The name lives on the Product, so the matching products are found first
    // and the sales matched on their ids.
    const named = await ProductModel.find({ name: like }).select("_id").lean();
    filter.$or = [
      { receiptNo: like },
      { customerName: like },
      ...(named.length ? [{ "products.product": { $in: named.map((row) => row._id) } }] : []),
    ];
    labels.push(`Search: "${text}"`);
  }

  return { filter, labels };
}

module.exports = { salesFilter, PAYMENT_FILTERS };
