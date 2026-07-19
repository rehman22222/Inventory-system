const mongoose = require("mongoose");
const Supplier = require("../models/Suppliermodel");
const Product = require("../models/Productmodel");

// Accept one id, a list, or nothing — and drop anything that isn't a real id.
const cleanProductIds = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];

  return [
    ...new Set(
      list
        .map((entry) => String(entry?._id || entry || "").trim())
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
};

// The same fact lives in two places: Supplier.productsSupplied and
// Product.supplier. This is what stops them drifting apart.
//
// A product comes from exactly one supplier, so claiming a product here also
// takes it off whoever had it before — otherwise the old supplier would still
// list a product whose `supplier` now points elsewhere.
const syncProducts = async (supplierId, productIds, previousIds = []) => {
  const added = productIds.filter((id) => !previousIds.includes(id));
  const removed = previousIds.filter((id) => !productIds.includes(id));

  if (added.length > 0) {
    // Take them off any other supplier's list first.
    await Supplier.updateMany(
      { _id: { $ne: supplierId }, productsSupplied: { $in: added } },
      { $pull: { productsSupplied: { $in: added } } }
    );
    await Product.updateMany({ _id: { $in: added } }, { $set: { supplier: supplierId } });
  }

  if (removed.length > 0) {
    // Only clear the product's supplier if it still points at us — it may have
    // already been claimed by someone else.
    await Product.updateMany(
      { _id: { $in: removed }, supplier: supplierId },
      { $unset: { supplier: "" } }
    );
  }
};

// Shared creation logic. Both the direct endpoint and the approval executor go
// through here, so a supplier created by approval is identical to one created
// directly. Returns a result rather than touching `res`.
module.exports.createSupplierRecord = async ({ name, contactInfo, productsSupplied }) => {
  // Only the name is mandatory. A supplier you have not yet assigned products
  // to is a perfectly normal thing to want to record.
  if (!name || !String(name).trim()) {
    return { ok: false, status: 400, message: "Supplier name is required." };
  }

  const productIds = cleanProductIds(productsSupplied);

  if (productIds.length > 0) {
    const found = await Product.countDocuments({ _id: { $in: productIds } });
    if (found !== productIds.length) {
      return { ok: false, status: 400, message: "One or more products no longer exist" };
    }
  }

  const newSupplier = new Supplier({
    name: String(name).trim(),
    contactInfo: contactInfo || {},
    productsSupplied: productIds,
  });

  await newSupplier.save();
  await syncProducts(newSupplier._id, productIds);
  await newSupplier.populate("productsSupplied", "name Price barcode");

  return { ok: true, message: "Supplier created successfully", supplier: newSupplier };
};

module.exports.createSupplier = async (req, res) => {
  try {
    const result = await module.exports.createSupplierRecord(req.body);

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    res.status(201).json({
      success: true,
      message: result.message,
      newSupplier: result.supplier,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating supplier", error: error.message });
  }
};


module.exports.getAllSuppliers = async (req, res) => {
  try {
    // .lean(): read-only list — skip document hydration for speed.
    const Suppliers = await Supplier.find()
      .populate("productsSupplied", "name Price barcode")
      .lean();

    res.status(200).json(Suppliers);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching suppliers", error });
  }
};


module.exports.getSupplierById = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const supplier = await Supplier.findById(supplierId).populate("productsSupplied", "name Price barcode");

    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    res.status(200).json({ success: true, supplier });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching supplier", error });
  }
};





module.exports.editSupplier = async (req, res) => {
  const { supplierId } = req.params;
  const { name, contactInfo, productsSupplied } = req.body;

  try {
    if (!mongoose.isValidObjectId(supplierId)) {
      return res.status(400).json({ message: "Invalid supplier id" });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    supplier.name = name?.trim() || supplier.name;
    supplier.contactInfo = {
      phone: contactInfo?.phone ?? supplier.contactInfo?.phone,
      email: contactInfo?.email ?? supplier.contactInfo?.email,
      address: contactInfo?.address ?? supplier.contactInfo?.address,
    };

    // Only touch the product list if the caller actually sent one — otherwise a
    // rename would silently wipe every product off the supplier.
    if (productsSupplied !== undefined) {
      const previousIds = (supplier.productsSupplied || []).map((id) => String(id));
      const productIds = cleanProductIds(productsSupplied);

      if (productIds.length > 0) {
        const found = await Product.countDocuments({ _id: { $in: productIds } });
        if (found !== productIds.length) {
          return res.status(400).json({ message: "One or more products no longer exist" });
        }
      }

      supplier.productsSupplied = productIds;
      await supplier.save();
      await syncProducts(supplier._id, productIds, previousIds);
    } else {
      await supplier.save();
    }

    await supplier.populate("productsSupplied", "name Price barcode");

    res.status(200).json({
      message: "Supplier updated successfully",
      supplier,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating supplier", error: error.message });
  }
};



module.exports.deleteSupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;

    if (!mongoose.isValidObjectId(supplierId)) {
      return res.status(400).json({ success: false, message: "Invalid supplier id" });
    }

    const supplier = await Supplier.findByIdAndDelete(supplierId);

    if (!supplier) {
      return res.status(404).json({ success: false, message: "Supplier not found" });
    }

    // Release the products, or they keep pointing at a supplier that no longer
    // exists and the inventory report shows a blank column instead of "none".
    await Product.updateMany({ supplier: supplier._id }, { $unset: { supplier: "" } });

    res.status(200).json({ success: true, message: "Supplier deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting supplier", error: error.message });
  }
};


module.exports.searchSupplier = async (req, res) => {
  try {
    const { query } = req.query;
    console.log("Received query:", query); 

    if (!query || query.trim() === "") {
      return res.status(400).json({ success: false, message: "Query parameter is required" });
    }

  
    const suppliers = await Supplier.find({
      name: { $regex: new RegExp(query, "i") }, 
    });

    return res.json({ success: true, suppliers });
  } catch (error) {
    console.error("Search Error:", error);
    return res.status(500).json({ success: false, message: "Error fetching supplier", error: error.message });
  }
};


