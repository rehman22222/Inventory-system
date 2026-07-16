const ApprovalRequest = require("../models/ApprovalRequestmodel");
const { nextSequence } = require("../models/Countermodel");
const { createUserRecord, deleteUserRecord } = require("./authcontroller");
const logActivity = require("../libs/logger");

// A short label for the queue, per request type.
const summarise = (type, payload) => {
  if (type === "create_user") {
    return `Create ${payload.role} account for ${payload.name || payload.email}`;
  }
  if (type === "delete_user") {
    return `Delete user ${payload.targetName || payload.userId}`;
  }
  return type;
};

// An admin raises a request for something only the superadmin may do.
module.exports.createRequest = async (req, res) => {
  try {
    const { type, payload = {}, reason } = req.body;

    if (!["create_user", "delete_user"].includes(type)) {
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

    const requests = await ApprovalRequest.find(filter).sort({ createdAt: -1 });
    const pending = await ApprovalRequest.countDocuments({ status: "pending" });

    return res.status(200).json({ requests: requests.map(stripPassword), pending });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching requests", error: error.message });
  }
};

// An admin follows the fate of their own requests.
module.exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ApprovalRequest.find({ requestedBy: req.user._id }).sort({
      createdAt: -1,
    });

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
