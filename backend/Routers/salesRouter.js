const express = require("express");
const router = express.Router();
const {createSale,getAllSales,SearchSales,getSaleById,updateSale} = require("../controller/salescontroller");
const { authmiddleware, adminOrSuperadmin } = require("../middleware/Authmiddleware");

// Reads are scoped to the signed-in cashier, so any authenticated user may list
// their own. Manually adding or editing a sale, though, is an owner/admin action
// — a manager works the till (POS) and closes the day, but does not hand-edit
// takings.
router.post("/createsales", authmiddleware, adminOrSuperadmin, createSale);
router.get("/getallsales", authmiddleware, getAllSales);
router.get("/searchdata", authmiddleware, SearchSales);
router.get("/:saleId", authmiddleware, getSaleById);
router.put("/updatesales/:saleId", authmiddleware, adminOrSuperadmin, updateSale);



module.exports = router;
