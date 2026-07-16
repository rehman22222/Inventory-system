const express = require("express");
const router = express.Router();
const {createSale,getAllSales,SearchSales,getSaleById,updateSale,overrideSalesReportTotal} = require("../controller/salescontroller");
const { authmiddleware, adminmiddleware } = require("../middleware/Authmiddleware");

// These all read or write shop takings, and the list endpoints are scoped to
// the signed-in cashier — so they need an authenticated user to scope by.
router.post("/createsales", authmiddleware, createSale);
router.get("/getallsales", authmiddleware, getAllSales);
router.get("/searchdata", authmiddleware, SearchSales);
router.patch("/override-report-total", authmiddleware, adminmiddleware, overrideSalesReportTotal);
router.get("/:saleId", authmiddleware, getSaleById);
router.put("/updatesales/:saleId", authmiddleware, updateSale);



module.exports = router;
