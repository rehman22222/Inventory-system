const idOf = (value) => String(value?._id || value || "");

/* Receipt.deals.items contains the products actually covered by an offer. */
const dealProductsByReceipt = (receipts) => {
  const coverage = new Map();

  for (const receipt of receipts || []) {
    const receiptNo = idOf(receipt?.receiptNo);
    if (!receiptNo) continue;

    const productIds = new Set();
    for (const deal of receipt.deals || []) {
      for (const item of deal.items || []) {
        if (Number(item.quantity || 0) > 0 && idOf(item.product)) {
          productIds.add(idOf(item.product));
        }
      }
    }

    if (productIds.size) coverage.set(receiptNo, productIds);
  }

  return coverage;
};

const saleLineHasDeal = (sale, coverage) => {
  const products = coverage.get(idOf(sale?.receiptNo));
  return Boolean(products?.has(idOf(sale?.products?.product)));
};

module.exports = { dealProductsByReceipt, saleLineHasDeal };
