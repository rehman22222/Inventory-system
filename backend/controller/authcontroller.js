const User=require('../models/Usermodel')
const bcrypt = require("bcryptjs");
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





// Admin-only account creation. This is the ONLY way a manager or staff account
// comes into existence — self-signup is always staff.
module.exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    if (role !== "manager" && role !== "staff") {
      return res.status(400).json({ message: "Role must be manager or staff" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });

    if (existing) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    const created = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 10),
      role,
      ProfilePic: "",
    });

    await logActivity({
      action: "Create User",
      description: `${role} account created for ${created.name}.`,
      entity: "user",
      entityId: created._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: `${role} created successfully`,
      user: {
        _id: created._id,
        name: created.name,
        email: created.email,
        role: created.role,
        ProfilePic: created.ProfilePic,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error creating user" });
  }
};


module.exports.login=async(req,res)=>{
    try {
        
     const {email,password}=req.body;
     const ipAddress = req.ip; 
     const duplicatedUser=await User.findOne({email})

     if(!duplicatedUser){

   return res.status(400).json({error:"No user found"})
     }


     const hasedpassword=await bcrypt.compare(password,duplicatedUser.password)


      if(!hasedpassword){
            return res.status(400).json({message:'Invalid credentials'})
        }

        const token=await generateToken(duplicatedUser,res)





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
    user:{
        id:duplicatedUser.id,
        name:duplicatedUser.name,
        email:duplicatedUser.email,
        role:duplicatedUser.role,
        ProfilePic:duplicatedUser.ProfilePic,
        token

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
     res.cookie("Inventorymanagmentsystem",'',{maxAge:0})
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

        const updatedUser = await User.findOneAndUpdate(
          { _id: userId },
          { ProfilePic: uploadResponse.secure_url },
          { new: true }
        );

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



module.exports.removeuser = async (req, res) => {
  try {
    const { UserId } = req.params;

    if (!UserId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // An admin locking themselves out of their own system helps nobody.
    if (String(UserId) === String(req.user?._id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const deleteUser = await User.findByIdAndDelete(UserId);

    if (!deleteUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
