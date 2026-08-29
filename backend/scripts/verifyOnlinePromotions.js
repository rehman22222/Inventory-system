/* Isolated integration proof for web price + voucher + shared stock.
 *
 * Creates a uniquely named temporary database, exercises the real controllers,
 * verifies idempotency and cancellation restoration, then drops only that
 * temporary database.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_online_verify_${Date.now()}`;
const withDatabase = (uri, database) => {
  const queryAt = uri.indexOf("?");
  const base = queryAt === -1 ? uri : uri.slice(0, queryAt);
  const query = queryAt === -1 ? "" : uri.slice(queryAt);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${database}${query}`;
};

const response = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
};

const downloadResponse = () => {
  const result = { statusCode: 200, headers: {}, body: null };
  return {
    result,
    setHeader(name, value) {
      result.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    send(body) {
      result.body = body;
      return this;
    },
  };
};

const request = (body = {}) => ({
  body,
  params: {},
  query: {},
  ip: "127.0.0.1",
  user: null,
  app: { get: () => null },
});

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  process.env.MONGODB_URL = withDatabase(process.env.MONGODB_URL, tempName);
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const OnlineCategory = require("../models/OnlineCategorymodel");
  const OnlineListing = require("../models/OnlineListingmodel");
  const OnlineVoucher = require("../models/OnlineVouchermodel");
  const OnlineOrder = require("../models/OnlineOrdermodel");
  const Sale = require("../models/Salesmodel");
  const controller = require("../controller/onlineStoreController");
  const reportController = require("../controller/reportController");

  const store = await Store.create({ key: "shop", name: "Verification shop", currency: "EUR" });
  const product = await Product.create({
    name: "Shared stock proof",
    Price: 10,
    quantity: 5,
    barcode: `VERIFY-${Date.now()}`,
  });
  const category = await OnlineCategory.create({
    store: store._id,
    name: "Verification",
    slug: "verification",
  });
  const listing = await OnlineListing.create({
    store: store._id,
    product: product._id,
    category: category._id,
    categories: [category._id],
    listed: true,
    slug: "shared-stock-proof",
    webName: "Shared stock proof",
  });
  const voucher = await OnlineVoucher.create({
    store: store._id,
    code: "SAVE10",
    name: "Ten percent",
    discountType: "percentage",
    value: 10,
    usageLimit: 1,
    perCustomerLimit: 1,
    active: true,
  });
  const items = [{ listing: String(listing._id), product: String(product._id), quantity: 2 }];

  const editReq = request({
    category: String(category._id),
    priceOverride: 12,
    salePrice: 9,
    saleStartsAt: new Date(Date.now() - 60_000).toISOString(),
    saleEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
    listed: true,
  });
  editReq.params.id = String(listing._id);
  const editRes = response();
  await controller.updateListing(editReq, editRes);
  const productAfterWebEdit = await Product.findById(product._id).lean();
  if (editRes.result.statusCode !== 200 || productAfterWebEdit.Price !== 10) {
    throw new Error("Online product editor changed or failed to preserve inventory price");
  }

  const previewRes = response();
  await controller.validateStorefrontVoucher(
    request({ code: "save10", email: "buyer@example.com", items }),
    previewRes
  );
  if (previewRes.result.statusCode !== 200 || previewRes.result.body.discount !== 1.8) {
    throw new Error(`Voucher preview failed: ${JSON.stringify(previewRes.result)}`);
  }

  const clientRef = `verify-${Date.now()}`;
  const orderBody = {
    items,
    customer: { name: "Test Buyer", email: "buyer@example.com", phone: "" },
    shippingAddress: {
      line1: "1 Test Street",
      line2: "",
      city: "Dublin",
      region: "",
      postcode: "D01",
      country: "Ireland",
    },
    clientRef,
    voucherCode: "SAVE10",
    paymentMethod: "cash_on_delivery",
  };

  const unsupportedPaymentRes = response();
  await controller.placeOrder(
    request({ ...orderBody, clientRef: `${clientRef}-invalid`, paymentMethod: "card" }),
    unsupportedPaymentRes,
  );
  if (
    unsupportedPaymentRes.result.statusCode !== 400 ||
    (await Product.findById(product._id).lean()).quantity !== 5
  ) {
    throw new Error("Unsupported checkout payment was not rejected before stock changed");
  }

  const orderRes = response();
  await controller.placeOrder(request(orderBody), orderRes);
  if (orderRes.result.statusCode !== 201) {
    throw new Error(`Order failed: ${JSON.stringify(orderRes.result)}`);
  }

  const afterOrder = await Product.findById(product._id).lean();
  const usedVoucher = await OnlineVoucher.findById(voucher._id).lean();
  const order = await OnlineOrder.findById(orderRes.result.body.order._id).lean();
  if (
    afterOrder.quantity !== 3 ||
    afterOrder.Price !== 10 ||
    usedVoucher.usedCount !== 1 ||
    order.subtotal !== 18 ||
    order.discount !== 1.8 ||
    order.total !== 21.19 ||
    order.status !== "processing" ||
    order.payment?.provider !== "cod" ||
    order.payment?.method !== "cash_on_delivery" ||
    order.payment?.status !== "unpaid"
  ) {
    throw new Error("Pick & Pay order totals, state, voucher use or shared stock did not match");
  }

  const retryRes = response();
  await controller.placeOrder(request(orderBody), retryRes);
  const afterRetry = await Product.findById(product._id).lean();
  const afterRetryVoucher = await OnlineVoucher.findById(voucher._id).lean();
  if (
    retryRes.result.statusCode !== 200 ||
    !retryRes.result.body.idempotent ||
    afterRetry.quantity !== 3 ||
    afterRetryVoucher.usedCount !== 1
  ) {
    throw new Error("Idempotent retry changed stock or voucher usage");
  }

  const updateStatus = async (status) => {
    const req = request({ status });
    req.params.id = String(order._id);
    const res = response();
    await controller.updateOrderStatus(req, res);
    if (res.result.statusCode !== 200) {
      throw new Error(`Could not mark Pick & Pay order ${status}: ${JSON.stringify(res.result.body)}`);
    }
  };

  await updateStatus("shipped");
  await updateStatus("delivered");

  const deliveredOrder = await OnlineOrder.findById(order._id).lean();
  const onlineSales = await Sale.find({
    receiptNo: order.orderNo,
    source: "online",
  }).lean();
  if (
    deliveredOrder.status !== "delivered" ||
    deliveredOrder.payment?.status !== "paid" ||
    onlineSales.length !== 1 ||
    onlineSales[0].paymentMethod !== "cash" ||
    onlineSales[0].totalAmount !== order.total ||
    onlineSales[0].discount !== order.discount
  ) {
    throw new Error("Delivered Pick & Pay order was not settled exactly once in the shared Sale ledger");
  }

  const reportReq = request();
  reportReq.params.type = "combined-sales";
  reportReq.query = { format: "csv" };
  reportReq.user = {
    _id: new mongoose.Types.ObjectId(),
    name: "Verification Admin",
    role: "superadmin",
  };
  const reportRes = downloadResponse();
  await reportController.downloadReport(reportReq, reportRes);
  const reportText = Buffer.from(reportRes.result.body || "").toString("utf8");
  if (
    reportRes.result.statusCode !== 200 ||
    !String(reportRes.result.headers["content-disposition"]).includes("combined-sales") ||
    !reportText.includes("Channel") ||
    !reportText.includes("Online store") ||
    !reportText.includes(order.orderNo)
  ) {
    throw new Error("Combined POS + online report did not include the settled online sale");
  }

  await updateStatus("refunded");
  const afterRefund = await Product.findById(product._id).lean();
  const releasedVoucher = await OnlineVoucher.findById(voucher._id).lean();
  const refundedOrder = await OnlineOrder.findById(order._id).lean();
  const refundSales = await Sale.find({
    receiptNo: `RFD-${order.orderNo}`,
    source: "refund",
  }).lean();
  if (
    afterRefund.quantity !== 5 ||
    releasedVoucher.usedCount !== 0 ||
    !refundedOrder.stockRestoredAt ||
    !refundedOrder.voucherReleasedAt ||
    refundedOrder.payment?.status !== "refunded" ||
    refundSales.length !== 1 ||
    refundSales[0].totalAmount !== -order.total
  ) {
    throw new Error("Refund did not reverse revenue, stock and voucher exactly once");
  }

  console.log(
    JSON.stringify({
      ok: true,
      webRegularPrice: 12,
      activeSalePrice: 9,
      inventoryPriceUnchanged: afterRefund.Price,
      orderedQuantity: 2,
      quantityAfterOrder: afterOrder.quantity,
      quantityAfterIdempotentRetry: afterRetry.quantity,
      quantityAfterRefund: afterRefund.quantity,
      voucherDiscount: order.discount,
      voucherUsesAfterRefund: releasedVoucher.usedCount,
      codSettledRevenue: onlineSales[0].totalAmount,
      combinedReportVerified: true,
      refundRevenue: refundSales[0].totalAmount,
    })
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === tempName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });
