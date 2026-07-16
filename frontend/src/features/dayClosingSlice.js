import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

const initialState = {
  closings: [],
  selected: null,
  isloading: false,
  isloadingOne: false,
};

export const gettingallDayClosings = createAsyncThunk(
  "dayClosing/all",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("pos/day-closings", {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Could not load day closings"
      );
    }
  }
);

export const gettingDayClosing = createAsyncThunk(
  "dayClosing/one",
  async (closingId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get(`pos/day-closings/${closingId}`, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Could not load this day closing"
      );
    }
  }
);

const dayClosingSlice = createSlice({
  name: "dayClosing",
  initialState,
  reducers: {
    clearSelectedClosing: (state) => {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(gettingallDayClosings.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingallDayClosings.fulfilled, (state, action) => {
        state.isloading = false;
        state.closings = action.payload.closings || [];
      })
      .addCase(gettingallDayClosings.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Could not load day closings");
      })

      .addCase(gettingDayClosing.pending, (state) => {
        state.isloadingOne = true;
      })
      .addCase(gettingDayClosing.fulfilled, (state, action) => {
        state.isloadingOne = false;
        state.selected = action.payload.closing || null;
      })
      .addCase(gettingDayClosing.rejected, (state, action) => {
        state.isloadingOne = false;
        toast.error(action.payload || "Could not load this day closing");
      });
  },
});

export const { clearSelectedClosing } = dayClosingSlice.actions;
export default dayClosingSlice.reducer;
