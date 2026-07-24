const express=require("express")
const router=express.Router()
const {signup,login,createUser,updateProfile,logout,staffuser,manageruser,adminuser,removeuser}=require('../controller/authcontroller')
const {authmiddleware,adminOrManager,superadminmiddleware}=require('../middleware/Authmiddleware')






router.post("/signup",signup)
router.post("/login",login)

// Only the superadmin creates/deletes accounts directly. Admins raise an
// approval request instead (see /api/approval).
router.post("/createuser",authmiddleware,superadminmiddleware,createUser)
router.delete("/removeuser/:UserId",authmiddleware,superadminmiddleware,removeuser)
router.get("/staffuser",authmiddleware,adminOrManager,staffuser)
router.get("/manageruser",authmiddleware,adminOrManager,manageruser)
router.get("/adminuser",authmiddleware,adminOrManager,adminuser)
router.post("/logout",authmiddleware,logout)
router.put("/updateProfile",authmiddleware,updateProfile)









module.exports=router
