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
 * "card" is the card terminal (stored as "creditcard"). Split remains its
 * own filter; its component amounts are derived from the receipt for both
 * the sales list and downloads by salePayments.
 */

const ProductModel = require("../models/Productmodel");
const Receipt = require("../models/Receiptmodel");
const { startOfDay, endOfDay } = require("./time");

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const PAYMENT_FILTERS = {
  cash: { methods: ["cash"], label: "Cash" },
  card: { methods: ["creditcard"], label: "Card" },
  wallet: { methods: ["wallet"], label: "Wallet (Apple / Google Pay)" },
  split: { methods: ["split"], label: "Split payments" },
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
    const clauses = [{ paymentMethod: { $in: payment.methods } }];
    // A split receipt belongs to every tender actually used on it. This keeps
    // Cash + Card equal to the Cash and Card views added together, while the
    // dedicated Split filter still returns split receipts only.
    if (["cash", "card", "credit", "wallet"].includes(String(query.payment).toLowerCase())) {
      const splitReceiptNos = await Receipt.distinct("receiptNo", {
        paymentMethod: "split",
        "payments.method": { $in: payment.methods },
      });
      if (splitReceiptNos.length) clauses.push({ paymentMethod: "split", receiptNo: { $in: splitReceiptNos } });
    }
    filter.$and = [{ $or: clauses }];
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
    const textClause = { $or: [
      { receiptNo: like },
      { customerName: like },
      ...(named.length ? [{ "products.product": { $in: named.map((row) => row._id) } }] : []),
    ] };
    if (filter.$and) filter.$and.push(textClause);
    else Object.assign(filter, textClause);
    labels.push(`Search: "${text}"`);
  }

  return { filter, labels };
}

module.exports = { salesFilter, PAYMENT_FILTERS };
