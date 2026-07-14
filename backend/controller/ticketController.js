const Ticket = require("../models/Ticketmodel");
const { nextSequence } = require("../models/Countermodel");
const logActivity = require("../libs/logger");

const isSuper = (user) => user?.role === "superadmin";

// The ticket's owner, or the vendor, may read and reply to it.
const canSee = (ticket, user) =>
  isSuper(user) || String(ticket.raisedBy) === String(user?._id);

module.exports.createTicket = async (req, res) => {
  try {
    const { subject, message, category, priority } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const seq = await nextSequence("ticket");

    const ticket = await Ticket.create({
      reference: `TKT-${String(seq).padStart(5, "0")}`,
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      raisedBy: req.user._id,
      raisedByName: req.user.name,
      raisedByEmail: req.user.email,
    });

    await logActivity({
      action: "Raise Ticket",
      description: `Ticket ${ticket.reference}: ${ticket.subject}`,
      entity: "system",
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({ message: "Ticket raised", ticket });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not raise ticket" });
  }
};

// An admin sees only their own tickets; the vendor sees every shop's.
module.exports.getTickets = async (req, res) => {
  try {
    const filter = isSuper(req.user) ? {} : { raisedBy: req.user._id };

    if (req.query.status) filter.status = req.query.status;

    const tickets = await Ticket.find(filter).sort({ updatedAt: -1 });

    let counts;

    if (isSuper(req.user)) {
      // One $group instead of four sequential counts.
      const grouped = await Ticket.aggregate([
        { $group: { _id: "$status", total: { $sum: 1 } } },
      ]);

      const by = Object.fromEntries(grouped.map((row) => [row._id, row.total]));

      counts = {
        open: by.open || 0,
        inProgress: by["in-progress"] || 0,
        resolved: by.resolved || 0,
        closed: by.closed || 0,
      };
    }

    return res.status(200).json({ tickets, counts });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching tickets", error: error.message });
  }
};

module.exports.getTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.ticketId);

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!canSee(ticket, req.user)) return res.status(403).json({ message: "Access denied" });

    return res.status(200).json({ ticket });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching ticket", error: error.message });
  }
};

module.exports.replyToTicket = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ message: "A reply cannot be empty" });
    }

    const ticket = await Ticket.findById(req.params.ticketId);

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!canSee(ticket, req.user)) return res.status(403).json({ message: "Access denied" });
    if (ticket.status === "closed") {
      return res.status(400).json({ message: "This ticket is closed" });
    }

    ticket.replies.push({
      by: req.user._id,
      byName: req.user.name,
      byRole: req.user.role,
      message: message.trim(),
    });

    if (isSuper(req.user)) {
      ticket.lastRepliedAt = new Date();
      // A vendor answer moves an untouched ticket into progress.
      if (ticket.status === "open") ticket.status = "in-progress";
    }

    await ticket.save();

    return res.status(200).json({ message: "Reply added", ticket });
  } catch (error) {
    return res.status(500).json({ message: "Could not add reply", error: error.message });
  }
};

// Only the vendor moves a ticket through its lifecycle.
module.exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["open", "in-progress", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Unknown status" });
    }

    const ticket = await Ticket.findById(req.params.ticketId);

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.status = status;
    if (status === "resolved" || status === "closed") ticket.resolvedAt = new Date();

    await ticket.save();

    return res.status(200).json({ message: `Ticket ${status}`, ticket });
  } catch (error) {
    return res.status(500).json({ message: "Could not update ticket", error: error.message });
  }
};
