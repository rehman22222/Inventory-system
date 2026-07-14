
const mongoose=require('mongoose')




const UserSchema= new mongoose.Schema({

    name:{
        type:String,
        require:true
    },
    email:{
        type:String,
        require:true,
        unique:true
    },
    password:{
        type:String,
        require:true
    }, 
    role:{
        type:String,
        // "superadmin" is the vendor (us), not the shop. It is never created
        // through the app — only by scripts/createSuperAdmin.js.
        enum:['superadmin','admin','manager','staff'],
        default:'staff',
    
    },
    ProfilePic:{
        type:String
   

    },
    createdAt:{
        type:Date,
        default:Date.now

    },},
    { timestamps: true }


)

const User=mongoose.model("User",UserSchema)

module.exports=User