const express=require("express")
const router=express.Router()
const {Addproduct,quickAddProduct,getTopProductsByQuantity,RemoveProduct,SearchProduct,EditProduct,getProduct,getProductById,getProductByBarcode,attachBarcode,generateRandomBarcodes,listQuickSell,createQuickSell,removeQuickSell}=require('../controller/productController')
const {authmiddleware,adminmiddleware,adminOrManager,adminOrSuperadmin,tillUser}=require('../middleware/Authmiddleware')
const {upload}=require('../middleware/upload')


// Building the catalogue is the owner side's job.
router.post("/addproduct",authmiddleware,adminOrSuperadmin,upload.single("image"),Addproduct)
// ...but the till must never be blocked by an item the catalogue has not met
// yet, so the scan-to-learn path stays open to every cashier.
router.post("/quick-add",authmiddleware,upload.single("image"),quickAddProduct)
// Generating price-point barcodes is an admin-only tool.
router.post("/generate-random",authmiddleware,adminmiddleware,generateRandomBarcodes)
// A manager keeps the shelves straight: they can edit and remove, not create.
router.delete("/removeproduct/:productId",authmiddleware,adminOrManager,RemoveProduct)
router.get("/getproduct",authmiddleware,getProduct)
router.get("/searchproduct",authmiddleware,SearchProduct)
router.get("/barcode/:code",authmiddleware,getProductByBarcode)
// Linking a scanned barcode to an existing product is part of the till flow.
router.put("/:productId/barcode",authmiddleware,attachBarcode)
// Fixing a price or a count is done where the mistake is found, which is at the
// counter with the item in hand. Open to every till role for that reason; the
// edit is logged against whoever made it.
router.put("/editproduct/:productId",authmiddleware,tillUser,upload.single("image"),EditProduct)
router.get("/getTopProductsByQuantity",authmiddleware,getTopProductsByQuantity)

// The till's quick-sell cards — the shop's own shortcuts for what it cannot
// scan. Made where they are used, like deals and vouchers: a customer holding
// an unbarcoded item at the counter is not a reason to fetch a manager. Every
// card is logged against whoever created or removed it.
//
// These MUST stay above the bare "/:productId" below, or Express reads the
// literal word "quick-sell" as an id — the same trap supplierrouter.js
// documents and productRouter already warns about.
router.get("/quick-sell",authmiddleware,tillUser,listQuickSell)
router.post("/quick-sell",authmiddleware,tillUser,createQuickSell)
router.delete("/quick-sell/:productId",authmiddleware,tillUser,removeQuickSell)

// One whole product, for the till's edit form. Restricted to the same people who
// may actually save the edit, because this is the only product read that returns
// costPrice.
//
// This MUST stay the LAST get route in this file. A bare "/:productId" matches
// any single segment, so registered above the literal paths it would swallow
// "/getproduct", "/searchproduct" and "/getTopProductsByQuantity" and try to
// look each one up as an id — the exact bug supplierrouter.js documents.
router.get("/:productId",authmiddleware,adminOrManager,getProductById)




module.exports=router
