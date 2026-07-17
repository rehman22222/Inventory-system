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

    console.log("Generated JWT:", token); 

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("Inventorymanagmentsystem", token, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: isProduction ? 'None' : 'Lax',
      secure: isProduction,
    });
    

    return token; 
  } catch (error) {
    console.error("Error generating token:", error.message);
    throw new Error("Failed to generate token");
  }
};

module.exports=generateToken;
