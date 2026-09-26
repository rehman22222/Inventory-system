const express=require("express")
const router=express.Router()
const {signup,login,createUser,updateProfile,logout,me,staffuser,manageruser,adminuser,onlineStoreUser,removeuser}=require('../controller/authcontroller')
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
router.get("/onlinestoreuser",authmiddleware,adminOrManager,onlineStoreUser)
// Who the cookie says this is — the tab-takeover guard asks this.
router.get("/me", authmiddleware, me);
router.post("/logout",authmiddleware,logout)
router.put("/updateProfile",authmiddleware,updateProfile)









module.exports=router
