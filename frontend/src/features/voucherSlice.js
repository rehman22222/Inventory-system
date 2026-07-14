import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

const initialState = {
  vouchers: [],
  isloading: false,
  iscreating: false,
};

export const CreateVoucher = createAsyncThunk(
  "voucher/create",
  async (voucher, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("voucher/create", voucher, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Voucher creation failed");
    }
  }
);

export const gettingallVouchers = createAsyncThunk(
  "voucher/all",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("voucher/all", { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Voucher retrieval failed");
    }
  }
);

export const DisableVoucher = createAsyncThunk(
  "voucher/disable",
  async (voucherId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.put(`voucher/${voucherId}/disable`, {}, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not disable voucher");
    }
  }
);

export const RemoveVoucher = createAsyncThunk(
  "voucher/remove",
  async (voucherId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.delete(`voucher/${voucherId}`, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Voucher delete failed");
    }
  }
);

const voucherSlice = createSlice({
  name: "voucher",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(gettingallVouchers.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingallVouchers.fulfilled, (state, action) => {
        state.isloading = false;
        state.vouchers = action.payload.vouchers || [];
      })
      .addCase(gettingallVouchers.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Voucher retrieval failed");
      })

      .addCase(CreateVoucher.pending, (state) => {
        state.iscreating = true;
      })
      .addCase(CreateVoucher.fulfilled, (state, action) => {
        state.iscreating = false;
        if (action.payload.voucher) state.vouchers.unshift(action.payload.voucher);
        toast.success("Voucher created successfully");
      })
      .addCase(CreateVoucher.rejected, (state, action) => {
        state.iscreating = false;
        toast.error(action.payload || "Voucher creation failed");
      })

      .addCase(DisableVoucher.fulfilled, (state, action) => {
        const updated = action.payload.voucher;
        state.vouchers = state.vouchers.map((voucher) =>
          voucher._id === updated._id ? updated : voucher
        );
        toast.success("Voucher disabled");
      })
      .addCase(DisableVoucher.rejected, (state, action) => {
        toast.error(action.payload || "Could not disable voucher");
      })

      .addCase(RemoveVoucher.fulfilled, (state, action) => {
        state.vouchers = state.vouchers.filter((voucher) => voucher._id !== action.meta.arg);
        toast.success("Voucher deleted");
      })
      .addCase(RemoveVoucher.rejected, (state, action) => {
        toast.error(action.payload || "Voucher delete failed");
      });
  },
});

export default voucherSlice.reducer;
