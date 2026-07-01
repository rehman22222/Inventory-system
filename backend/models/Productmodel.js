
const mongoose=require('mongoose')




const ProductSchema= new mongoose.Schema({

    name:{
        type:String,
        required:true
    },
    Desciption:{
        type:String,
        required:true,

    },
    Category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category"
    }, 
    Price:{
        type:Number,
        required:true,
        
    
    },
    quantity:{
        type:Number,
        default:0
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
