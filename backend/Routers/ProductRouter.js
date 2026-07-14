const express=require("express")
const router=express.Router()
const {Addproduct,getTopProductsByQuantity,RemoveProduct,SearchProduct,EditProduct,getProduct,getProductByBarcode,attachBarcode}=require('../controller/productController')
const {authmiddleware,adminmiddleware,managermiddleware}=require('../middleware/Authmiddleware')
const {upload}=require('../middleware/upload')


router.post("/addproduct",authmiddleware,upload.single("image"),Addproduct)
router.delete("/removeproduct/:productId",authmiddleware,RemoveProduct)
router.get("/getproduct",authmiddleware,getProduct)
router.get("/searchproduct",authmiddleware,SearchProduct)
router.get("/barcode/:code",authmiddleware,getProductByBarcode)
router.put("/:productId/barcode",authmiddleware,attachBarcode)
router.put("/editproduct/:productId",authmiddleware,upload.single("image"),EditProduct)
router.get("/getTopProductsByQuantity",authmiddleware,getTopProductsByQuantity)




module.exports=router
