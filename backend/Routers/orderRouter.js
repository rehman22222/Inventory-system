const express = require("express");
const router = express.Router();
const {
  createOrder,
  sendOrder,
  previewOrderEmail,
  receiveOrder,
  searchOrder,
  updatestatusOrder,
  getOrder,
  getOrderStatistics,
  Removeorder,
} = require("../controller/orderController");
const {
  authmiddleware,
  adminOrManager,
} = require("../middleware/Authmiddleware");

router.use(authmiddleware, adminOrManager);
router.post("/createorder", createOrder);
// What the supplier will read, before anybody sends it. Read-only.
router.get("/preview/:OrderId", previewOrderEmail);
router.post("/sendorder/:OrderId", sendOrder);
router.post("/receive/:OrderId", receiveOrder);
router.get("/getorders", getOrder);
router.delete("/removeorder/:OrdertId", Removeorder);
router.put("/updatestatusOrder/:OrderId", updatestatusOrder);
router.get("/Searchdata", searchOrder);
router.get("/graphstatusorder", getOrderStatistics);


module.exports = router;
