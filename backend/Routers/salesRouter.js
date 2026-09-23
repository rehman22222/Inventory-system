const express = require("express");
const router = express.Router();
const {createSale,getAllSales,SearchSales,getSaleById,updateSale} = require("../controller/salescontroller");
const {
  authmiddleware,
  adminOrSuperadmin,
  salesArchiveAccess,
} = require("../middleware/Authmiddleware");
const {
  previewArchive,
  archiveSales,
  listArchives,
  restoreArchive,
  previewPurge,
  purgeArchive,
} = require("../controller/salesArchiveController");

// Reads are scoped to the signed-in cashier, so any authenticated user may list
// their own. Manually adding or editing a sale, though, is an owner/admin action
// — a manager works the till (POS) and closes the day, but does not hand-edit
// takings.
router.post("/createsales", authmiddleware, adminOrSuperadmin, createSale);
router.get("/getallsales", authmiddleware, getAllSales);
router.get("/searchdata", authmiddleware, SearchSales);

/* Taking sales out of the books, and destroying what has been taken out.
 *
 * The owner and the report account — see salesArchiveAccess, and not
 * adminOrSuperadmin: an admin edits a sale, but retiring a run of them moves
 * revenue on every report the shop has and restates days that were already
 * signed off.
 *
 * The delete is a DELETE on an archive, never on a selection of live sales:
 * rows have to be archived and seen on the archived list before they can be
 * destroyed, so retiring and destroying stay two decisions.
 *
 * Declared ABOVE /:saleId, or "archives" is read as a sale id and the list
 * comes back as "sale not found". */
router.get("/archive/list", authmiddleware, salesArchiveAccess, listArchives);
router.post("/archive/preview", authmiddleware, salesArchiveAccess, previewArchive);
router.post("/archive", authmiddleware, salesArchiveAccess, archiveSales);
router.post("/archive/:batch/restore", authmiddleware, salesArchiveAccess, restoreArchive);
router.get("/archive/:batch/purge/preview", authmiddleware, salesArchiveAccess, previewPurge);
router.delete("/archive/:batch", authmiddleware, salesArchiveAccess, purgeArchive);

router.get("/:saleId", authmiddleware, getSaleById);
router.put("/updatesales/:saleId", authmiddleware, adminOrSuperadmin, updateSale);



module.exports = router;
