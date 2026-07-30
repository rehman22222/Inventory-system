const jwt = require('jsonwebtoken');
const Store = require('../models/Storemodel');
const { nextMidnight } = require('./time');

require('dotenv').config();


// Accept either casing of the secret's env name. Some hosts (e.g. Hostinger)
// force env variable names to UPPERCASE, so `SECRETKEY` must work as well as the
// original `SecretKey`.
const jwtSecret = () => process.env.SecretKey || process.env.SECRETKEY;

// The shop's own timezone drives "end of day". Falls back to UTC if the shop
// record or its timezone hasn't been set yet, so a login never fails over this.
const shopTimezone = async () => {
  try {
    const shop = await Store.findOne({ key: "shop" }).select("timezone").lean();
    return shop?.timezone || "UTC";
  } catch {
    return "UTC";
  }
};

const generateToken = async (user, res) => {
  try {
    if (!jwtSecret()) {
      throw new Error("Secret key is not defined in the environment variables.");
    }

    // Every session ends at the close of the business day: the token and its
    // cookie expire at the shop's next local midnight, so all roles (staff,
    // manager, admin, superadmin) are logged out when the day rolls over rather
    // than staying signed in for days on a shared till.
    const tz = await shopTimezone();
    const expiresAt = nextMidnight(tz);
    // Guard the corner case of a login in the last second before midnight: never
    // mint a token that's already expired — give it at least a minute.
    const secondsToMidnight = Math.max(
      1,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      jwtSecret(),
      { expiresIn: secondsToMidnight }
    );

    // Never log the JWT itself — anything written to server logs outlives the
    // session and leaks a valid credential.

    const isProduction = process.env.NODE_ENV === "production";

    // Frontend and API are served from the SAME origin in production, so 'Lax'
    // is safe everywhere and blocks the cookie from riding along on cross-site
    // requests (CSRF hardening). 'None' was only needed when the frontend lived
    // on a different domain.
    res.cookie("Inventorymanagmentsystem", token, {
      maxAge: secondsToMidnight * 1000,
      httpOnly: true,
      sameSite: 'Lax',
      secure: isProduction,
    });

    // The client uses this to log the user out on the dot at midnight even if
    // the tab has been sitting idle (no request to trigger the 401).
    return { token, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error("Error generating token:", error.message);
    throw new Error("Failed to generate token");
  }
};

module.exports=generateToken;
