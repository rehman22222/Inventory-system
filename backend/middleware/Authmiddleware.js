
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

 
    // Accept either casing of the secret's env name — some hosts (Hostinger)
    // force env variable names to UPPERCASE.
    const decodedToken = jwt.verify(token, process.env.SecretKey || process.env.SECRETKEY);

    

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

module.exports.reportAccess = (req, res, next) => {
  if (req.user?.role !== "report") {
    return res.status(403).json({ message: "Access denied. Report account only." });
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



// The audit trail records what everyone did, including the admin, so it is not
// theirs to browse at will. The superadmin sees it always; anyone else needs an
// approved, time-limited grant (Usermodel.logAccessUntil).
module.exports.activityLogAccess = (req, res, next) => {
  if (req.user?.role === "superadmin") return next();

  const until = req.user?.logAccessUntil;

  if (until && new Date(until).getTime() > Date.now()) {
    return next();
  }

  return res.status(403).json({
    message: until
      ? "Your access to the activity log has expired — request it again"
      : "Ask the super admin for access to the activity log",
    // The page reads this to offer the request button rather than a dead end.
    needsApproval: "view_activity_logs",
    expired: Boolean(until),
  });
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



// One till for everyone. The shop asked for a POS that behaves the same at
// every role — staff, manager, admin, superadmin all get the same buttons — so
// the routes behind those buttons ask only that somebody is signed in.
//
// What makes that safe is not the guard, it is the record: every refund, void,
// deal and price edit is written against the person who did it and shows up in
// the activity log and the day's takings. If the shop ever wants a till that
// asks permission again, this is the one place to tighten.
module.exports.tillUser = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "Access denied." });
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



