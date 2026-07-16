// Details printed on the receipt header/footer. Edit these to match the shop —
// they are not stored in the database, so a change here (plus a rebuild) is all
// it takes.
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
