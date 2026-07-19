const express = require("express");
const router = express.Router();
const {addOrUpdateInventory,getAllInventory,getInventoryByProduct,deleteInventory}= require("../controller/inventorycontroller");
const { authmiddleware, adminOrSuperadmin } = require("../middleware/Authmiddleware");

// These routes had no auth at all: anyone who knew the URL could rewrite stock
// levels or delete inventory records. Nothing in the app calls them (the till
// and the product pages go through /api/product), so they are locked to the
// owner side — the only people who would ever have a reason to reach for them.
router.post("/inventory", authmiddleware, adminOrSuperadmin, addOrUpdateInventory);
router.get("/inventory", authmiddleware, adminOrSuperadmin, getAllInventory);
router.get("/inventory/:productId", authmiddleware, adminOrSuperadmin, getInventoryByProduct);
router.delete("/inventory/:productId", authmiddleware, adminOrSuperadmin, deleteInventory);

module.exports = router;
