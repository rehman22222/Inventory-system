
const mongoose=require('mongoose')




const NotificationSchema= new mongoose.Schema({

    name:{
        type:String,
        require:true
    },
    type:{
        type:String,
        require:true,
        
    },
    createdAt:{
        type:Date,
        default:Date.now

    },
},
{ timestamps: true }
)

// Notifications are always read newest-first; index the sort key so the bell
// dropdown doesn't scan the whole collection on every poll.
NotificationSchema.index({ createdAt: -1 });

const Notification=mongoose.model("Notification",NotificationSchema)

module.exports=Notification