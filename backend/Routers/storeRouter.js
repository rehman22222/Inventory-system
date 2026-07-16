const express = require("express");
const { getStore, updateStore } = require("../controller/storeController");
const { authmiddleware, superadminmiddleware } = require("../middleware/Authmiddleware");

const router = express.Router();

// Every till needs the shop name for its header and receipts.
router.get("/", authmiddleware, getStore);

// Renaming the shop is the owner's call.
router.put("/", authmiddleware, superadminmiddleware, updateStore);

module.exports = router;
