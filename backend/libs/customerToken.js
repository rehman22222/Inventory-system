// Sessions for the shop's CUSTOMERS, kept deliberately apart from staff ones.
//
// Both are JWTs signed with the same server secret, which is safe only because
// they cannot be mistaken for one another:
//
//   staff    — { userId, role }        verified by middleware/Authmiddleware
//   customer — { customerId, typ: "customer" }
//
// A staff token carries no `customerId` and no `typ`, so `verifyCustomerToken`
// below refuses it. A customer token carries no `userId`, so `authmiddleware`
// refuses it — it looks for `decodedToken.userId` and gives up when it is not
// there. The `typ` claim is checked explicitly anyway rather than inferred from
// the absence of a field, because "this is not the other thing" is a weaker
// test than "this is the thing", and the difference between the two is a
// shopper reaching the till.
//
// The lifetimes differ for the same reason. A staff session dies at the shop's
// next midnight, because a till left signed in overnight is a real risk on a
// shared counter. A shopper's phone is their own, and logging somebody out of
// their order history every night to protect a shop they do not work in helps
// nobody.

const jwt = require("jsonwebtoken");
require("dotenv").config();

// Some hosts (Hostinger) force env variable names to uppercase, so both casings
// are accepted — the same rule the staff token generator follows.
const secret = () => process.env.SecretKey || process.env.SECRETKEY;

// 30 days. Long enough that a returning shopper is still signed in, short
// enough that a forgotten session on a borrowed device expires on its own.
const TTL_SECONDS = 30 * 24 * 60 * 60;

const COOKIE_NAME = "cop_customer";

const signCustomerToken = (customer) => {
  if (!secret()) {
    throw new Error("Secret key is not defined in the environment variables.");
  }
  return jwt.sign(
    { customerId: String(customer._id), typ: "customer" },
    secret(),
    { expiresIn: TTL_SECONDS },
  );
};

/**
 * Verify a customer token and return its customer id, or null.
 *
 * Never throws: every caller here is deciding whether somebody is signed in,
 * and "the token is rubbish" and "there is no token" deserve the same answer.
 */
const verifyCustomerToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(String(token), secret());
    if (!decoded || decoded.typ !== "customer" || !decoded.customerId) {
      return null;
    }
    return String(decoded.customerId);
  } catch {
    return null;
  }
};

module.exports = {
  signCustomerToken,
  verifyCustomerToken,
  CUSTOMER_TOKEN_TTL_SECONDS: TTL_SECONDS,
  CUSTOMER_COOKIE_NAME: COOKIE_NAME,
};
