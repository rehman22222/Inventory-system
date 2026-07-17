import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";


const initialState = {
  activityLogs: [],
  isFetching: false,
  isAdding: false,
  userdata:[],
  recentuser:null,
  // Set when the audit trail refused us and the fix is to ask the owner, rather
  // than a real failure. Drives the "request access" prompt.
  accessError: null,
  // The granted window an admin is currently viewing (null for superadmin).
  logRange: null,

};


export const getAllActivityLogs = createAsyncThunk(
  "activitylogs/getAllLogs",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("activitylogs/getAllLogs", {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      // The audit trail is gated: a 403 here means "ask the owner", not
      // "something broke". Carry that through so the page can offer the request
      // instead of showing a dead error.
      const data = error.response?.data;
      return rejectWithValue({
        message: data?.message || "Failed to fetch activity logs",
        needsApproval: data?.needsApproval,
        expired: data?.expired,
      });
    }
  }
);





export const getsingleUserActivityLogs = createAsyncThunk(
  "activitylogs/getLogs",
  async (userid, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get( `activitylogs/getLogs/${userid}`, {
        withCredentials: true,
      });
      return response.data; 
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch activity logs");
    }
  }
);

export const getrecentActivityLogs = createAsyncThunk(
  "activitylogs/getrecentActivitys",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get( `activitylogs/getrecentActivitys`, {
        withCredentials: true,
      });
      return response.data; 
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to fetch activity logs");
    }
  }
);




export const addActivityLog = createAsyncThunk(
  "activitylogs/addLog",
  async (logData, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("activity-logs", logData, {
        withCredentials: true,
      });
      return response.data; 
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Failed to add activity log");
    }
  }
);



const activitySlice = createSlice({
  name: "activity",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      
      .addCase(getAllActivityLogs.pending, (state) => {
        state.isFetching = true;
        state.accessError = null;
      })
      .addCase(getAllActivityLogs.fulfilled, (state, action) => {
        state.isFetching = false;
        // The endpoint now returns { logs, range }; older shape was a bare
        // array. Handle both so nothing breaks mid-deploy.
        const payload = action.payload;
        state.activityLogs = Array.isArray(payload) ? payload : payload.logs || [];
        state.logRange = Array.isArray(payload) ? null : payload.range || null;
        state.accessError = null;
      })
      .addCase(getAllActivityLogs.rejected, (state, action) => {
        state.isFetching = false;
        state.error = action.payload;
        state.activityLogs = [];

        // "You need approval" is an expected state with its own screen — not a
        // failure to shout about.
        if (action.payload?.needsApproval) {
          state.accessError = action.payload;
          return;
        }

        state.accessError = null;
        toast.error(action.payload?.message || "Error fetching activity logs");
      })

      
      .addCase(addActivityLog.pending, (state) => {
        state.isAdding = true;
      })
      .addCase(addActivityLog.fulfilled, (state, action) => {
        state.isAdding = false;
        state.activityLogs.push(action.payload); 
  
      })
      .addCase(addActivityLog.rejected, (state, action) => {
        state.isAdding = false;
        state.error = action.payload; 
  
      })






      .addCase( getsingleUserActivityLogs.pending, (state) => {
        
      })
      .addCase( getsingleUserActivityLogs.fulfilled, (state, action) => {
        
        state.userdata.push(action.payload); 
       
      })
      .addCase( getsingleUserActivityLogs.rejected, (state, action) => {

        state.error = action.payload; 
      
      })

      .addCase(getrecentActivityLogs.fulfilled, (state, action) => {
        
        state.recentuser=action.payload
       
      })
      .addCase(getrecentActivityLogs.rejected, (state, action) => {

        state.error = action.payload; 
      
      })
   


      
  },
});

export default activitySlice.reducer;
