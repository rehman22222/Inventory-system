const express = require("express");
const router = express.Router();
const {createSupplier,searchSupplier,editSupplier,getAllSuppliers,deleteSupplier,getSupplierById} = require("../controller/suppliercontroller");
const {
  authmiddleware,
  adminOrManager,
  superadminmiddleware,
} = require("../middleware/Authmiddleware");

// Adding a supplier is the owner's call. An admin raises an approval request
// (type: create_supplier); the superadmin's approval is what creates it.
router.post("/createsupplier", authmiddleware, superadminmiddleware, createSupplier);

router.get("/getallsupplier", authmiddleware, getAllSuppliers);

// This MUST stay above "/:supplierId". Registered after it, Express matched the
// literal word as an id and the search silently became
// getSupplierById("searchSupplier") — it never once ran.
router.get("/searchSupplier", authmiddleware, searchSupplier);
router.get("/:supplierId", authmiddleware, getSupplierById);

// Day-to-day tidying stays with admin/manager, same as products and categories.
router.put("/updatesupplier/:supplierId", authmiddleware, adminOrManager, editSupplier);
router.delete("/:supplierId", authmiddleware, adminOrManager, deleteSupplier);

module.exports = router;
