
const mongoose=require('mongoose')




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
    costPrice:{
        type:Number,
        default:0
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
    supplier: { type: mongoose.Schema.Types.ObjectId,
        ref: "Supplier" },
    createdAt:{
        type:Date,
        default:Date.now

    },
},
{ timestamps: true }

)

const Product=mongoose.model("Product",ProductSchema)

module.exports=Product
