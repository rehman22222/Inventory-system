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

// Only the owner renames the shop.
module.exports.updateStore = async (req, res) => {
  try {
    const { name, addressLines, phone, footer, qrTemplate, currency, timezone } = req.body;

    const store = await loadStore();

    if (name !== undefined) {
      const clean = String(name).trim();
      if (!clean) {
        return res.status(400).json({ message: "Store name is required" });
      }
      store.name = clean;
    }

    if (addressLines !== undefined) {
      // Accept either an array or a textarea's worth of newline-separated lines.
      const lines = Array.isArray(addressLines)
        ? addressLines
        : String(addressLines).split("\n");

      store.addressLines = lines
        .map((line) => String(line).trim())
        .filter(Boolean);
    }

    if (phone !== undefined) store.phone = String(phone).trim();

    if (currency !== undefined) {
      if (!CURRENCIES.includes(currency)) {
        return res
          .status(400)
          .json({ message: `Currency must be one of: ${CURRENCIES.join(", ")}` });
      }
      store.currency = currency;
    }

    if (timezone !== undefined) {
      if (!isValidZone(timezone)) {
        return res.status(400).json({ message: `"${timezone}" is not a recognised timezone` });
      }
      store.timezone = timezone;
    }
    if (footer !== undefined) store.footer = String(footer).trim();
    if (qrTemplate !== undefined) {
      store.qrTemplate = String(qrTemplate).trim() || "{ref}";
    }

    store.updatedBy = req.user?._id;
    await store.save();

    await logActivity({
      action: "Update Store",
      description: `Store details updated — now trading as "${store.name}".`,
      entity: "system",
      entityId: store._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Store details updated", store });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating store details", error: error.message });
  }
};
