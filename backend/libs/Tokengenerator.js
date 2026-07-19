const jwt = require('jsonwebtoken');

require('dotenv').config();


// Accept either casing of the secret's env name. Some hosts (e.g. Hostinger)
// force env variable names to UPPERCASE, so `SECRETKEY` must work as well as the
// original `SecretKey`.
const jwtSecret = () => process.env.SecretKey || process.env.SECRETKEY;

const generateToken = async (user, res) => {
  try {
    if (!jwtSecret()) {
      throw new Error("Secret key is not defined in the environment variables.");
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      jwtSecret(),
      { expiresIn: '7d' }
    );

    // Never log the JWT itself — anything written to server logs outlives the
    // session and leaks a valid credential.

    const isProduction = process.env.NODE_ENV === "production";

    // Frontend and API are served from the SAME origin in production, so 'Lax'
    // is safe everywhere and blocks the cookie from riding along on cross-site
    // requests (CSRF hardening). 'None' was only needed when the frontend lived
    // on a different domain.
    res.cookie("Inventorymanagmentsystem", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'Lax',
      secure: isProduction,
    });
    

    return token; 
  } catch (error) {
    console.error("Error generating token:", error.message);
    throw new Error("Failed to generate token");
  }
};

module.exports=generateToken;
