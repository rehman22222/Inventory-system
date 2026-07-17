import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";

const initialState = {
  reorders: [],
  pending: 0,
  isLoading: false,
  isActing: false,
};

export const getReorders = createAsyncThunk(
  "reorder/getReorders",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("reorder", { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not load reorders");
    }
  }
);

export const updateReorder = createAsyncThunk(
  "reorder/updateReorder",
  async ({ id, quantity, note }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.put(`reorder/${id}`, { quantity, note }, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not update reorder");
    }
  }
);

export const approveReorder = createAsyncThunk(
  "reorder/approveReorder",
  async (id, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`reorder/${id}/approve`, {}, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not approve reorder");
    }
  }
);

export const rejectReorder = createAsyncThunk(
  "reorder/rejectReorder",
  async ({ id, note }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`reorder/${id}/reject`, { note }, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not dismiss reorder");
    }
  }
);

// Replace one reorder in the list with the server's updated copy.
const upsert = (state, reorder) => {
  if (!reorder) return;
  state.reorders = state.reorders.map((r) => (r._id === reorder._id ? reorder : r));
  state.pending = state.reorders.filter((r) => r.status === "pending").length;
};

const reorderSlice = createSlice({
  name: "reorder",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(getReorders.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getReorders.fulfilled, (state, action) => {
        state.isLoading = false;
        state.reorders = action.payload.reorders || [];
        state.pending = action.payload.pending || 0;
      })
      .addCase(getReorders.rejected, (state) => {
        state.isLoading = false;
      })

      .addCase(approveReorder.pending, (state) => {
        state.isActing = true;
      })
      .addCase(approveReorder.fulfilled, (state, action) => {
        state.isActing = false;
        upsert(state, action.payload.reorder);
      })
      .addCase(approveReorder.rejected, (state) => {
        state.isActing = false;
      })

      .addCase(rejectReorder.fulfilled, (state, action) => {
        upsert(state, action.payload.reorder);
      })
      .addCase(updateReorder.fulfilled, (state, action) => {
        upsert(state, action.payload.reorder);
      });
  },
});

export default reorderSlice.reducer;
