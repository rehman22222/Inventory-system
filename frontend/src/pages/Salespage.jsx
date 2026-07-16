import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {gettingallproducts} from '../features/productSlice'
import FormattedTime from "../lib/FormattedTime ";
import {
  CreateSales,gettingallSales,EditSales, searchsalesdata, OverrideSalesReportTotal
} from "../features/salesSlice";
import SalesChart from '../lib/Salesgraph';
import ReportButton from "../Components/ReportButton";
import toast from "react-hot-toast";



function Salespage() {
  const { t } = useTranslation();
  const {   getallsales, searchdata,
     isoverridingReportTotal,
     } = useSelector(
    (state) => state.sales
  );
  const { Authuser } = useSelector((state) => state.auth);

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
  const [overrideTargetTotal, setOverrideTargetTotal] = useState("");



  useEffect(() => {
   dispatch(gettingallSales())
   dispatch(gettingallproducts())
  
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

  console.log("Updated Data:", updatedData); 

  dispatch(EditSales({ salesId: selectedSales._id, updatedData }))
    .unwrap()
    .then(() => {
      toast.success(t("sales.updated"));
      setIsFormVisible(false);
      setselectedSales(null);
      resetForm();
    })
    .catch((error) => {
      console.error("Error updating sale:", error);
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

  const getReportRange = () => {
    const base = fromDate || toDate || new Date().toISOString().slice(0, 10);
    return {
      from: fromDate || base,
      to: toDate || base,
    };
  };

  const isInReportRange = (sale) => {
    const { from, to } = getReportRange();
    const createdAt = new Date(sale?.createdAt);
    const start = new Date(`${from}T00:00:00.000`);
    const end = new Date(`${to}T23:59:59.999`);
    return createdAt >= start && createdAt <= end;
  };

  const reportCurrentTotal = Array.isArray(getallsales)
    ? getallsales
        .filter(isInReportRange)
        .reduce((sum, sale) => sum + Number(sale?.totalAmount || 0), 0)
    : 0;

  const submitReportOverride = async (event) => {
    event.preventDefault();
    const target = Number(overrideTargetTotal);

    if (!Number.isFinite(target) || target < 0) {
      toast.error(t("sales.overrideInvalid"));
      return;
    }

    const range = getReportRange();

    try {
      const result = await dispatch(
        OverrideSalesReportTotal({
          from: range.from,
          to: range.to,
          targetTotal: target,
        })
      ).unwrap();
      toast.success(
        t("sales.overrideSuccess", {
          count: result.updatedCount,
          total: Number(result.updatedTotal).toFixed(2),
        })
      );
      setOverrideTargetTotal("");
      dispatch(gettingallSales());
      if (query.trim() !== "") {
        dispatch(searchsalesdata(query));
      }
    } catch (error) {
      toast.error(error || t("sales.overrideFail"));
    }
  };
 







 const displaySales = query.trim() !== "" ? searchdata : getallsales;



  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />




      
      <div className="mt-12 ml-5">

        <SalesChart className=" mb-10" />

        {/* Sales report — date range + profit/loss summary */}
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
                reportKey="sales"
                label={t("sales.downloadReport")}
                params={{ from: fromDate || undefined, to: toDate || undefined }}
              />
            </div>
          </div>
          {Authuser?.role === "admin" && (
            <form
              onSubmit={submitReportOverride}
              className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t("sales.overrideTitle")}
                </p>
                <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/70">
                  {t("sales.overrideSub", {
                    total: reportCurrentTotal.toFixed(2),
                  })}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[180px_auto] md:items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    {t("sales.overrideTarget")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overrideTargetTotal}
                    onChange={(event) => setOverrideTargetTotal(event.target.value)}
                    className="h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-3 text-sm text-base-content"
                    placeholder="50000"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isoverridingReportTotal}
                  className="h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {isoverridingReportTotal ? t("sales.overrideSaving") : t("sales.overrideApply")}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <input
           value={query}
           onChange={(e)=>setquery(e.target.value)}
            type="text"
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("sales.searchPlaceholder")}
          />
          <button
            onClick={() => {
              setIsFormVisible(true);
              setselectedSales(null);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("sales.addSales")}
          </button>
        </div>

        {isFormVisible && (
          <div className="absolute top-10 right-0 z-50 h-svh w-80 bg-base-100 p-6 border-2 border-base-300 rounded-lg shadow-xl transition-transform transform">
            <div className="text-right">
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <h1 className="text-xl font-semibold mb-4">
              {selectedSales ? t("sales.editSales") : t("sales.addSales")}
            </h1>

            <form onSubmit={selectedSales ? handleEditSubmit : submitsales}>
              <div className="mb-4">
                <label>{t("common.name")}</label>
                <input
                  value={name}
                  placeholder={t("sales.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              <div className="mb-4 ">
                <label>{t("sales.product")}</label>
                <select
                  value={Product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                >
                  <option value="">{t("sales.selectProduct")}</option>
                  {getallproduct?.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label>{t("common.price")}</label>
                <input
                  type="number"
                  placeholder={t("sales.pricePlaceholder")}
                  value={Price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              <div className="mb-4">
                <label>{t("common.quantity")}</label>
                <input
                  type="number"
                  placeholder={t("sales.quantityPlaceholder")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>
         

              <div className="mb-4">
                <label>{t("sales.payment")}</label>
                <select className="w-full h-10 px-2 border-2 rounded-lg mt-2"
                 value={Payment} onChange={(e)=>setPayment(e.target.value)}>
                  <option value="">{t("sales.selectPayment")}</option>
                  <option value={"cash"}>{t("common.payments.cash")}</option>
                  <option value={"creditcard"}>{t("common.payments.creditcard")}</option>
                  <option value={"wallet"}>{t("common.payments.wallet")}</option>

                </select>
              </div>


              <div className="mb-4">
                <label>{t("sales.paymentStatus")}</label>
                <select className="w-full h-10 px-2 border-2 rounded-lg mt-2" value={paymentStatus} onChange={(e)=>setpaymentStatus(e.target.value)}>
                  <option value="">{t("sales.selectPaymentStatus")}</option>
                  <option value={"pending"}>{t("common.statuses.pending")}</option>
                  <option value={"paid"}>{t("common.statuses.paid")}</option>

                </select>
              </div>


              <div className="mb-4">
                <label>{t("sales.statusLabel")}</label>
                <select className="w-full h-10 px-2 border-2 rounded-lg mt-2" value={Status} onChange={(e)=>setStatus(e.target.value)}>
                  <option value="">{t("sales.selectStatus")}</option>
                  <option value={"pending"}>{t("common.statuses.pending")}</option>
                  <option value={"completed"}>{t("common.statuses.completed")}</option>
                  <option value={"cancelled"}>{t("common.statuses.cancelled")}</option>

                </select>
              </div>


              <button
                type="submit"
                className="bg-blue-800 text-white w-full h-12 rounded-lg hover:bg-blue-700 mt-4"
              >
                    {selectedSales ? t("sales.editSalesBtn") : t("sales.addSalesBtn")}
              </button>
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
                  <th className="px-3 py-2  border bg-base-100">{t("common.operations")}</th>
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
                       $ {sales?.totalAmount}
                      </td>

                      <td className="px-3 py-2 border">
                        {sales?.status ? t(`common.statuses.${sales.status}`, sales.status) : ""}
                      </td>
                      <td className="px-3 py-2 border">< FormattedTime  timestamp={sales?.createdAt}/></td>
                      <td className="px-3 py-2 border">{sales?.paymentMethod ? t(`common.payments.${sales.paymentMethod}`, sales.paymentMethod) : ""}</td>

                      <td className="px-3 py-2 border">
                        {sales?.paymentStatus ? t(`common.statuses.${sales.paymentStatus}`, sales.paymentStatus) : ""}
                      </td>

                      <td className="px-4  py-2 border">
                        <button
                         onClick={()=> handleEditClick(sales)}
                          className="h-10 w-24 bg-green-500 ml-10 hover:bg-green-700 rounded-md text-white"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
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
