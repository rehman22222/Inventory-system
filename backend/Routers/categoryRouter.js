const express=require("express")
const router=express.Router()
const {createCategory,RemoveCategory,getCategory,updateCategory,Searchcategory}=require('../controller/categorycontroller')
const {authmiddleware,adminOrManager,adminOrSuperadmin}=require('../middleware/Authmiddleware')



// Building the catalogue is the owner side's job.
router.post("/createcategory",authmiddleware,adminOrSuperadmin,createCategory)
router.get("/getcategory",getCategory)
router.get("/searchcategory",authmiddleware,Searchcategory)


// A manager runs the shop day to day, so they can tidy categories up — just not
// invent new ones.
router.delete("/removecategory/:CategoryId",authmiddleware,adminOrManager,RemoveCategory)
router.put("/updateCategory/:CategoryId",authmiddleware,adminOrManager,updateCategory)




module.exports=router
