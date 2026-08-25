import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";
import toast from 'react-hot-toast';



const initialState={
    getallproduct:[],
    isallproductget:false,
    isproductadd:false,
    isproductremove:false,
    searchdata:null,
    issearchdata:false,
    editedProduct:null,
    iseditedProduct:false,
    gettopproduct:null
  
}



export const Addproduct=createAsyncThunk('product/addproduct',async(product,{rejectWithValue})=>{
    try {
       const response=await axiosInstance.post("product/addproduct",product,{ withCredentials: true,})
       return response.data;
  
      
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Product adding failed");
    }
  })


  export const Removeproduct=createAsyncThunk('product/removeproduct',async(productId,{rejectWithValue})=>{
    try {
       const response=await axiosInstance.delete(`product/removeproduct/${productId}`,productId,{ withCredentials: true,})
       return response.data;
  
      
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Product remove failed");
    }
  })

  
  export const EditProduct = createAsyncThunk(
    'product/editproduct',
    async ({ id, formData }, { rejectWithValue }) => {
      try {
        const response = await axiosInstance.put(
          `product/editproduct/${id}`,
          formData,
          { withCredentials: true }
        );
        return response.data;
      } catch (error) {
        const errorMessage = error.response?.data?.message || "Failed to update product. Please try again.";
        return rejectWithValue(errorMessage);
      }
    }
  );




  export const gettingallproducts=createAsyncThunk('product/getproduct',async(options = {},{rejectWithValue})=>{
    try {
       const response=await axiosInstance.get("product/getproduct",{
         withCredentials: true,
         params: options || {},
       })
       return response.data;
  
      
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Product getting failed");
    }
  })



   export const Searchproduct=createAsyncThunk('product/searchproduct',async(query,{rejectWithValue})=>{
    try {
       const response=await axiosInstance.get(`product/searchproduct?query=${query}`,query,{ withCredentials: true,})
       return response.data;
  
      
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Product adding failed");
    }
  })

  export const generateRandomBarcodes=createAsyncThunk('product/generateRandom',async(payload,{rejectWithValue})=>{
    try {
       const response=await axiosInstance.post("product/generate-random",payload,{ withCredentials: true,})
       return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Could not generate barcodes");
    }
  })

  export const getTopProductsByQuantity=createAsyncThunk('product/getTopProductsByQuantity',async(_,{rejectWithValue})=>{
    try {
       const response=await axiosInstance.get(`product/getTopProductsByQuantity`,_,{ withCredentials: true,})
       return response.data;
  
      
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Product getting failed");
    }
  })







const productSlice = createSlice({
name:"product",
initialState:initialState,
reducers:{
  // A sale somewhere else moved this product's stock. Patch the one number
  // rather than refetching the catalogue: with several tills open, reloading
  // 1,600 products on every sale anywhere is the stampede this avoids.
  // The till just sold these. Subtract locally instead of refetching a 370 KB
  // catalogue to learn a number we already know — the socket event arrives with
  // the absolute figure a moment later and lands on the same value.
  stockSold: (state, action) => {
    for (const line of action.payload || []) {
      const id = String(line?.product || "");
      const sold = Number(line?.quantity);
      if (!id || !Number.isFinite(sold)) continue;
      const product = state.getallproduct.find((entry) => String(entry._id) === id);
      if (product) product.quantity = Math.max(0, Number(product.quantity || 0) - sold);
    }
  },
  stockChanged: (state, action) => {
    const { productId, quantity } = action.payload || {};
    if (!productId || !Number.isFinite(Number(quantity))) return;
    const product = state.getallproduct.find(
      (entry) => String(entry._id) === String(productId),
    );
    if (product) product.quantity = Number(quantity);
  },
},
extraReducers:(builder)=>{
  builder



 .addCase( gettingallproducts.pending,(state)=>{

    state.isallproductget=true
  
  })
  .addCase(gettingallproducts.fulfilled, (state, action) => {
    state.isallproductget = false;
    state.getallproduct = action.payload.Products || [];
  })
  
 
  .addCase( gettingallproducts.rejected,(state,action)=>{
     state.isallproductget=false
   toast.error( action.payload|| 'Error In adding product logout');
  })


  .addCase(Removeproduct.pending,(state)=>{

    state.isproductremove=true
  
  })
  

  .addCase(Removeproduct.fulfilled, (state, action) => {
    state.isproductremove = false;
    state.getallproduct = state.getallproduct.filter(product => product._id !== action.meta.arg);

  })
  
  
 
  .addCase( Removeproduct.rejected,(state,action)=>{
     state.isproductremove=false

  })



  .addCase(Addproduct.pending,(state)=>{

    state.isproductadd=true
  
  })
  .addCase(Addproduct.fulfilled,(state,action)=>{
   state.isproductadd=false
   const created = action.payload?.product || action.payload;
   if (!Array.isArray(state.getallproduct)) {
     state.getallproduct = [];
   }
   if (Array.isArray(state.getallproduct) && created?._id) {
     state.getallproduct.push(created);
   }
  })
  
 
  .addCase(Addproduct.rejected,(state,action)=>{
     state.isproductadd=false   

  
  })




  .addCase(  Searchproduct.pending,(state)=>{
     state.issearchdata=true

  
  })
  .addCase( Searchproduct.fulfilled,(state,action)=>{
    state.issearchdata=false 
    state.searchdata=action.payload
 
 
  })
  
 
  .addCase(   Searchproduct.rejected,(state,action)=>{
    state.issearchdata=false
  
  })




  .addCase(EditProduct.pending,(state)=>{
    state.iseditedProduct=true

 
 })
 .addCase(EditProduct.fulfilled,(state,action)=>{
   state.iseditedProduct=false 
   state.editedProduct=action.payload


 })
 

 .addCase( EditProduct.rejected,(state,action)=>{
   state.iseditedProduct=false
  
 })




 .addCase( getTopProductsByQuantity.fulfilled,(state,action)=>{

  state.gettopproduct=action.payload.topProducts || []


})


.addCase(  getTopProductsByQuantity.rejected,(state,action)=>{

 toast.error( 'Error In founding  product');
})








}
  


});





export const { stockChanged, stockSold } = productSlice.actions;

export default productSlice.reducer;
