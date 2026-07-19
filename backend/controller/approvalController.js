const ApprovalRequest = require("../models/ApprovalRequestmodel");
const User = require("../models/Usermodel");
const Store = require("../models/Storemodel");
const { startOfDay, endOfDay } = require("../libs/time");
const { nextSequence } = require("../models/Countermodel");
const { createUserRecord, deleteUserRecord } = require("./authcontroller");
const { createSupplierRecord } = require("./suppliercontroller");
const { createDealRecord } = require("./dealController");
const { updateStoreRecord } = require("./storeController");
const logActivity = require("../libs/logger");

// How long an approved look at the audit trail lasts. It is a grant, not a
// permanent right — the admin asks again next time.
const ACTIVITY_LOG_GRANT_HOURS = 24;

const REQUEST_TYPES = [
  "create_user",
  "delete_user",
  "create_supplier",
  "create_deal",
  "view_activity_logs",
  "edit_store",
];

// A short label for the queue, per request type.
const summarise = (type, payload) => {
  if (type === "create_user") {
    return `Create ${payload.role} account for ${payload.name || payload.email}`;
  }
  if (type === "delete_user") {
    return `Delete user ${payload.targetName || payload.userId}`;
  }
  if (type === "create_supplier") {
    const count = (payload.productsSupplied || []).length;
    return `Add supplier "${payload.name}"${count ? ` — ${count} product(s)` : ""}`;
  }
  if (type === "create_deal") {
    const off =
      payload.discountType === "percent" ? `${payload.discount}%` : payload.discount;
    return `Create deal "${payload.name}" — ${off} off`;
  }
  if (type === "view_activity_logs") {
    const window =
      payload.from && payload.to ? ` (${payload.from} → ${payload.to})` : "";
    return `View the activity log${window} for ${ACTIVITY_LOG_GRANT_HOURS} hours`;
  }
  if (type === "edit_store") {
    return payload.name ? `Update store details (rename to "${payload.name}")` : "Update store details";
  }
  return type;
};

// A YYYY-MM-DD string, or null.
const isDateString = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());

// An admin raises a request for something only the superadmin may do.
module.exports.createRequest = async (req, res) => {
  try {
    const { type, payload = {}, reason } = req.body;

    if (!REQUEST_TYPES.includes(type)) {
      return res.status(400).json({ message: "Unknown request type" });
    }

    // Validate enough up front that the superadmin isn't approving junk. Admins
    // may only ever request manager/staff accounts.
    if (type === "create_user") {
      if (!payload.name?.trim() || !payload.email?.trim() || !payload.password) {
        return res.status(400).json({ message: "Name, email and password are required" });
      }
      if (payload.role !== "manager" && payload.role !== "staff") {
        return res.status(400).json({ message: "You can only request manager or staff accounts" });
      }
      if (String(payload.password).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
    }

    if (type === "delete_user" && !payload.userId) {
      return res.status(400).json({ message: "Which user to delete is required" });
    }

    if (type === "create_supplier" && !payload.name?.trim()) {
      return res.status(400).json({ message: "Supplier name is required" });
    }

    if (type === "edit_store") {
      // A rename can't be to nothing; other fields are optional.
      if (payload.name !== undefined && !String(payload.name).trim()) {
        return res.status(400).json({ message: "Store name cannot be empty" });
      }
      // One pending store-edit at a time, so the queue doesn't fill with drafts.
      const already = await ApprovalRequest.findOne({
        type: "edit_store",
        requestedBy: req.user._id,
        status: "pending",
      });
      if (already) {
        return res
          .status(400)
          .json({ message: `Request ${already.reference} is already waiting for approval` });
      }
    }

    if (type === "create_deal") {
      if (!payload.name?.trim()) {
        return res.status(400).json({ message: "Deal name is required" });
      }
      if (!Number(payload.discount) || Number(payload.discount) <= 0) {
        return res.status(400).json({ message: "Deal discount must be greater than zero" });
      }
      if ((payload.items || []).length < 2) {
        return res.status(400).json({ message: "Pick at least two products for the deal" });
      }
    }

    if (type === "view_activity_logs") {
      // The admin asks for a specific window, not open-ended access.
      if (!isDateString(payload.from) || !isDateString(payload.to)) {
        return res
          .status(400)
          .json({ message: "Choose the date range you need (from and to)" });
      }
      if (new Date(payload.from).getTime() > new Date(payload.to).getTime()) {
        return res.status(400).json({ message: "The 'from' date must be on or before the 'to' date" });
      }

      // Asking again while you already have it would just queue noise for the
      // superadmin.
      const me = await User.findById(req.user._id).select("logAccessUntil");
      if (me?.logAccessUntil && me.logAccessUntil.getTime() > Date.now()) {
        return res.status(400).json({
          message: "You already have access to the activity log",
          until: me.logAccessUntil,
        });
      }

      const already = await ApprovalRequest.findOne({
        type: "view_activity_logs",
        requestedBy: req.user._id,
        status: "pending",
      });
      if (already) {
        return res
          .status(400)
          .json({ message: `Request ${already.reference} is already waiting for approval` });
      }
    }

    const seq = await nextSequence("approval");

    const request = await ApprovalRequest.create({
      reference: `REQ-${String(seq).padStart(5, "0")}`,
      type,
      summary: summarise(type, payload),
      payload,
      reason,
      requestedBy: req.user._id,
      requestedByName: req.user.name,
    });

    await logActivity({
      action: "Raise Approval Request",
      description: `${request.reference}: ${request.summary}`,
      entity: "user",
      userId: req.user._id,
      ipAddress: req.ip,
    });

    // Never send the password back out.
    const safe = request.toObject();
    if (safe.payload) delete safe.payload.password;

    return res.status(201).json({ message: "Request submitted for approval", request: safe });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not submit request" });
  }
};

const stripPassword = (request) => {
  const safe = request.toObject ? request.toObject() : request;
  if (safe.payload) delete safe.payload.password;
  return safe;
};

// Superadmin's queue: every request, newest first, plus pending counts.
module.exports.getRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // The queue is never pruned, so cap the history. The pending count below is
    // a separate countDocuments, so the badge stays exact even if the list is
    // capped. (stripPassword handles plain objects, so .lean() is safe.)
    const requests = await ApprovalRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const pending = await ApprovalRequest.countDocuments({ status: "pending" });

    return res.status(200).json({ requests: requests.map(stripPassword), pending });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching requests", error: error.message });
  }
};

// An admin follows the fate of their own requests.
module.exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ApprovalRequest.find({ requestedBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({ requests: requests.map(stripPassword) });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching requests", error: error.message });
  }
};

// Approving runs the requested action, with the superadmin as the actor.
module.exports.approveRequest = async (req, res) => {
  try {
    const request = await ApprovalRequest.findById(req.params.requestId);

    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `This request is already ${request.status}` });
    }

    const actor = { _id: req.user._id, ip: req.ip };
    let result;

    if (request.type === "create_user") {
      result = await createUserRecord(request.payload, ["manager", "staff"], actor);
    } else if (request.type === "delete_user") {
      result = await deleteUserRecord(request.payload.userId, actor);
    } else if (request.type === "create_supplier") {
      result = await createSupplierRecord(request.payload);
      if (result.ok) result.user = result.supplier;
    } else if (request.type === "create_deal") {
      // Credited to whoever asked for it, not to whoever approved.
      result = await createDealRecord(request.payload, {
        _id: request.requestedBy,
        ip: req.ip,
      });
      if (result.ok) result.user = result.deal;
    } else if (request.type === "edit_store") {
      const applied = await updateStoreRecord(request.payload, { _id: req.user._id, ip: req.ip });
      result = applied.ok
        ? { ok: true, message: "Store details updated", user: applied.store }
        : { ok: false, status: applied.status || 400, message: applied.message };
    } else if (request.type === "view_activity_logs") {
      // Nothing to "create" — this opens the audit trail to the requester for a
      // while. The grant expiry (`until`) is measured from approval so the clock
      // starts when access does; the window (`from`/`to`) is exactly what they
      // asked for and bounds what they can see inside it.
      const until = new Date(Date.now() + ACTIVITY_LOG_GRANT_HOURS * 60 * 60 * 1000);
      // The admin picked calendar days; interpret them in the shop's timezone so
      // the window covers the trading days they meant, not UTC days.
      const shop = await Store.findOne({ key: "shop" }).select("timezone").lean();
      const tz = shop?.timezone || "UTC";
      const from = startOfDay(request.payload.from, tz);
      const to = endOfDay(request.payload.to, tz);

      const granted = await User.findByIdAndUpdate(
        request.requestedBy,
        { $set: { logAccessUntil: until, logAccessFrom: from, logAccessTo: to } },
        { new: true }
      );

      result = granted
        ? {
            ok: true,
            message: `Activity log open for ${request.payload.from} → ${request.payload.to}, until ${until.toLocaleString()}`,
            user: granted,
          }
        : { ok: false, status: 404, message: "The requesting user no longer exists" };
    } else {
      result = { ok: false, status: 400, message: "Unknown request type" };
    }

    request.decidedBy = req.user._id;
    request.decidedByName = req.user.name;
    request.decidedAt = new Date();

    if (!result.ok) {
      // The action couldn't run (e.g. duplicate email). Leave it visible as
      // failed rather than silently approved.
      request.status = "failed";
      request.resultNote = result.message;
      if (request.payload) request.payload.password = undefined;
      await request.save();
      return res.status(result.status).json({ message: result.message, request: stripPassword(request) });
    }

    request.status = "approved";
    request.resultRef = result.user?._id;
    request.resultNote = result.message;
    // The action has run; the password no longer needs to sit in the DB.
    if (request.payload) request.payload.password = undefined;
    await request.save();

    await logActivity({
      action: "Approve Request",
      description: `${request.reference} approved: ${request.summary}`,
      entity: "user",
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Request approved", request: stripPassword(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not approve request" });
  }
};

module.exports.rejectRequest = async (req, res) => {
  try {
    const request = await ApprovalRequest.findById(req.params.requestId);

    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `This request is already ${request.status}` });
    }

    request.status = "rejected";
    request.decidedBy = req.user._id;
    request.decidedByName = req.user.name;
    request.decidedAt = new Date();
    request.decisionNote = req.body?.note;
    // A rejected request never runs, so drop the stored password.
    if (request.payload) request.payload.password = undefined;
    await request.save();

    return res.status(200).json({ message: "Request rejected", request: stripPassword(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not reject request" });
  }
};
