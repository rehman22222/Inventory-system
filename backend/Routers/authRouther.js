const express=require("express")
const router=express.Router()
const {signup,login,createUser,updateProfile,logout,staffuser,manageruser,adminuser,removeuser}=require('../controller/authcontroller')
const {authmiddleware,adminmiddleware,managermiddleware}=require('../middleware/Authmiddleware')






router.post("/signup",signup)
router.post("/login",login)

// Creating and deleting accounts is an admin job. /removeuser used to be wide
// open — anyone could delete any user.
router.post("/createuser",authmiddleware,adminmiddleware,createUser)
router.delete("/removeuser/:UserId",authmiddleware,adminmiddleware,removeuser)
router.get("/staffuser",authmiddleware,staffuser)
router.get("/manageruser",authmiddleware,manageruser)
router.get("/adminuser",authmiddleware,adminuser)
router.post("/logout",authmiddleware,logout)
router.put("/updateProfile",authmiddleware,updateProfile)









module.exports=router