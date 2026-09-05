import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

/* The till's quick-sell cards.
 *
 * Server-held, so one set serves every till in the shop: a card made at the
 * counter appears on the other terminal without anybody doing anything, and it
 * survives a cleared browser. Same reasoning as deals and vouchers.
 *
 * A card is an ordinary product carrying `nonStock` — see the backend's
 * Productmodel — so what lands in the basket here goes through exactly the same
 * addToCart the scanner uses. Nothing downstream needs to know it came from a
 * card rather than from a barcode.
 */

const initialState = {
  cards: [],
  isLoading: false,
  isSaving: false,
};

export const getQuickSellCards = createAsyncThunk(
  "quickSell/list",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("product/quick-sell");
      return response.data?.cards || [];
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Could not load the quick-sell cards",
      );
    }
  },
);

export const createQuickSellCard = createAsyncThunk(
  "quickSell/create",
  async (card, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("product/quick-sell", card);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Could not create the card",
      );
    }
  },
);

export const removeQuickSellCard = createAsyncThunk(
  "quickSell/remove",
  async (productId, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`product/quick-sell/${productId}`);
      return productId;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Could not remove the card",
      );
    }
  },
);

const quickSellSlice = createSlice({
  name: "quickSell",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(getQuickSellCards.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getQuickSellCards.fulfilled, (state, action) => {
        state.isLoading = false;
        state.cards = action.payload;
      })
      .addCase(getQuickSellCards.rejected, (state) => {
        state.isLoading = false;
        // Deliberately quiet. The cards are a convenience; a till that cannot
        // reach them can still scan, and a red toast on every POS load would
        // train the cashier to ignore toasts that matter.
      })

      .addCase(createQuickSellCard.pending, (state) => {
        state.isSaving = true;
      })
      .addCase(createQuickSellCard.fulfilled, (state, action) => {
        state.isSaving = false;
        const card = action.payload?.card;
        if (!card) return;

        // The server answers with the existing card when the same name and
        // price are sent twice, so guard against showing it on the rail twice.
        const already = state.cards.some(
          (entry) => String(entry._id) === String(card._id),
        );
        if (!already) state.cards.push(card);

        toast.success(
          action.payload?.existed ? "That card is already here" : "Card added",
        );
      })
      .addCase(createQuickSellCard.rejected, (state, action) => {
        state.isSaving = false;
        toast.error(action.payload || "Could not create the card");
      })

      .addCase(removeQuickSellCard.fulfilled, (state, action) => {
        state.cards = state.cards.filter(
          (card) => String(card._id) !== String(action.payload),
        );
        toast.success("Card removed");
      })
      .addCase(removeQuickSellCard.rejected, (_state, action) => {
        toast.error(action.payload || "Could not remove the card");
      });
  },
});

export default quickSellSlice.reducer;
