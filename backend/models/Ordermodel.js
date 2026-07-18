
const mongoose = require('mongoose')




const OrderSchema= new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    // A purchase order is placed WITH a supplier — this is who we're buying the
    // stock from. Snapshot the name/email so the record still reads correctly if
    // the supplier is later edited or removed.
    supplier:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Supplier",
        default:null,
    },
    supplierName:{ type:String, default:"" },
    supplierEmail:{ type:String, default:"" },
    // When the order email actually went out to the supplier.
    emailSentAt:{ type:Date, default:null },
    emailError:{ type:String, default:"" },
    Description:{
        type:String,
        default:"",
    },
   // An order is a basket, not a single line. `price` is the shelf price at the
   // time the order was placed, copied from the product — never sent by the
   // client.
   Products:[{
    _id:false,
    product:{type:mongoose.Schema.Types.ObjectId,
        ref:"Product",
        required:true},
    quantity:{
        type:Number,
           required:true
    },
    price:{
        type:Number,
        required:true
    }
   }],


   totalAmount:{
    type:Number,
    required:true,
   },
   status:{
    type:String,
    enum:["pending","shipped","delivered"]
   },
   
   invoiceUrl:{
    type:String
},

},
{ timestamps: true }
)

const Order=mongoose.model("Order",OrderSchema)

module.exports=Order