const express=require("express")
const router=express.Router()
const {Addproduct,quickAddProduct,getTopProductsByQuantity,RemoveProduct,SearchProduct,EditProduct,getProduct,getProductByBarcode,attachBarcode,generateRandomBarcodes}=require('../controller/productController')
const {authmiddleware,adminmiddleware,adminOrManager,adminOrSuperadmin}=require('../middleware/Authmiddleware')
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
router.put("/editproduct/:productId",authmiddleware,adminOrManager,upload.single("image"),EditProduct)
router.get("/getTopProductsByQuantity",authmiddleware,getTopProductsByQuantity)




module.exports=router
