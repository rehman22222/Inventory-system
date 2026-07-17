
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/authSlice";
import productReducer from "../features/productSlice"
import categoryReducer from "../features/categorySlice"
import supplierReducer from "../features/SupplierSlice"
import  activityReducer from '../features/activitySlice'
import orderReducer from "../features/orderSlice"
import notificationReducer from  "../features/notificationSlice"
import stocktransactionReducer from '../features/stocktransactionSlice'
import salesReducer from "../features/salesSlice"
import voucherReducer from "../features/voucherSlice"
import dealReducer from "../features/dealSlice"
import dayClosingReducer from "../features/dayClosingSlice"
import storeSettingsReducer from "../features/storeSlice"
import ticketReducer from "../features/ticketSlice"
import approvalReducer from "../features/approvalSlice"
import reorderReducer from "../features/reorderSlice"

const store=configureStore({
    reducer:{
        auth:authReducer,
        product:productReducer,
        category:categoryReducer,
        supplier:supplierReducer,
        activity:activityReducer,
        order:orderReducer,
        notification:notificationReducer,
        stocktransaction:stocktransactionReducer,
        sales:salesReducer,
        voucher:voucherReducer,
        deal:dealReducer,
        dayClosing:dayClosingReducer,
        store:storeSettingsReducer,
        ticket:ticketReducer,
        approval:approvalReducer,
        reorder:reorderReducer
    }
})
export default store;