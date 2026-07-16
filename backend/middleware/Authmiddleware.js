
const jwt=require('jsonwebtoken')
const User=require('../models/Usermodel')
require('dotenv').config();

module.exports.authmiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const token = req.cookies.Inventorymanagmentsystem || bearerToken;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided." });
    }

 
    const decodedToken = jwt.verify(token, process.env.SecretKey);

    

    if (!decodedToken || !decodedToken.userId) {
      return res.status(401).json({ message: "Unauthorized: Invalid token." });
    }

   
    const user = await User.findById(decodedToken.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found." });
    }

    
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token." });
  }
};

  module.exports.adminmiddleware=async(req,res,next)=>{
    const user=req.user
    try {
        if(!user){
            return res.status(403).json({ message: "Access denied." });
        }

        if(user.role!=="admin"){
            return res.status(403).json({ message: "Access denied. admin role required." });
        }
        next()
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized: Invalid or expired token." });
    }
    
}



// The owner account. Sits above admin: support inbox, approvals queue and user
// management all live here. Never created through the app.
module.exports.superadminmiddleware = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. Super admin only." });
  }

  next();
};



// The owner side of the shop: admins raise tickets and requests, superadmin
// answers them. Also guards the handed-over day-closing batches — cashiers
// (manager/staff) must not be able to read back what they handed over.
module.exports.adminOrSuperadmin = (req, res, next) => {
  const role = req.user?.role;

  if (role !== "admin" && role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. Admin or super admin only." });
  }

  next();
};



// managermiddleware is a strict role equality check, so an admin fails it.
// Guards for elevated till actions (refund/void) use this. Superadmin sits
// above admin, so it is allowed too.
module.exports.adminOrManager = (req, res, next) => {
  const role = req.user?.role;

  if (!role) {
    return res.status(403).json({ message: "Access denied." });
  }

  if (role !== "superadmin" && role !== "admin" && role !== "manager") {
    return res.status(403).json({ message: "Access denied. Admin or manager role required." });
  }

  next();
};



module.exports.managermiddleware=async(req,res,next)=>{
    const user=req.user
    try {
        if(!user){
            return res.status(403).json({ message: "Access denied." });
        }

        if(user.role!=="manager"){
            return res.status(403).json({ message: "Access denied. manager role required." });
        }
        next()
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized: Invalid or expired token." });
    }
    
}



