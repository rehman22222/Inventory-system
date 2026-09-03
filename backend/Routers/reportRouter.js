const express = require("express");
const router = express.Router();
const { listReports, downloadReport, previewGhostNet } = require("../controller/reportController");
const { authmiddleware, reportAccess } = require("../middleware/Authmiddleware");

router.get("/", authmiddleware, listReports);
router.get("/ghost-net/preview", authmiddleware, reportAccess, previewGhostNet);
router.get("/:type", authmiddleware, downloadReport);

module.exports = router;
