
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
        // "superadmin" sits above everything: it owns the support inbox, the
        // approvals queue and user management. Admin must request sensitive
        // actions (like user management) and superadmin approves them.
        // Created only by script, never through the app.
        enum:['superadmin','admin','manager','staff'],
        default:'staff',

    },
    ProfilePic:{
        type:String


    },
    // The audit trail is not something an admin browses at will: they ask the
    // superadmin, and approval opens it until this moment passes. Unset or in
    // the past means no access.
    logAccessUntil:{
        type:Date,
        default:null
    },
    createdAt:{
        type:Date,
        default:Date.now

    },},
    { timestamps: true }


)

const User=mongoose.model("User",UserSchema)

module.exports=User