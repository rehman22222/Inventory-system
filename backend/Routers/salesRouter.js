const express = require("express");
const router = express.Router();
const {createSale,getAllSales,SearchSales,getSaleById,updateSale} = require("../controller/salescontroller");
const { authmiddleware, adminOrSuperadmin, superadminmiddleware } = require("../middleware/Authmiddleware");
const {
  previewArchive,
  archiveSales,
  listArchives,
  restoreArchive,
} = require("../controller/salesArchiveController");

// Reads are scoped to the signed-in cashier, so any authenticated user may list
// their own. Manually adding or editing a sale, though, is an owner/admin action
// — a manager works the till (POS) and closes the day, but does not hand-edit
// takings.
router.post("/createsales", authmiddleware, adminOrSuperadmin, createSale);
router.get("/getallsales", authmiddleware, getAllSales);
router.get("/searchdata", authmiddleware, SearchSales);

/* Taking sales out of the books. Superadmin only, and not by way of
 * adminOrSuperadmin: an admin edits a sale, but retiring a run of them moves
 * revenue on every report the shop has and restates days that were already
 * signed off. That is the owner's call.
 *
 * Declared ABOVE /:saleId, or "archives" is read as a sale id and the list
 * comes back as "sale not found". */
router.get("/archive/list", authmiddleware, superadminmiddleware, listArchives);
router.post("/archive/preview", authmiddleware, superadminmiddleware, previewArchive);
router.post("/archive", authmiddleware, superadminmiddleware, archiveSales);
router.post("/archive/:batch/restore", authmiddleware, superadminmiddleware, restoreArchive);

router.get("/:saleId", authmiddleware, getSaleById);
router.put("/updatesales/:saleId", authmiddleware, adminOrSuperadmin, updateSale);



module.exports = router;
