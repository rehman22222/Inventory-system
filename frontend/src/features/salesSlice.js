import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from 'react-hot-toast';

const initialState = {
  getallsales: null,
  isgetallsales: false,
  iscreatedsales: false,
  isoverridingReportTotal: false,
  overrideResult: null,
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
      console.error("EditSales Error:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to update sale. Please try again.";
      toast.error(errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);


export const searchsalesdata=createAsyncThunk(
  'sales/searchdata',async (query, { rejectWithValue }) => {
    try {
      const response=await axiosInstance.get(`sales/searchdata?query=${query}`,query,{ withCredentials: true,})
      return response.data;
 
     
   } catch (error) {
     return rejectWithValue(error.response?.data?.message || "sales adding failed");
   }
 })

export const OverrideSalesReportTotal = createAsyncThunk(
  'sales/overrideReportTotal',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.patch("sales/override-report-total", payload, {
        withCredentials: true,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Sales report total override failed");
    }
  }
)











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



      .addCase( CreateSales .pending, (state) => {
        state.iscreatedsales = true;
      })
      .addCase( CreateSales .fulfilled, (state, action) => {
        state.iscreatedsales = false;
        state.getallsales.push(action.payload);
  
      })
      .addCase( CreateSales .rejected, (state, action) => {
        state.iscreatedsales = false;

      })


      .addCase(EditSales.fulfilled,(state,action)=>{
        state.editedsales=action.payload
       
       
       })
       
       
       .addCase(EditSales.rejected,(state,action)=>{
       

       })
       

       .addCase(searchsalesdata.fulfilled,(state,action)=>{
       
        state.searchdata=action.payload.sales
     
     
      })
      
     
      .addCase(searchsalesdata.rejected,(state,action)=>{

      })

      .addCase(OverrideSalesReportTotal.pending, (state) => {
        state.isoverridingReportTotal = true;
      })
      .addCase(OverrideSalesReportTotal.fulfilled, (state, action) => {
        state.isoverridingReportTotal = false;
        state.overrideResult = action.payload;
      })
      .addCase(OverrideSalesReportTotal.rejected, (state, action) => {
        state.isoverridingReportTotal = false;
        toast.error(action.payload || "Sales report total override failed");
      })
    
    
      



  },
});

export default salesSlice.reducer;
