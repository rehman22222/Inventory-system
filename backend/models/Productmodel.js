
const mongoose=require('mongoose')
const { invalidateProductCatalog } = require("../libs/productCatalogCache");




const ProductSchema= new mongoose.Schema({

    name:{
        type:String,
        required:true
    },
    Desciption:{
        type:String,
        // Only name and Price are mandatory now; everything else is optional.
    },
    // Merchandising shelf label, e.g. "A12" — letters and numbers.
    shelfLabel:{
        type:String,
        trim:true,
    },
    Category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category"
    },
    Price:{
        type:Number,
        required:true,


    },
    // What the shop paid, ALWAYS in the shop's own currency (Store.currency).
    // Every report subtracts this straight from the shelf price, so a figure in
    // any other currency here silently corrupts profit.
    costPrice:{
        type:Number,
        default:0
    },
    // Set only when the supplier invoiced in a different currency. Keeps the
    // figure traceable back to the invoice and records the rate actually used,
    // so nobody has to guess it afterwards. costPrice above stays the converted
    // value, which is why no report needs to know about any of this.
    costSource:{
        // The number as printed on the supplier's invoice.
        amount:{ type:Number },
        // ISO code the supplier billed in, e.g. "GBP".
        currency:{ type:String, trim:true, uppercase:true },
        // Shop currency per 1 unit of `currency` — costPrice = amount * rate.
        rate:{ type:Number },
        // Free text for the paper trail, e.g. "3D Trading invoice 13961".
        note:{ type:String, trim:true },
    },
    quantity:{
        type:Number,
        default:0
    },
    // Has anybody actually counted this stock, or is the number a placeholder?
    //
    // Bulk tools ("set every web flavour of VELO to 15") must never flatten a
    // figure the shop maintains for real. The test is deliberately NOT "does it
    // have a barcode" — a barcode is a label, not a promise that the count is
    // true, and an item can be properly counted without ever carrying one.
    //
    // Seeded from barcode presence because that is the best evidence available
    // today, but from here it moves on its own: a stocktake, a goods-in scan or
    // a manual edit flips it, and bulk leaves it alone from then on.
    stockCounted:{
        type:Boolean,
        default:false
    },
    /* Not counted. Selling this never touches `quantity`, and it can never be
     * out of stock.
     *
     * The counter needs a way to ring up something the catalogue does not know:
     * a customer is holding an item with no barcode, there is a queue, and
     * labelling it properly is a job for later, not for now. A card priced at
     * "€5 coil" is that way — but it has no stock behind it, and the till's
     * whole safety model is a guarded decrement that REFUSES to sell what is
     * not there. A card with a count of zero would fail at the last step, in
     * front of the customer.
     *
     * So the count is not zero, it is absent. Nothing is deducted, nothing is
     * checked, no stock movement is written, and no low-stock alert is raised —
     * because nothing moved. The sale itself is entirely real: it has a name, a
     * price, a line on the receipt and a row in the report.
     *
     * Deliberately separate from `quickSell` below. This is what the SERVER
     * does with the product; that is whether the TILL draws a card for it.
     */
    nonStock:{
        type:Boolean,
        default:false
    },
    /* Show this on the till as a one-tap card.
     *
     * The shop's own shortcuts for the things it sells constantly and cannot
     * scan. Kept on the product rather than in a list of its own, because a
     * card IS a product — it is rung up, refunded and reported like any other,
     * and a parallel table would be a second place for the same fact to live.
     */
    quickSell:{
        type:Boolean,
        default:false
    },
    // Per-product low-stock threshold. Falls back to 10 where unset.
    lowStockThreshold:{
        type:Number,
        default:10
    },
    barcode:{
        type:String,
        unique:true,
        sparse:true
    },
    expiryDate:{
        type:Date,
    },
    image:{
        url:{ type:String },
        publicId:{ type:String },
    },
    // Stable link back to a catalogue source. This lets an importer update the
    // same inventory row on a later run instead of creating a duplicate when
    // a product title or variant label changes upstream.
    onlineSource:{
        provider:{ type:String, trim:true, lowercase:true },
        storeDomain:{ type:String, trim:true, lowercase:true },
        productId:{ type:String, trim:true },
        variantId:{ type:String, trim:true, default:"" },
        role:{ type:String, enum:["parent","variant"], default:"parent" },
    },
    supplier: { type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier" },
    createdAt:{
        type:Date,
        default:Date.now

    },
},
{ timestamps: true }

)

// Hot paths: listing/filtering by category, low-stock scans (quantity), and the
// product search box. A text index lets name/description search use an index
// instead of scanning every row — important once the catalogue is thousands of
// SKUs. (barcode already has a unique sparse index on the field.)
ProductSchema.index({ Category: 1 });
ProductSchema.index({ quantity: 1 });
// The till fetches its cards on every load, so this read has to be an index
// hit and not a scan of the whole catalogue. Partial, because the cards are a
// handful of rows out of thousands.
ProductSchema.index(
  { quickSell: 1, createdAt: 1 },
  { partialFilterExpression: { quickSell: true } },
);
ProductSchema.index({ name: "text", Desciption: "text" });
ProductSchema.index(
  {
    "onlineSource.provider": 1,
    "onlineSource.storeDomain": 1,
    "onlineSource.productId": 1,
    "onlineSource.variantId": 1,
    "onlineSource.role": 1,
  },
  {
    unique: true,
    partialFilterExpression: { "onlineSource.provider": { $type: "string" } },
  }
);

ProductSchema.post("save", invalidateProductCatalog);
for (const operation of [
  "findOneAndUpdate",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
]) {
  ProductSchema.post(operation, invalidateProductCatalog);
}

const Product=mongoose.model("Product",ProductSchema)

module.exports=Product
