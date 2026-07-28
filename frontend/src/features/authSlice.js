import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from 'react-hot-toast';

// The session lives in the httpOnly cookie (see lib/axios.js). The JWT must
// never be persisted where script can read it, so we keep the user's profile
// for the UI but strip the token off it before it is written — the login
// response nests `token` inside `user`, so storing that object verbatim used to
// put the JWT in localStorage even without a separate "token" key.
const withoutToken = (user) => {
  if (!user) return user;
  const { token, ...safe } = user;
  return safe;
};

// Legacy sessions may already have a token embedded in the stored user.
const storedUser = () => {
  try {
    return withoutToken(JSON.parse(localStorage.getItem("user"))) || null;
  } catch {
    return null;
  }
};

const initialState = {
  Authuser: storedUser(),
  isUserSignup: false,
  iscreatinguser: false,
  staffuser:null,
  manageruser:null,
  adminuser:null,
  isUserLogin: false,
  // Kept in memory only — never read back from storage.
  token: null,
  isupdateProfile: false,
};


export const signup = createAsyncThunk(
  "auth/signup",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("auth/signup", credentials, { withCredentials: true });
      localStorage.setItem("user", JSON.stringify(withoutToken(response.data.savedUser)));
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
      // The cookie the server just set is what authenticates us from here on.
      localStorage.setItem("user", JSON.stringify(withoutToken(response.data.user)));
      // When this session auto-ends (shop's next local midnight). The session
      // guard reads this to log the user out on the dot at end of day.
      if (response.data.sessionExpiresAt) {
        localStorage.setItem("sessionExpiresAt", response.data.sessionExpiresAt);
      }
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Login failed");
    }
  }
);

// Logout
export const logout = createAsyncThunk(
  "auth/logout",
  async () => {
    try {
      await axiosInstance.post("auth/logout");
    } catch {
      // An expired/deleted session is already logged out on the server.
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("authUser");
      localStorage.removeItem("sessionExpiresAt");
    }
    return null;
  }
);
export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (base64Image, { rejectWithValue }) => {
    try {
  
      // This used to also require a localStorage token and send it as a Bearer
      // header. The session cookie carries the auth now, so the profile is the
      // only thing we need — gating on a token that no longer exists would
      // reject every update.
      const currentUser = storedUser();

      if (!currentUser) {
        return rejectWithValue('User not authenticated. Please log in again.');
      }

      const response = await axiosInstance.put(
        'auth/updateProfile',
        { ProfilePic: base64Image },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const updatedData = response.data;

    
      if (updatedData && updatedData.updatedUser) {
        // Merge so we keep profile fields the update doesn't return. Stripped
        // again on the way in: whatever the server sends, the JWT does not go
        // into storage.
        const mergedUser = withoutToken({ ...currentUser, ...updatedData.updatedUser });
        localStorage.setItem('user', JSON.stringify(mergedUser));
        return mergedUser;
      } else {
        throw new Error('Unexpected response structure');
      }
    } catch (error) {
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
        state.Authuser = withoutToken(action.payload.savedUser);
        state.token = null;

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
        state.Authuser = withoutToken(action.payload.user);
        state.token = null;
 
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
     
        state.staffuser = action.payload

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
