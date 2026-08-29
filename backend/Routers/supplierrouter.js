const express = require("express");
const router = express.Router();
const {createSupplier,searchSupplier,editSupplier,getAllSuppliers,deleteSupplier,getSupplierById} = require("../controller/suppliercontroller");
const {
  authmiddleware,
  adminOrManager,
} = require("../middleware/Authmiddleware");

// Adding a supplier is ordinary shop admin — the person who orders the stock
// is the person who knows who supplies it, and routing that through the owner
// meant a delivery waiting on an approval queue. Deleting and editing one has
// always been admin/manager; creating one now matches.
router.post("/createsupplier", authmiddleware, adminOrManager, createSupplier);

router.get("/getallsupplier", authmiddleware, adminOrManager, getAllSuppliers);

// This MUST stay above "/:supplierId". Registered after it, Express matched the
// literal word as an id and the search silently became
// getSupplierById("searchSupplier") — it never once ran.
router.get("/searchSupplier", authmiddleware, adminOrManager, searchSupplier);
router.get("/:supplierId", authmiddleware, adminOrManager, getSupplierById);

// Day-to-day tidying stays with admin/manager, same as products and categories.
router.put("/updatesupplier/:supplierId", authmiddleware, adminOrManager, editSupplier);
router.delete("/:supplierId", authmiddleware, adminOrManager, deleteSupplier);

module.exports = router;
