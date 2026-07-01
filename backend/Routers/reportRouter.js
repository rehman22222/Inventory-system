const express = require("express");
const router = express.Router();
const { listReports, downloadReport } = require("../controller/reportController");
const { authmiddleware } = require("../middleware/Authmiddleware");

router.get("/", authmiddleware, listReports);
router.get("/:type", authmiddleware, downloadReport);

module.exports = router;
