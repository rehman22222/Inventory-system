// Build a scannable EAN-13 from a sequence number. We use the GS1 "restricted
// distribution" prefix 20, which is reserved for in-store / own-use codes — so
// these will never collide with a real product's manufacturer barcode.
const ean13FromSequence = (seq) => {
  // 12 payload digits: "20" + 10-digit zero-padded sequence, then a check digit.
  const payload = `20${String(seq).padStart(10, "0")}`.slice(0, 12);

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(payload[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;

  return `${payload}${check}`;
};

module.exports = { ean13FromSequence };
