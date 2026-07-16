import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import SHOP_DEFAULTS from "../config/shop";

// The shop's own details. Loaded from the server so renaming the shop does not
// need a redeploy; SHOP_DEFAULTS is only the fallback for a till that has never
// managed to reach the server.
const initialState = {
  store: SHOP_DEFAULTS,
  isloading: false,
  issaving: false,
};

export const gettingStore = createAsyncThunk(
  "store/get",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("store", { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not load store details");
    }
  }
);

export const UpdateStore = createAsyncThunk(
  "store/update",
  async (changes, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.put("store", changes, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not save store details");
    }
  }
);

const storeSlice = createSlice({
  name: "store",
  initialState,
  reducers: {
    // Used by the POS to seed from its offline cache before the fetch lands.
    hydrateStore: (state, action) => {
      if (action.payload) state.store = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(gettingStore.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingStore.fulfilled, (state, action) => {
        state.isloading = false;
        if (action.payload.store) state.store = action.payload.store;
      })
      .addCase(gettingStore.rejected, (state) => {
        state.isloading = false;
        // Offline or unauthorised — keep whatever we already have.
      })

      .addCase(UpdateStore.pending, (state) => {
        state.issaving = true;
      })
      .addCase(UpdateStore.fulfilled, (state, action) => {
        state.issaving = false;
        if (action.payload.store) state.store = action.payload.store;
        toast.success("Store details saved");
      })
      .addCase(UpdateStore.rejected, (state, action) => {
        state.issaving = false;
        toast.error(action.payload || "Could not save store details");
      });
  },
});

export const { hydrateStore } = storeSlice.actions;
export default storeSlice.reducer;
