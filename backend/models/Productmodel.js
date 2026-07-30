
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
