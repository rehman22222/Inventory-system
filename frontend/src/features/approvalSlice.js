import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

const initialState = {
  requests: [], // superadmin: the whole queue
  myRequests: [], // admin: their own
  pending: 0,
  isloading: false,
  issubmitting: false,
};

// Admin raises a request for a gated action.
export const RaiseRequest = createAsyncThunk(
  "approval/request",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("approval/request", payload, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not submit request");
    }
  }
);

// Admin: my own requests and their status.
export const gettingMyRequests = createAsyncThunk(
  "approval/mine",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("approval/mine", { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not load requests");
    }
  }
);

// Superadmin: the full queue.
export const gettingAllRequests = createAsyncThunk(
  "approval/all",
  async (status, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("approval", {
        params: status ? { status } : undefined,
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not load requests");
    }
  }
);

export const ApproveRequest = createAsyncThunk(
  "approval/approve",
  async (requestId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`approval/${requestId}/approve`, {}, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not approve request");
    }
  }
);

export const RejectRequest = createAsyncThunk(
  "approval/reject",
  async ({ requestId, note }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`approval/${requestId}/reject`, { note }, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not reject request");
    }
  }
);

const replaceInQueue = (state, updated) => {
  state.requests = state.requests.map((request) =>
    request._id === updated._id ? updated : request
  );
  state.pending = state.requests.filter((request) => request.status === "pending").length;
};

const approvalSlice = createSlice({
  name: "approval",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(RaiseRequest.pending, (state) => {
        state.issubmitting = true;
      })
      .addCase(RaiseRequest.fulfilled, (state, action) => {
        state.issubmitting = false;
        if (action.payload.request) state.myRequests.unshift(action.payload.request);
        toast.success(action.payload.message || "Request submitted");
      })
      .addCase(RaiseRequest.rejected, (state, action) => {
        state.issubmitting = false;
        toast.error(action.payload || "Could not submit request");
      })

      .addCase(gettingMyRequests.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingMyRequests.fulfilled, (state, action) => {
        state.isloading = false;
        state.myRequests = action.payload.requests || [];
      })
      .addCase(gettingMyRequests.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Could not load requests");
      })

      .addCase(gettingAllRequests.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingAllRequests.fulfilled, (state, action) => {
        state.isloading = false;
        state.requests = action.payload.requests || [];
        state.pending = action.payload.pending || 0;
      })
      .addCase(gettingAllRequests.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Could not load requests");
      })

      .addCase(ApproveRequest.fulfilled, (state, action) => {
        replaceInQueue(state, action.payload.request);
        toast.success(action.payload.message || "Approved");
      })
      .addCase(ApproveRequest.rejected, (state, action) => {
        toast.error(action.payload || "Could not approve request");
      })

      .addCase(RejectRequest.fulfilled, (state, action) => {
        replaceInQueue(state, action.payload.request);
        toast.success(action.payload.message || "Rejected");
      })
      .addCase(RejectRequest.rejected, (state, action) => {
        toast.error(action.payload || "Could not reject request");
      });
  },
});

export default approvalSlice.reducer;
