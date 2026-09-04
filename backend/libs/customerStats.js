// The order counters cached on a customer record, recomputed from the orders
// themselves.
//
// It lives in its own file because BOTH online controllers need it — the store
// controller when an order changes status, the customer controller when a
// guest's past orders are claimed by a new account — and having either one
// require the other would put a cycle between two 4,000-line modules for the
// sake of a single aggregation.
//
// Recomputed rather than incremented. An order can move in both directions
// (delivered, then refunded a week later), and a counter that is nudged up and
// down by every transition is a counter that drifts. This is one indexed
// aggregation over one customer's orders, run only at the few moments the
// answer can actually have changed.

const mongoose = require("mongoose");
const OnlineOrder = require("../models/OnlineOrdermodel");
const OnlineCustomer = require("../models/OnlineCustomermodel");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const refreshOrderStats = async (customerId) => {
  if (!customerId || !mongoose.isValidObjectId(String(customerId))) return null;

  const [row] = await OnlineOrder.aggregate([
    {
      $match: {
        "customer.account": new mongoose.Types.ObjectId(String(customerId)),
        // What the shop would call a customer's real trade. An order that was
        // cancelled, refunded or never paid for is not spend, and counting it
        // would make a "top customers" list out of people who changed their
        // minds.
        status: { $nin: ["cancelled", "refunded", "pending_payment"] },
      },
    },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        spend: { $sum: "$total" },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);

  const stats = {
    orders: Number(row?.orders || 0),
    spend: money(row?.spend || 0),
    lastOrderAt: row?.lastOrderAt || null,
  };

  await OnlineCustomer.updateOne({ _id: customerId }, { $set: { stats } });
  return stats;
};

module.exports = { refreshOrderStats };
