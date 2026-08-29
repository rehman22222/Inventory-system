const express = require("express");
const {
  createDeal,
  getDeals,
  updateDeal,
  removeDeal,
} = require("../controller/dealController");
const { authmiddleware, tillUser } = require("../middleware/Authmiddleware");

const router = express.Router();

// Any signed-in cashier reads active deals so the till can detect them.
router.get("/all", authmiddleware, getDeals);

// A deal used to need the owner's approval before it existed. The shop asked
// for it to be made where it is used, so it is made here: whoever is on the
// till builds it and it is live. Every one is logged against its author.
router.post("/create", authmiddleware, tillUser, createDeal);

// Pausing, editing and removing one likewise — being able to stop an offer the
// moment it is wrong matters more than who is standing at the counter.
router.put("/:dealId", authmiddleware, tillUser, updateDeal);
router.delete("/:dealId", authmiddleware, tillUser, removeDeal);

module.exports = router;
