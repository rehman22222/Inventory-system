
const mongoose=require('mongoose')




const SupplierSchema= new mongoose.Schema({

    name:{
        type:String,
        require:true
    },
    contactInfo:{
        phone:{type:String},
        email:{type:String},
        address:{type:String}
    },
    // A supplier supplies many products. The inverse of this is Product.supplier
    // (each product comes from one supplier), and the controller keeps the two
    // in step — otherwise the same fact would be stored twice and drift apart.
    productsSupplied:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Product"
    }],
    createdAt:{
        type:Date,
        default:Date.now

    },




},    { timestamps: true }


)

const Supplier=mongoose.model("Supplier",SupplierSchema)

module.exports=Supplier