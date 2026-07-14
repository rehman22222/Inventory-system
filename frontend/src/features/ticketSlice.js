import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";

const initialState = {
  tickets: [],
  counts: null,
  isloading: false,
  iscreating: false,
  isreplying: false,
};

export const CreateTicket = createAsyncThunk(
  "ticket/create",
  async (ticket, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("ticket/create", ticket, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not raise ticket");
    }
  }
);

// An admin gets their own tickets; the super admin gets every shop's.
export const gettingallTickets = createAsyncThunk(
  "ticket/all",
  async (status, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("ticket", {
        params: status ? { status } : undefined,
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not load tickets");
    }
  }
);

export const ReplyToTicket = createAsyncThunk(
  "ticket/reply",
  async ({ ticketId, message }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(
        `ticket/${ticketId}/reply`,
        { message },
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not send reply");
    }
  }
);

export const UpdateTicketStatus = createAsyncThunk(
  "ticket/status",
  async ({ ticketId, status }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.put(
        `ticket/${ticketId}/status`,
        { status },
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not update ticket");
    }
  }
);

const replaceTicket = (state, updated) => {
  state.tickets = state.tickets.map((ticket) =>
    ticket._id === updated._id ? updated : ticket
  );
};

const ticketSlice = createSlice({
  name: "ticket",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(gettingallTickets.pending, (state) => {
        state.isloading = true;
      })
      .addCase(gettingallTickets.fulfilled, (state, action) => {
        state.isloading = false;
        state.tickets = action.payload.tickets || [];
        state.counts = action.payload.counts || null;
      })
      .addCase(gettingallTickets.rejected, (state, action) => {
        state.isloading = false;
        toast.error(action.payload || "Could not load tickets");
      })

      .addCase(CreateTicket.pending, (state) => {
        state.iscreating = true;
      })
      .addCase(CreateTicket.fulfilled, (state, action) => {
        state.iscreating = false;
        state.tickets.unshift(action.payload.ticket);
        toast.success(`Ticket ${action.payload.ticket.reference} raised`);
      })
      .addCase(CreateTicket.rejected, (state, action) => {
        state.iscreating = false;
        toast.error(action.payload || "Could not raise ticket");
      })

      .addCase(ReplyToTicket.pending, (state) => {
        state.isreplying = true;
      })
      .addCase(ReplyToTicket.fulfilled, (state, action) => {
        state.isreplying = false;
        replaceTicket(state, action.payload.ticket);
      })
      .addCase(ReplyToTicket.rejected, (state, action) => {
        state.isreplying = false;
        toast.error(action.payload || "Could not send reply");
      })

      .addCase(UpdateTicketStatus.fulfilled, (state, action) => {
        replaceTicket(state, action.payload.ticket);
        toast.success(action.payload.message);
      })
      .addCase(UpdateTicketStatus.rejected, (state, action) => {
        toast.error(action.payload || "Could not update ticket");
      });
  },
});

export default ticketSlice.reducer;
