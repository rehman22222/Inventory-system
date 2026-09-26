import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

const initialState = {
  deals: [],
  isloading: false,
  iscreating: false,
};

export const gettingallDeals = createAsyncThunk(
  "deal/all",
  async (channel, { rejectWithValue }) => {
    try {
      const suffix = channel ? `?channel=${encodeURIComponent(channel)}` : "";
      const response = await axiosInstance.get(`deal/all${suffix}`, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Deal retrieval failed");
    }
  }
);

export const CreateDeal = createAsyncThunk(
  "deal/create",
  async (deal, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("deal/create", deal, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Deal creation failed");
    }
  }
);

export const UpdateDeal = createAsyncThunk(
  "deal/update",
  async ({ dealId, changes }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.put(`deal/${dealId}`, changes, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not update deal");
    }
  }
);

export const RemoveDeal = createAsyncThunk(
  "deal/remove",
  async (dealId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.delete(`deal/${dealId}`, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Deal delete failed");
    }
  }
);

const dealSlice = createSlice({
  name: "deal",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(gettingallDeals.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingallDeals.fulfilled, (state, action) => {
        state.isloading = false;
        state.deals = action.payload.deals || [];
      })
      .addCase(gettingallDeals.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Deal retrieval failed");
      })

      .addCase(CreateDeal.pending, (state) => {
        state.iscreating = true;
      })
      .addCase(CreateDeal.fulfilled, (state, action) => {
        state.iscreating = false;
        if (action.payload.deal) state.deals.unshift(action.payload.deal);
      })
      .addCase(CreateDeal.rejected, (state, action) => {
        state.iscreating = false;
        toast.error(action.payload || "Deal creation failed");
      })

      .addCase(UpdateDeal.fulfilled, (state, action) => {
        const updated = action.payload.deal;
        if (updated) {
          state.deals = state.deals.map((deal) => (deal._id === updated._id ? updated : deal));
        }
      })
      .addCase(UpdateDeal.rejected, (state, action) => {
        toast.error(action.payload || "Could not update deal");
      })

      .addCase(RemoveDeal.fulfilled, (state, action) => {
        state.deals = state.deals.filter((deal) => deal._id !== action.meta.arg);
      })
      .addCase(RemoveDeal.rejected, (state, action) => {
        toast.error(action.payload || "Deal delete failed");
      });
  },
});

export default dealSlice.reducer;
