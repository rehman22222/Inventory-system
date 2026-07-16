// Fallback shop details.
//
// The real values now live in the database and are edited from Super Admin →
// Store, so renaming the shop no longer needs a code change and a redeploy.
// These are used only before the first fetch lands, or on a till that has never
// reached the server.
const SHOP = {
  name: "Candy Cloud",
  addressLines: ["10 Abbeygate Street", "Lower, H91 KV7K"],
  // Shown under the total; e.g. a loyalty URL or "Thank you" note.
  footer: "Thank you for shopping with us",
  // Anything the QR should encode. {ref} is replaced with the receipt number.
  // A plain reference is fine; swap for a URL like https://shop.ie/r/{ref} to
  // make the QR scannable to an online receipt/loyalty page.
  qrTemplate: "{ref}",
};

export default SHOP;
