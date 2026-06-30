const express = require("express");
const { checkout } = require("../controller/posController");
const { authmiddleware } = require("../middleware/Authmiddleware");

const router = express.Router();

router.post("/checkout", authmiddleware, checkout);

module.exports = router;
