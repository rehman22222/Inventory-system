
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

    // Content-only accounts are fenced here, at the single point every
    // protected route passes through. See CONTENT_ROLE_ALLOWLIST below.
    const fenced = contentRoleRefusal(user, req);
    if (fenced) return res.status(403).json(fenced);

    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token." });
  }
};


/* ── The fence around content-only accounts ─────────────────────────────────
 *
 * Most routes in this app are guarded by `authmiddleware` and nothing else —
 * /api/pos/checkout, /api/sales, /api/product, /api/reports, the day closings.
 * That was fine while every account was a shop account: the question those
 * routes ask is "is somebody signed in", and everybody signed in worked here.
 *
 * The "seo" role broke that assumption. It is given to an outside agency to
 * write blog articles, and it must not be able to ring up a sale or read the
 * shop's takings — but it IS a signed-in user, so every one of those bare
 * routes would have let it straight through.
 *
 * Rather than add a role check to forty routes and hope nobody forgets on the
 * forty-first, the fence is deny-by-default and lives here, at the one place
 * every protected request already stops. A content account may reach exactly
 * the paths named below; anything else — including any route added later — is
 * refused. New capability for these accounts is a deliberate edit to this
 * list, never an accident of where a route happened to be mounted.
 *
 * This does not replace the per-route role guards; it sits under them.
 * ------------------------------------------------------------------------ */

// Roles whose reach is defined by an allowlist instead of by role guards.
const CONTENT_ONLY_ROLES = new Set(["seo", "seo_store"]);

const CONTENT_ROLE_ALLOWLIST = [
  // The blog itself — list, create, edit, delete, and images for articles.
  /^\/api\/online\/blog(\/|$|\?)/,
  // The website specialist may manage the complete Online Store console.
  /^\/api\/online(\/|$|\?)/,
  // Online Store's offer builder uses the shared deal endpoints.
  /^\/api\/deal(\/|$|\?)/,
  // Signing in and out, and their own name, password and avatar.
  /^\/api\/auth\/(logout|updateProfile|checkauth|me)(\/|$|\?)/,
];

/**
 * Decide whether this request is one a content-only account may make.
 *
 * @returns {object|null} a JSON body to refuse with, or null to allow
 */
const contentRoleRefusal = (user, req) => {
  if (!CONTENT_ONLY_ROLES.has(user?.role)) return null;

  // originalUrl is the whole path as it arrived, including the router's mount
  // point — req.path inside a mounted router is relative to that mount and
  // would make every rule here silently match nothing.
  const path = String(req.originalUrl || req.url || "").split("?")[0];

  if (CONTENT_ROLE_ALLOWLIST.some((allowed) => allowed.test(path))) return null;

  return {
    message:
      "This account can only manage blog content. Ask an administrator if you need anything else.",
    contentOnly: true,
  };
};

module.exports.CONTENT_ONLY_ROLES = CONTENT_ONLY_ROLES;

/* Who may write the blog: the shop's own admins, plus the content accounts the
 * shop hands out for exactly this. Used by the blog router; the fence above
 * still applies on top of it. */
module.exports.blogEditorAccess = (req, res, next) => {
  const role = req.user?.role;

  if (role === "superadmin" || role === "admin" || CONTENT_ONLY_ROLES.has(role)) {
    return next();
  }

  return res
    .status(403)
    .json({ message: "Access denied. Blog editor access required." });
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

/* Retiring sales from the books, and destroying what has been retired.
 *
 * The owner, plus the report account. The report account is the unfiltered
 * view of the ledger — it already sees every sale every cashier ever rang,
 * including handed-over days — and it is the view a till is set up and proved
 * from before it goes live. The takings from that proving are not trade, and
 * clearing them out belongs with the account that can see all of them at once.
 *
 * Deliberately NOT adminOrSuperadmin: an admin edits a sale, but retiring a
 * run of them moves revenue on every report the shop has.
 */
module.exports.salesArchiveAccess = (req, res, next) => {
  const role = req.user?.role;

  if (role !== "superadmin" && role !== "report") {
    return res
      .status(403)
      .json({ message: "Access denied. Super admin or report account only." });
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

  if (role !== "admin" && role !== "superadmin" && role !== "seo_store") {
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

  // ...with one exception. "Somebody is signed in" stopped meaning "somebody
  // who works here" when content-only accounts arrived. The fence in
  // authmiddleware already refuses these accounts every till path; this is the
  // same answer given a second time, so that a route which somehow reaches
  // tillUser without the fence still cannot be worked by an outside agency.
  // The website specialist may use the shared deal endpoints because the
  // Online Store offer builder lives there, but still cannot use any till path.
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  if (req.user.role === "seo_store" && /^\/api\/deal(\/|$)/.test(path)) {
    return next();
  }

  if (CONTENT_ONLY_ROLES.has(req.user.role)) {
    return res
      .status(403)
      .json({ message: "Access denied. This account can only manage blog content." });
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


/* ── Website customers ──────────────────────────────────────────────────────
 * Everything above this line guards the shop's own people. These two guard a
 * SHOPPER, who is a different kind of thing entirely: they have no role, they
 * reach us through the storefront's server (which has already presented the
 * shared storefront key), and they may only ever see their own records.
 *
 * The token rides in `x-customer-token`, not in a cookie. The storefront holds
 * the cookie — httpOnly, on its own domain — and passes the value through on
 * the server side, so a shopper's browser never talks to this API directly and
 * the token never reaches a script on either domain.
 * ------------------------------------------------------------------------- */

const { verifyCustomerToken } = require("../libs/customerToken");
const OnlineCustomer = require("../models/OnlineCustomermodel");

const resolveCustomer = async (req) => {
  const header = req.headers["x-customer-token"];
  const bearer = (req.headers.authorization || "").startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const customerId = verifyCustomerToken(header || bearer);
  if (!customerId) return null;

  const customer = await OnlineCustomer.findById(customerId);
  // A blocked account is refused here rather than at each route, so blocking
  // somebody takes effect on their very next request without anybody having to
  // remember to check for it again.
  if (!customer || customer.status !== "active") return null;

  return customer;
};

// The shopper must be signed in. Used by everything under /account.
module.exports.customerAuth = async (req, res, next) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res
        .status(401)
        .json({ message: "Please sign in to your account.", signedOut: true });
    }
    req.customer = customer;
    return next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Please sign in to your account.", signedOut: true });
  }
};

// The shopper MAY be signed in. Used at checkout, where an account earns points
// and prefills an address but is never required to buy — an expired token must
// hand somebody a guest checkout, not an error page with a full basket behind
// it.
module.exports.optionalCustomerAuth = async (req, _res, next) => {
  try {
    req.customer = await resolveCustomer(req);
  } catch {
    req.customer = null;
  }
  return next();
};
