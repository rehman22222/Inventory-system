import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from 'react-hot-toast';

const initialState = {
  Authuser: JSON.parse(localStorage.getItem("user")) || null, 
  isUserSignup: false,
  iscreatinguser: false,
  staffuser:null,
  manageruser:null,
  adminuser:null,
  isUserLogin: false,
  token: localStorage.getItem("token") || null,
  isupdateProfile: false,
};


export const signup = createAsyncThunk(
  "auth/signup",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("auth/signup", credentials, { withCredentials: true });
      localStorage.setItem("user", JSON.stringify(response.data.savedUser)); 
      localStorage.setItem("token", response.data.savedUser.token); 
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Signup failed");
    }
  }
);

// Admin creating a manager or staff account. Unlike signup, this does not touch
// the current session — the admin stays logged in as themselves.
export const createUser = createAsyncThunk(
  "auth/createuser",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("auth/createuser", payload, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not create user");
    }
  }
);

// Login
export const login = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("auth/login", credentials, { withCredentials: true });
      localStorage.setItem("user", JSON.stringify(response.data.user)); 
      localStorage.setItem("token", response.data.user.token); 
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Login failed");
    }
  }
);

// Logout
export const logout = createAsyncThunk(
  "auth/logout",
  async (_, { rejectWithValue }) => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("authUser");
      return null;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Logout failed");
    }
  }
);
export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (base64Image, { rejectWithValue }) => {
    try {
  
      const storedUser = JSON.parse(localStorage.getItem('user'));
      const token = localStorage.getItem('token');


      if (!storedUser || !token) {
        return rejectWithValue('User not authenticated. Please log in again.');
      }

     
      const response = await axiosInstance.put(
        'auth/updateProfile',
        { ProfilePic: base64Image },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const updatedData = response.data;

    
      if (updatedData && updatedData.updatedUser) {
        // Merge so we keep fields like token that aren't returned by the update.
        const mergedUser = { ...storedUser, ...updatedData.updatedUser };
        localStorage.setItem('user', JSON.stringify(mergedUser));
        return mergedUser;
      } else {
        throw new Error('Unexpected response structure');
      }
    } catch (error) {
      console.error('Update profile error:', error);
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update profile'
      );
    }
  }
);





export const staffUser=createAsyncThunk('auth/staffuser',async(_,{rejectWithValue})=>{
  try {

    const response=await axiosInstance.get('auth/staffuser',_,{ withCredentials: true });
    return response.data
    
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to get staff user');
  }
})



export const managerUser=createAsyncThunk('auth/manageruser',async(_,{rejectWithValue})=>{
  try {

    const response=await axiosInstance.get('auth/manageruser',_,{ withCredentials: true });
    return response.data
    
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to get manager user');
  }
})



export const adminUser=createAsyncThunk('auth/adminuser',async(_,{rejectWithValue})=>{
  try {

    const response=await axiosInstance.get('auth/adminuser',_,{ withCredentials: true });
    return response.data
    
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to get admin  user');
  }
})

export const removeusers=createAsyncThunk("auth/removeuser",async(UserId,{rejectWithValue})=>{
  try {

    const response=await axiosInstance.delete(`auth/removeuser/${UserId}`,UserId,{ withCredentials: true });

    return response.data

  } catch (error) {
     return rejectWithValue(error.response?.data?.message || 'Failed to delete  user');
  }
})

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
     
      .addCase(signup.pending, (state) => {
        state.isUserSignup = true;
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.isUserSignup = false;
        state.Authuser = action.payload.savedUser; 
        state.token = action.payload.token; 

      })
      .addCase(signup.rejected, (state, action) => {
        state.isUserSignup = false;

      })

      .addCase(createUser.pending, (state) => {
        state.iscreatinguser = true;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.iscreatinguser = false;
        const user = action.payload.user;

        // Drop the new account straight into the list it belongs to.
        if (user?.role === "manager") {
          state.manageruser = [user, ...(Array.isArray(state.manageruser) ? state.manageruser : [])];
        } else if (user?.role === "staff") {
          state.staffuser = [user, ...(Array.isArray(state.staffuser) ? state.staffuser : [])];
        }

        toast.success(action.payload.message || "User created");
      })
      .addCase(createUser.rejected, (state, action) => {
        state.iscreatinguser = false;
        toast.error(action.payload || "Could not create user");
      })


      .addCase(login.pending, (state) => {
        state.isUserLogin = true;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isUserLogin = false;
        state.Authuser = action.payload.user; 
        state.token = action.payload.token; 
 
      })
      .addCase(login.rejected, (state, action) => {
        state.isUserLogin = false;

      })

    
      .addCase(logout.fulfilled, (state) => {
        state.Authuser = null;
        state.token = null;
        toast.success("Successfully logged out!");
      })
      .addCase(logout.rejected, (state, action) => {
     
      })

      .addCase(updateProfile.pending, (state) => {
        state.isupdateProfile = true;
      })
      

      builder.addCase(updateProfile.fulfilled, (state, action) => {
        state.isupdateProfile = false;
        state.Authuser = { ...state.Authuser, ...action.payload };
      })
      
    

      .addCase(staffUser.fulfilled, (state, action) => {
     
        state. staffuser = action.payload

      })
      
     
      .addCase(staffUser.rejected,(state,action)=>{

 
      })

      


      .addCase(managerUser.fulfilled, (state, action) => {
    
        state.manageruser = action.payload

      })
      
     
      .addCase(managerUser.rejected,(state,action)=>{
   
      
      })
    




      .addCase(adminUser.fulfilled, (state, action) => {
      
        state.adminuser = action.payload
        
      })
      
     
      .addCase(adminUser.rejected,(state,action)=>{
      
       
      })


      .addCase(removeusers.fulfilled, (state, action) => {
      
      
        
      })
      
     
      .addCase(removeusers.rejected,(state,action)=>{
      
      
      })
    



  
  },
});

export default authSlice.reducer;