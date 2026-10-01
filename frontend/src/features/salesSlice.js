import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from 'react-hot-toast';

const initialState = {
  getallsales: null,
  isgetallsales: false,
  iscreatedsales: false,
  editedsales:null,
  searchdata:null

};


export const CreateSales = createAsyncThunk(
    'sales/createsales',
  async (Category, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post("sales/createsales", Category, { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "sales creation failed");
    }
  }
);

export const gettingallSales = createAsyncThunk(
  'sales/getallsales',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.get("sales/getallsales", { withCredentials: true });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "sales retrieval failed");
    }
  }
);


 
export const EditSales = createAsyncThunk(
  "sales/updatesales",
  async ({ salesId, updatedData }, { rejectWithValue }) => {
    if (!salesId) {
      toast.error("Invalid Sale ID");
      return rejectWithValue("Invalid Sale ID");
    }

    try {
      const response = await axiosInstance.put(
        `sales/updatesales/${salesId}`,
        updatedData, 
        { withCredentials: true }
      );
      toast.success("Sale updated successfully");
      return response.data;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Failed to update sale. Please try again.";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);


export const searchsalesdata=createAsyncThunk(
  'sales/searchdata',async (filters, { rejectWithValue }) => {
    try {
      // The sales page's filters: { query, payment, from, to }, every one
      // optional. A bare string is still read as the search text.
      //
      // Sent as axios params so they are encoded — product names are typed
      // here, and a name with a & or a # in it used to cut the search off at
      // that character. Empty values are left out rather than sent blank.
      const { query, payment, from, to } =
        typeof filters === "string" ? { query: filters } : filters || {};
      const params = Object.fromEntries(
        Object.entries({ query, payment, from, to }).filter(([, value]) => value),
      );
      const response = await axiosInstance.get("sales/searchdata", { params });
      return response.data;
 
     
   } catch (error) {
     return rejectWithValue(error.response?.data?.message || "sales adding failed");
   }
 })












const salesSlice = createSlice({
  name: "sales",
  initialState: initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
 
   
  
      .addCase(gettingallSales.pending, (state) => {
        state.isgetallsales = true;
      })
      .addCase(gettingallSales.fulfilled, (state, action) => {
        state.isgetallsales = false;
        state.getallsales = action.payload.sales;

      })
      
      
      .addCase(gettingallSales.rejected, (state, action) => {
        state.isgetallsales = false;
        toast.error(action.payload || 'Error retrieving sales');
      })



      .addCase(CreateSales.pending, (state) => {
        state.iscreatedsales = true;
      })
      .addCase(CreateSales.fulfilled, (state, action) => {
        state.iscreatedsales = false;
        state.getallsales.push(action.payload);
  
      })
      .addCase(CreateSales.rejected, (state, action) => {
        state.iscreatedsales = false;

      })


      .addCase(EditSales.fulfilled,(state,action)=>{
        state.editedsales=action.payload
       
       
       })
       
       
       .addCase(EditSales.rejected,(state,action)=>{
       

       })
       

       // Only the latest filter's answer is kept: changing payment and then
       // the search quickly sends two requests, and the slower, older one must
       // not land last and show rows for filters no longer chosen.
       .addCase(searchsalesdata.pending,(state,action)=>{
        state.searchRequest=action.meta.requestId
      })
       .addCase(searchsalesdata.fulfilled,(state,action)=>{
        if (state.searchRequest && state.searchRequest !== action.meta.requestId) return;
        state.searchdata=action.payload.sales
      })
      
     
      .addCase(searchsalesdata.rejected,(state,action)=>{

      })
    
    
      



  },
});

export default salesSlice.reducer;
