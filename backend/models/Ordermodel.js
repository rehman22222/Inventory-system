
const mongoose = require('mongoose')




const OrderSchema= new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    Description:{
        type:String,
        required:true,

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