import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { FiLock } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {gettingallproducts} from '../features/productSlice'
import FormattedTime from "../lib/FormattedTime ";
import {
  CreateSales,gettingallSales,EditSales, searchsalesdata
} from "../features/salesSlice";
import SalesChart from '../lib/Salesgraph';
import ReportButton from "../Components/ReportButton";
import DayClosingModal from "../Components/pos/DayClosingModal";
import { currency } from "../Components/pos/posUtils";
import toast from "react-hot-toast";



function Salespage() {
  const { t } = useTranslation();
  const { getallsales, searchdata } = useSelector((state) => state.sales);
  const { Authuser } = useSelector((state) => state.auth);

  // Adding/editing sales and pulling the Sales Report are owner/admin actions.
  // A manager can only view and CLOSE the day here (backend enforces the same).
  const canManageSales = ["admin", "superadmin"].includes(Authuser?.role);

  const { getallproduct } = useSelector(
    (state) => state.product
  );
  const dispatch = useDispatch();
  const [query, setquery] = useState("");

  const [name, setName] = useState("");
  const [Product, setProduct] = useState("");
  const [Payment, setPayment] = useState("");
  const [Price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [paymentStatus , setpaymentStatus]=useState("");
  const[Status,setStatus]=useState("")
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedSales, setselectedSales] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // End-of-shift close, also available here (not just at the POS till).
  const [showCloseDay, setShowCloseDay] = useState(false);



  useEffect(() => {
   dispatch(gettingallSales())
   dispatch(gettingallproducts({ view: "lookup" }))
  
  }, [dispatch]);

 
  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch( searchsalesdata(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(gettingallSales());
    }
  }, [query, dispatch]);


 
  
 


  

  
 const handleEditSubmit = (event) => {
  event.preventDefault();
  if (!selectedSales) return;

  const updatedData = {
    customerName: name,
    products: {
      product: Product, 
      quantity: Number(quantity),
      price: Number(Price)
    },
    paymentMethod: Payment,
    paymentStatus,
    status: Status
  };

  dispatch(EditSales({ salesId: selectedSales._id, updatedData }))
    .unwrap()
    .then(() => {
      toast.success(t("sales.updated"));
      setIsFormVisible(false);
      setselectedSales(null);
      resetForm();
    })
    .catch(() => {
      toast.error(t("sales.updateFail"));
    });
};


  const submitsales = async (event) => {
    event.preventDefault();
  
    const salesData = {
      customerName: name, 
      products: { product: Product, quantity, price: Price }, 
      paymentMethod: Payment, 
      paymentStatus,
      status: Status
    };
  
    dispatch(CreateSales(salesData))
      .unwrap()
      .then(() => {
        toast.success(t("sales.added"));
        resetForm();
      })
      .catch(() => {
        toast.error(t("sales.addFail"));
      });
  };
  




  const resetForm = () => {
    setName("");
    setProduct("");
    setPayment("");
    setPrice("");
    setQuantity("");
    setpaymentStatus("");
    setStatus("");

  };
  
  const handleEditClick = (sales) => {
    setselectedSales(sales);
    setName(sales.customerName);
    setProduct(sales.products?.product._id || "");
    setPayment(sales.paymentMethod);
    setPrice(sales.products?.price || "");
    setQuantity(sales.products?.quantity || "");
    setpaymentStatus(sales.paymentStatus);
    setStatus(sales.status);
    setIsFormVisible(true); 
  };






 const displaySales = query.trim() !== "" ? searchdata : getallsales;



  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />




      
      <div className="mt-12 ml-5">

        <SalesChart className=" mb-10" />

        {/* Sales report — date range + profit/loss summary. Owner/admin only. */}
        {canManageSales && (
        <div className="mr-5 mb-8 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-base-content">{t("sales.reportTitle")}</h3>
              <p className="mt-1 text-sm text-base-content/60">
                {t("sales.reportSub")}
              </p>
            </div>
             <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">{t("sales.from")}</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">{t("sales.to")}</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10 rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
                />
              </div>
              <ReportButton
                reportKey="pos-sales"
                label="POS Report"
                params={{ from: fromDate || undefined, to: toDate || undefined }}
              />
              <ReportButton
                reportKey="online-sales"
                label="Online Report"
                params={{ from: fromDate || undefined, to: toDate || undefined }}
              />
              <ReportButton
                reportKey="combined-sales"
                label="POS + Online Report"
                params={{ from: fromDate || undefined, to: toDate || undefined }}
              />
            </div>
          </div>
        </div>
        )}

        <div className="flex items-center space-x-4">
          <input
           value={query}
           onChange={(e)=>setquery(e.target.value)}
            type="text"
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("sales.searchPlaceholder")}
          />
          {canManageSales && (
          <button
            onClick={() => {
              setIsFormVisible(true);
              setselectedSales(null);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("sales.addSales")}
          </button>
          )}
          {/* Close the day from here too — hands this cashier's open takings over
              (up the chain) and clears them from their own view. */}
          <button
            onClick={() => setShowCloseDay(true)}
            className="flex h-12 w-44 items-center justify-center rounded-lg border-2 border-blue-800 font-semibold text-blue-800 transition hover:bg-blue-800 hover:text-white"
          >
            <FiLock className="mr-2 text-lg" /> {t("sales.closeDay")}
          </button>
        </div>

        {showCloseDay && (
          <DayClosingModal
            onClose={() => setShowCloseDay(false)}
            onClosed={() => {
              setShowCloseDay(false);
              // Closed rows leave this cashier's scope — refresh so the list and
              // revenue reset to their new (open) state.
              dispatch(gettingallSales());
            }}
          />
        )}

        {isFormVisible && (
          <div className="fixed right-0 top-0 z-50 flex h-svh w-full max-w-2xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedSales ? t("sales.editSales") : t("sales.addSales")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form
              onSubmit={selectedSales ? handleEditSubmit : submitsales}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <label className="text-sm">{t("common.name")}</label>
                    <input
                      value={name}
                      placeholder={t("sales.namePlaceholder")}
                      onChange={(e) => setName(e.target.value)}
                      type="text"
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("sales.product")}</label>
                    <select
                      value={Product}
                      onChange={(e) => setProduct(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    >
                      <option value="">{t("sales.selectProduct")}</option>
                      {getallproduct?.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("common.price")}</label>
                    <input
                      type="number"
                      placeholder={t("sales.pricePlaceholder")}
                      value={Price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("common.quantity")}</label>
                    <input
                      type="number"
                      placeholder={t("sales.quantityPlaceholder")}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div>
                    <label className="text-sm">{t("sales.payment")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={Payment}
                      onChange={(e) => setPayment(e.target.value)}
                    >
                      <option value="">{t("sales.selectPayment")}</option>
                      <option value={"cash"}>{t("common.payments.cash")}</option>
                      <option value={"creditcard"}>{t("common.payments.creditcard")}</option>
                      <option value={"wallet"}>{t("common.payments.wallet")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("sales.paymentStatus")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={paymentStatus}
                      onChange={(e) => setpaymentStatus(e.target.value)}
                    >
                      <option value="">{t("sales.selectPaymentStatus")}</option>
                      <option value={"pending"}>{t("common.statuses.pending")}</option>
                      <option value={"paid"}>{t("common.statuses.paid")}</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("sales.statusLabel")}</label>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      value={Status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">{t("sales.selectStatus")}</option>
                      <option value={"pending"}>{t("common.statuses.pending")}</option>
                      <option value={"completed"}>{t("common.statuses.completed")}</option>
                      <option value={"cancelled"}>{t("common.statuses.cancelled")}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedSales ? t("sales.editSalesBtn") : t("sales.addSalesBtn")}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">{t("sales.salesList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr>
                <th className="px-3 py-2 border w-5 bg-base-100">#</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.customerName")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.product")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.totalAmount")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.statusLabel")}</th>
                  <th className="px-3 py-2  border bg-base-100">{t("common.date")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.paymentMethod")}</th>
                  <th className="px-3 py-2 border bg-base-100">{t("sales.paymentStatus")}</th>
                  {canManageSales && (
                    <th className="px-3 py-2  border bg-base-100">{t("common.operations")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-base-100">
                {Array.isArray(displaySales) &&
               displaySales.length > 0 ? (
                displaySales.map((sales,index) => (
                    <tr key={sales?._id} className="">
                       <td className="px-3 py-2 border">{index+1}</td>
                      <td className="px-3 py-2 border">{sales?.customerName
                      }</td>
                      <td className="px-3 py-2 border">
                      {sales.products?.product?.name || t("sales.noProduct")}
                      </td>
                      <td className="px-3 py-2 border">
                       {currency(sales?.totalAmount)}
                      </td>

                      <td className="px-3 py-2 border">
                        {sales?.status ? t(`common.statuses.${sales.status}`, sales.status) : ""}
                      </td>
                      <td className="px-3 py-2 border">< FormattedTime  timestamp={sales?.createdAt}/></td>
                      <td className="px-3 py-2 border">{sales?.paymentMethod ? t(`common.payments.${sales.paymentMethod}`, sales.paymentMethod) : ""}</td>

                      <td className="px-3 py-2 border">
                        {sales?.paymentStatus ? t(`common.statuses.${sales.paymentStatus}`, sales.paymentStatus) : ""}
                      </td>

                      {canManageSales && (
                      <td className="px-4  py-2 border">
                        <button
                         onClick={()=> handleEditClick(sales)}
                          className="h-10 w-24 bg-green-500 ml-10 hover:bg-green-700 rounded-md text-white"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className=" bg-base-100 text-center py-4">
                      {t("sales.noSales")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}



export default Salespage
