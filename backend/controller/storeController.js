const Store = require("../models/Storemodel");
const logActivity = require("../libs/logger");
const { isValidZone } = require("../libs/time");

const CURRENCIES = ["EUR", "GBP", "USD", "AED", "PKR", "INR", "BDT"];

// There is only ever one shop record. Create it on first read rather than
// requiring a seed step, so a fresh install just works.
const loadStore = async () => {
  const existing = await Store.findOne({ key: "shop" });
  if (existing) return existing;

  return Store.create({ key: "shop" });
};

// Read by the till (every role) — it needs the name for the header and the
// receipt.
module.exports.getStore = async (req, res) => {
  try {
    const store = await loadStore();
    return res.status(200).json({ store });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching store details", error: error.message });
  }
};

// Validate + apply a set of changes onto the store document. Shared by the
// direct owner edit and the approved-admin-request path, so both routes agree
// on what's allowed. Returns { ok, message?, status? } and does NOT save.
const applyStoreChanges = (store, changes = {}) => {
  const { name, addressLines, phone, footer, qrTemplate, currency, timezone, notificationsEmail } =
    changes;

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return { ok: false, status: 400, message: "Store name is required" };
    store.name = clean;
  }

  if (addressLines !== undefined) {
    // Accept either an array or a textarea's worth of newline-separated lines.
    const lines = Array.isArray(addressLines) ? addressLines : String(addressLines).split("\n");
    store.addressLines = lines.map((line) => String(line).trim()).filter(Boolean);
  }

  if (phone !== undefined) store.phone = String(phone).trim();

  if (currency !== undefined) {
    if (!CURRENCIES.includes(currency)) {
      return { ok: false, status: 400, message: `Currency must be one of: ${CURRENCIES.join(", ")}` };
    }
    store.currency = currency;
  }

  if (timezone !== undefined) {
    if (!isValidZone(timezone)) {
      return { ok: false, status: 400, message: `"${timezone}" is not a recognised timezone` };
    }
    store.timezone = timezone;
  }

  if (footer !== undefined) store.footer = String(footer).trim();
  if (qrTemplate !== undefined) store.qrTemplate = String(qrTemplate).trim() || "{ref}";

  if (notificationsEmail !== undefined) {
    const clean = String(notificationsEmail).trim();
    if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return { ok: false, status: 400, message: "Notifications email is not a valid email address" };
    }
    store.notificationsEmail = clean;
  }

  return { ok: true };
};

// Apply changes and persist. Used directly by the owner, and by the approval
// engine when a superadmin approves an admin's store-edit request.
const updateStoreRecord = async (changes, actor = {}) => {
  const store = await loadStore();
  const result = applyStoreChanges(store, changes);
  if (!result.ok) return result;

  store.updatedBy = actor._id;
  await store.save();

  await logActivity({
    action: "Update Store",
    description: `Store details updated — now trading as "${store.name}".`,
    entity: "system",
    entityId: store._id,
    userId: actor._id,
    ipAddress: actor.ip,
  });

  return { ok: true, store };
};
module.exports.updateStoreRecord = updateStoreRecord;

// The owner edits the shop directly.
module.exports.updateStore = async (req, res) => {
  try {
    const result = await updateStoreRecord(req.body, { _id: req.user?._id, ip: req.ip });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message });
    }
    return res.status(200).json({ message: "Store details updated", store: result.store });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating store details", error: error.message });
  }
};
