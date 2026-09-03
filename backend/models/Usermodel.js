
const mongoose=require('mongoose')




const UserSchema= new mongoose.Schema({

    name:{
        type:String,
        require:true
    },
    email:{
        type:String,
        require:true,
        unique:true,
        // The login lowercases what is typed before it looks anybody up, so an
        // account stored with capitals could never be found — its owner was
        // told their password was wrong, forever, while everyone created
        // through the app signed in fine. Normalised on write from here on;
        // accounts written before this still need fixing in the database.
        lowercase:true,
        trim:true
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
        enum:['superadmin','admin','manager','staff','report'],
        default:'staff',

    },
    ProfilePic:{
        type:String


    },
    // The audit trail is not something an admin browses at will: they ask the
    // superadmin for a specific window, and approval opens exactly that window
    // until `logAccessUntil` passes.
    //   logAccessUntil        — when the grant itself lapses (unset/past = none)
    //   logAccessFrom/To      — the slice of history the grant covers
    // The admin can only ever see entries inside [From, To], and only while the
    // grant is live. Enforced on the server, not just hidden in the UI.
    logAccessUntil:{
        type:Date,
        default:null
    },
    logAccessFrom:{
        type:Date,
        default:null
    },
    logAccessTo:{
        type:Date,
        default:null
    },
    createdAt:{
        type:Date,
        default:Date.now

    },},
    { timestamps: true }


)

// The user-management pages filter by role (list staff, list managers). Index
// it so those lists don't scan every account. (email already has a unique index.)
UserSchema.index({ role: 1 });

const User=mongoose.model("User",UserSchema)

module.exports=User
