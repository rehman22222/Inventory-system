import React, { useEffect, useState } from "react";
import TopNavbar from "../Components/TopNavbar";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import FormattedTime from "../lib/FormattedTime ";
import Stocktanscationgraph from '../lib/Stocktanscationgraph'
import {
  createStockTransaction,
  getAllStockTransactions,
  searchstockdata
} from "../features/stocktransactionSlice";
import {
  gettingallSupplier
} from "../features/SupplierSlice";
import {
  gettingallproducts,
} from "../features/productSlice";
import toast from "react-hot-toast";

function StockTransaction() {
  const { t } = useTranslation();
  const { getallStocks, iscreatedStocks,searchdata } = useSelector(
    (state) => state.stocktransaction
  );

  const { getallSupplier } = useSelector(
    (state) => state.supplier
  );
  const { getallproduct } = useSelector(
    (state) => state.product
  );

  const dispatch = useDispatch();
const[query,setquery]=useState("");
  const [product, setproduct] = useState("");
  const [type, settype] = useState("");
  const [quantity, setquantity] = useState("");
  const [supplier, setsupplier] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);


  useEffect(() => {
    if ( query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(searchstockdata(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(getAllStockTransactions());
    }
  }, [query, dispatch]);





  useEffect(() => {
    dispatch(gettingallproducts({ view: "lookup" }));
    dispatch(getAllStockTransactions());
    dispatch(gettingallSupplier());

    
  }, [dispatch]);


  const resetForm = () => {
    setproduct("");
    settype("");
    setquantity("");
    setsupplier("");
  };


  const submitstocktranscation = async (event) => {
    event.preventDefault();
    const StocksData = {product, type,quantity , supplier };

    dispatch(createStockTransaction(StocksData))
      .unwrap()
      .then(() => {
        toast.success(t("stock.added"));
        resetForm();
      })
      .catch(() => {
        toast.error(t("stock.addFail"));
      });
  };



  
  const displaystock = query.trim() !== "" ?  searchdata : getallStocks;
  return (
    <div className="bg-base-200 min-h-screen">

<TopNavbar />


<Stocktanscationgraph className="mt-10"/>
<div className="mt-12 ml-5">
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={query}
            onChange={(e)=>setquery(e.target.value)}
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("stock.searchPlaceholder")}
          />
          <button
            onClick={() => {
              setIsFormVisible(true);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("stock.addStock")}
          </button>

        </div>



        {isFormVisible && (
          <div className="fixed right-0 top-0 z-50 flex h-svh w-full max-w-xl flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">{t("stock.addProductTitle")}</h1>
              <MdKeyboardDoubleArrowLeft
                onClick={() => setIsFormVisible(false)}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form onSubmit={submitstocktranscation} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <label className="text-sm">{t("stock.product")}</label>
                    <select
                      value={product}
                      onChange={(e) => setproduct(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    >
                      <option value="">{t("stock.selectProduct")}</option>
                      { getallproduct?.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("stock.type")}</label>
                    <select
                      value={type}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                      onChange={(e) => settype(e.target.value)}
                    >
                      <option value={"Stock-in"}>{t("stock.stockIn")}</option>
                      <option value={"Stock-out"}>{t("stock.stockOut")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm">{t("common.quantity")}</label>
                    <input
                      type="number"
                      placeholder={t("stock.quantityPlaceholder")}
                      value={quantity}
                      onChange={(e) => setquantity(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm">{t("stock.supplier")}</label>
                    <select
                      value={supplier}
                      onChange={(e) => setsupplier(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                    >
                      <option value="">{t("stock.selectSupplier")}</option>
                      { getallSupplier?.map((supplier) => (
                        <option key={supplier._id} value={supplier._id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  { iscreatedStocks ? t("stock.addingStock") : t("stock.addStock")}
                </button>
              </div>
            </form>
          </div>
        )}


<div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">{t("stock.listTitle")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr>
                <th className="px-3 py-2 border w-5">#</th>
                  <th className="px-3 py-2 border">{t("common.date")}</th>
                  <th className="px-3 py-2 border">{t("stock.product")}</th>
                  <th className="px-3 py-2 border">{t("stock.type")}</th>
                  <th className="px-3 py-2 border">{t("common.quantity")}</th>
                  <th className="px-3 py-2 border">{t("stock.supplier")}</th>

              
                </tr>
              </thead>
              <tbody>
                {Array.isArray( displaystock) &&
             displaystock.length > 0 ? (
              displaystock.map((Stocks,index) => (
                    <tr key={Stocks._id} >
                       <td className="px-3 py-2 border">{index+1}</td>
                       <td className="px-3 py-2 border">
                        <FormattedTime  timestamp={Stocks.transactionDate}/>
                       </td>
                      <td  className="px-3 py-2 border">{Stocks.product?.name || t("stock.noProduct")}</td>

                      <td className="px-3 py-2 border">
                        {Stocks.type === "Stock-in" ? t("stock.stockIn") : Stocks.type === "Stock-out" ? t("stock.stockOut") : Stocks.type}
                      </td>
                      <td className="px-3 py-2 border">{Stocks.quantity}</td>
                      <td  className="px-3 py-2 border">{Stocks.supplier?.name || t("stock.noSupplier")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center py-4">
                      {t("stock.noStocks")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>



        </div>

    </div>
  )
}

export default StockTransaction;
