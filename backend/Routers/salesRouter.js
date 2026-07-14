const express = require("express");
const router = express.Router();
const {createSale,getAllSales,SearchSales,getSaleById,updateSale,overrideSalesReportTotal} = require("../controller/salescontroller");
const { authmiddleware, adminmiddleware } = require("../middleware/Authmiddleware");

router.post("/createsales", createSale);
router.get("/getallsales", getAllSales); 
router.get("/searchdata", SearchSales); 
router.patch("/override-report-total", authmiddleware, adminmiddleware, overrideSalesReportTotal);
router.get("/:saleId", getSaleById);
router.put("/updatesales/:saleId",updateSale); 



module.exports = router;
