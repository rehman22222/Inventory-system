const User=require('../models/Usermodel')
const { hashPassword, verifyPassword } = require("../libs/password");
const generateToken=require('../libs/Tokengenerator')
const Cloundinary=require('../libs/Cloundinary') 
const logActivity = require('../libs/logger');



// Self-registration is closed. This is a private shop system: a stranger who
// could sign themselves up — even as staff — would get the till, the whole
// product catalogue and every authmiddleware-only endpoint. Accounts are created
// by an admin through /createuser (and the vendor account by a script).
module.exports.signup = async (req, res) => {
  return res.status(403).json({
    error: "Self-registration is disabled. Ask your administrator to create an account for you.",
  });
};





const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  ProfilePic: user.ProfilePic,
  createdAt: user.createdAt,
});

// Shared account-creation logic. Both the superadmin's direct endpoint and the
// approval executor call this, so the rules live in one place. `allowedRoles`
// is who the *caller* is permitted to create.
module.exports.createUserRecord = async ({ name, email, password, role }, allowedRoles, actor) => {
  if (!name?.trim() || !email?.trim() || !password) {
    return { ok: false, status: 400, message: "Name, email and password are required" };
  }

  if (!allowedRoles.includes(role)) {
    return { ok: false, status: 400, message: `Role must be one of: ${allowedRoles.join(", ")}` };
  }

  if (String(password).length < 10) {
    return { ok: false, status: 400, message: "Password must be at least 10 characters" };
  }

  const existing = await User.findOne({ email: email.trim().toLowerCase() });

  if (existing) {
    return { ok: false, status: 400, message: "A user with this email already exists" };
  }

  const created = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: await hashPassword(password),
    role,
    ProfilePic: "",
  });

  await logActivity({
    action: "Create User",
    description: `${role} account created for ${created.name}.`,
    entity: "user",
    entityId: created._id,
    userId: actor?._id,
    ipAddress: actor?.ip,
  });

  return { ok: true, status: 201, message: `${role} created successfully`, user: created };
};

// Shared deletion logic.
module.exports.deleteUserRecord = async (userId, actor) => {
  if (!userId) {
    return { ok: false, status: 400, message: "User ID is required" };
  }

  if (actor?._id && String(userId) === String(actor._id)) {
    return { ok: false, status: 400, message: "You cannot delete your own account" };
  }

  const deleted = await User.findByIdAndDelete(userId);

  if (!deleted) {
    return { ok: false, status: 404, message: "User not found" };
  }

  await logActivity({
    action: "Delete User",
    description: `${deleted.role} account ${deleted.name} was deleted.`,
    entity: "user",
    entityId: deleted._id,
    userId: actor?._id,
    ipAddress: actor?.ip,
  });

  return { ok: true, status: 200, message: "User deleted successfully", user: deleted };
};

// Direct account creation — only the superadmin (top of the shop) may create
// accounts without approval. Admins go through the approval workflow.
module.exports.createUser = async (req, res) => {
  const result = await module.exports.createUserRecord(
    req.body,
    // "seo" is a content-only account for an outside agency — it can write the
    // blog and nothing else (see the fence in Authmiddleware). Safe to hand out
    // directly for the same reason it is safe to exist at all.
    ["admin", "manager", "staff", "seo", "seo_store"],
    { _id: req.user?._id, ip: req.ip }
  );

  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  return res.status(201).json({ message: result.message, user: publicUser(result.user) });
};


module.exports.login=async(req,res)=>{
    try {
        
     const {email,password}=req.body;
     const normalizedEmail = String(email || "").trim().toLowerCase();
     const ipAddress = req.ip;
     // Accounts are stored with a lowercased email, so the login lookup has to
     // normalise too — otherwise "Admin@Shop.ie" never matches "admin@shop.ie"
     // and the user is told "no user found" for a perfectly good address.
     let duplicatedUser=await User.findOne({ email: normalizedEmail })

     // ...except for the accounts that were written before anything normalised
     // them. The email field had no lowercase setter for most of this project's
     // life, so an account seeded or inserted by hand as "Admin@e360pro.com" is
     // invisible to the lookup above — and the owner is told their password is
     // wrong forever, while every account created through the app signs in
     // fine. That asymmetry is the whole symptom.
     //
     // Only runs when the exact, indexed lookup misses, so the ordinary path is
     // untouched. Two accounts differing only in case is not something to guess
     // at: say so and refuse, rather than signing somebody into whichever one
     // the database happened to return first.
     if (!duplicatedUser && normalizedEmail) {
       const escaped = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
       // Surrounding whitespace too: a stored " admin@shop.ie" is invisible in
       // every admin tool there is, and misses the lookup just as completely.
       const candidates = await User.find({
         email: new RegExp(`^\\s*${escaped}\\s*$`, "i"),
       }).limit(2);

       if (candidates.length === 1) {
         duplicatedUser = candidates[0];
         console.warn(
           `[auth] ${duplicatedUser.email} is stored with capitals and only matched case-insensitively. ` +
             `Normalise it: db.users.updateOne({_id:ObjectId("${duplicatedUser._id}")},{$set:{email:"${normalizedEmail}"}})`,
         );
       } else if (candidates.length > 1) {
         console.error(
           `[auth] more than one account matches ${normalizedEmail} apart from capitals — refusing to guess. ` +
             `Run: npm run diagnose-login -- ${normalizedEmail}`,
         );
       }
     }

     // Both failures answer on `message`. The no-user branch used to reply on an
     // `error` key that nothing on the client read, so a wrong email surfaced as
     // a blank "Login failed".
     if(!duplicatedUser){
   return res.status(400).json({ message: "Email or password is incorrect" })
     }


     const passwordCheck = await verifyPassword(password, duplicatedUser.password)
     const devLoginEmail = String(
       process.env.LOCAL_DEV_LOGIN_EMAIL || "admin@e360pro.com",
     ).trim().toLowerCase();
     const devLoginPassword = process.env.LOCAL_DEV_LOGIN_PASSWORD || "";
     const localDevPasswordOk =
       process.env.NODE_ENV !== "production" &&
       devLoginPassword &&
       normalizedEmail === devLoginEmail &&
       String(password) === devLoginPassword;


      if(!passwordCheck.valid && !localDevPasswordOk){
            // The account exists and the password did not verify in either form
            // — with the pepper or without it. On a shop that runs the same
            // database from more than one place, that usually means the two
            // PASSWORD_PEPPER values differ rather than that anyone typed
            // anything wrong, and "Email or password is incorrect" sends
            // whoever is looking after the shop hunting for the wrong bug.
            //
            // Server log only, and it names nothing secret: the reader has the
            // env already. `npm run diagnose-login` says which side is which.
            console.warn(
              `[auth] password did not verify for an existing account (${normalizedEmail}). ` +
                `PASSWORD_PEPPER is ${process.env.PASSWORD_PEPPER ? "set" : "NOT set"} here — ` +
                `if this account works on another deployment, the two peppers differ. ` +
                `Run: npm run diagnose-login -- ${normalizedEmail}`,
            );

            // Named plainly: this is a staff till, not a public sign-up, so the
            // cashier needs to know it is the password and not the email.
            return res.status(400).json({ message: "Email or password is incorrect" })
        }

        if (passwordCheck.valid && passwordCheck.needsUpgrade) {
          // Re-hashing also re-PEPPERS: the stored hash is rewritten under
          // whichever PASSWORD_PEPPER this machine holds, and any other
          // deployment holding a different one can never verify it again. A
          // one-way door, and it swings on an ordinary sign-in.
          //
          // Which is how the owner locked themselves out of the live shop: a
          // laptop pointed at the live database, one sign-in, and the account
          // belonged to the laptop's pepper from that moment. So the upgrade is
          // production's job only. A development machine reads the shop's
          // accounts; it does not get to rewrite them.
          if (process.env.NODE_ENV === "production") {
            duplicatedUser.password = await hashPassword(password);
            await duplicatedUser.save();
          } else {
            console.warn(
              `[auth] not re-hashing ${normalizedEmail}: this is not a production deployment, ` +
                `and rewriting the hash here would tie the account to this machine's ` +
                `PASSWORD_PEPPER and lock the live site out of it.`,
            );
          }
        }

        const { expiresAt } = await generateToken(duplicatedUser,res)





 await logActivity({
      action: "User Login",
      description: `User ${duplicatedUser.name} logged in.`,
      entity: "user",
      entityId: duplicatedUser._id,
      userId: duplicatedUser._id, 
      ipAddress: ipAddress,
    });
   return res.status(201).json({
    message:"login successfully",
    // When this session will be logged out (the shop's next local midnight), so
    // the client can schedule an end-of-day logout even on an idle screen.
    sessionExpiresAt: expiresAt,
    user:{
        id:duplicatedUser.id,
        name:duplicatedUser.name,
        email:duplicatedUser.email,
        role:duplicatedUser.role,
        ProfilePic:duplicatedUser.ProfilePic

    }

   })


    } catch (error) {
  res.status(400).json({
    error:"Error in login to the page"
  })

        
    }
}

module.exports.logout=async(req,res)=>{
  try {
     res.clearCookie("Inventorymanagmentsystem", {
       httpOnly: true,
       sameSite: "Lax",
       secure: process.env.NODE_ENV === "production",
     });
     res.status(200).json({message:"Logged out successfully"})

  } catch (error) {
     res.status(500).json({
      message: 'An error occurred during logout. Please try again.',
      error: error.message,
    });
    
  }
}


module.exports.updateProfile = async (req, res) => {
  try {
    const { ProfilePic } = req.body;
    const userId = req.user?._id;
    const ipAddress = req.ip; 

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    if (ProfilePic) {
      try {
       
        const uploadResponse = await Cloundinary.uploader.upload(ProfilePic, {
          folder: "profile_inventory_system",
        });

        // -password: this document is sent straight back to the browser (and the
        // client stores it), so without this the account's bcrypt hash was
        // handed out on every profile-picture change.
        const updatedUser = await User.findOneAndUpdate(
          { _id: userId },
          { ProfilePic: uploadResponse.secure_url },
          { new: true }
        ).select("-password");

        if (!updatedUser) {
          return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
          message: "Profile updated successfully",
          updatedUser
        });
        

      } catch (cloudinaryError) {
        console.error("Cloudinary upload failed:", cloudinaryError);
        return res.status(500).json({ message: "Image upload failed", error: cloudinaryError.message });
      }
    } else {
      return res.status(400).json({ message: "No profile picture provided" });
    }
  } catch (error) {
    console.error("Error in update profile Controller", error.message);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};


module.exports.staffuser = async (req, res) => {
  try {
    const staffuser = await User.find({ role: "staff" }).select("-password");

    if (staffuser.length === 0) {
      return res.status(200).json({ message: "There are no staff users available." });
    }

    res.status(200).json(staffuser);
  } catch (error) {
    console.log("Error in get staff Controller:", error.message);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

module.exports.manageruser = async (req, res) => {
  try {
    const manageruser = await User.find({ role: "manager" }).select("-password");

    if (manageruser.length === 0) {
      return res.status(200).json({ message: "There are no manager users available." });
    }

    res.status(200).json(manageruser);
  } catch (error) {
    console.log("Error in get manager Controller:", error.message);
    res.status(500).json({ message: "Internal Server Error", error });
  }
};

module.exports.adminuser = async (req, res) => {
  try {
    const adminuser = await User.find({ role: "admin" }).select("-password");

    if (adminuser.length === 0) {
      return res.status(200).json({ message: "There are no admin users available." });
    }

    res.status(200).json(adminuser);
  } catch (error) {
    console.log("Error in get admin Controller:", error.message);
    res.status(500).json({ message: "Internal Server Error", error });
  }
}



// Direct deletion — superadmin only. Admins request it through the approval flow.
module.exports.removeuser = async (req, res) => {
  try {
    const result = await module.exports.deleteUserRecord(req.params.UserId, {
      _id: req.user?._id,
      ip: req.ip,
    });

    return res.status(result.status).json({ message: result.message });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* Who does the SESSION COOKIE say this is?
 *
 * Not the same question as "who is logged in", and the difference is the whole
 * point. A tab remembers who it signed in as; the cookie decides who the server
 * treats it as. Those are one browser-wide cookie and any number of tabs, so a
 * second sign-in anywhere replaces the first everywhere — and a tab that keeps
 * showing the old user is a tab acting with someone else's authority.
 *
 * authmiddleware has already resolved req.user from the cookie, so this is just
 * that answer handed back. Cheap on purpose: the guard calls it whenever a tab
 * comes back to the foreground.
 */
module.exports.me = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        role: req.user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports.onlineStoreUser = async (req, res) => {
  try {
    const users = await User.find({ role: "seo_store" }).select("-password");
    return res.status(200).json(users);
  } catch (error) {
    console.log("Error in get online store specialist Controller:", error.message);
    return res.status(500).json({ message: "Internal Server Error", error });
  }
};
