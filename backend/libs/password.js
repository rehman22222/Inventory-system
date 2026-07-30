const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const rounds = () => {
  const configured = Number(process.env.PASSWORD_BCRYPT_ROUNDS || 12);
  return Number.isInteger(configured) && configured >= 10 && configured <= 15
    ? configured
    : 12;
};

const pepper = () => process.env.PASSWORD_PEPPER || "";
const prepared = (password) =>
  pepper()
    ? crypto
        .createHmac("sha256", pepper())
        .update(String(password), "utf8")
        .digest("base64")
    : String(password);

const hashPassword = (password) => bcrypt.hash(prepared(password), rounds());

const verifyPassword = async (password, storedHash) => {
  if (!storedHash) return { valid: false, needsUpgrade: false };

  if (await bcrypt.compare(prepared(password), storedHash)) {
    return { valid: true, needsUpgrade: bcrypt.getRounds(storedHash) < rounds() };
  }

  if (pepper() && (await bcrypt.compare(String(password), storedHash))) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
};

module.exports = { hashPassword, verifyPassword };
