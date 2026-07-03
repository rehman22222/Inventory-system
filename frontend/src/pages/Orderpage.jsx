import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import TopNavbar from "../Components/TopNavbar";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { IoMdAdd } from "react-icons/io";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { signup } from "../features/authSlice";
import FormattedTime from "../lib/FormattedTime ";
import OrderStatusChart from "../lib/OrderStatusChart"
import {
  createdOrder,
  Removedorder,
  updatestatusOrder,
  gettingallOrder,
  SearchOrder,
 
} from "../features/orderSlice";

import { gettingallproducts } from "../features/productSlice";
import { gettingallCategory } from "../features/categorySlice";

function Orderpage() {
  const { t } = useTranslation();
  const {
    getorder,
    isgetorder,
    isorderadd,
    isorderremove,
    editorder,
    iseditorder,
    searchdata,
    isshowgraph,
  statusgraph
  } = useSelector((state) => state.order);
  const { getallproduct } = useSelector((state) => state.product);
  const { getallCategory } = useSelector((state) => state.category);
  const { Authuser, isUserSignup } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [status, setstatus] = useState(false);
  const [query, setquery] = useState("");
  const [Product, setProduct] = useState("");
  const [Price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [Description, setDescription] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedOrder, setselectedOrder] = useState(null);

  useEffect(() => {
    dispatch(gettingallOrder());
    dispatch(gettingallproducts());
    dispatch(gettingallCategory());
 
  }, [dispatch,Authuser]);

  useEffect(() => {
    dispatch(gettingallOrder());
 
  }, [dispatch,  editorder]);











  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(SearchOrder(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(gettingallOrder());
    }
  }, [query, dispatch]);

  const handleEditSubmit = (event) => {
    event.preventDefault();


    if (!selectedOrder) return;

    const updatedData = {
      user: Authuser?.id || " ",
      description: Description,
      status,
      products: {
        
          product: Product,
          quantity: Number(quantity),
          Price: Number(Price),
        
      },
    };
    
    dispatch( updatestatusOrder({ OrderId: selectedOrder._id,  updatedData }))
      .unwrap()
      .then(() => {
        toast.success(t("orders.updated"));
        setIsFormVisible(false);
        setselectedOrder(null);
        resetForm();
      })
      .catch(() => {
        toast.error(t("orders.updateFail"));
      });
  };

  const submitOrder = async (event) => {
    event.preventDefault();
  

    if (!Product || !Price || !quantity) {
      toast.error(t("orders.requiredFields"));
      return;
    }
  
    const orderData = {
      user: Authuser?.id || "",
      Description,
      status,
      Product: {
        product: Product,  
        price: Number(Price), 
        quantity: Number(quantity)
      }
    };
  
    try {
      const result = await dispatch(createdOrder(orderData)).unwrap();
      toast.success(t("orders.created"));
      resetForm();
    } catch (error) {
      console.error("Order creation failed:", error);
      toast.error(error.message || t("orders.createFail"));
    }
  };

  const resetForm = () => {
    setProduct("");
    setPrice("");
    setQuantity("");
    setDescription("");
    setstatus("");
  };

  const handleEditClick = (order) => {
    setselectedOrder(order);
    setProduct(order.Product.product?._id || "");
    setPrice(order.Product?.price|| "");
    setQuantity(order.Product?.quantity|| "");
    setstatus(order.status|| "");
    setDescription(order.Description|| "");
    setIsFormVisible(true);
  };

  const handleremove = async (OrderId) => {
    dispatch( Removedorder(OrderId))
      .unwrap()
      .then(() => {
        toast.success(t("orders.removed"));
      })
      .catch((error) => {
        toast.error(error || t("orders.removeFail"));
      });
  };

  const displayOrder = query.trim() !== "" ? searchdata : getorder;




  


  return (
    <div className="bg-base-200 min-h-screen">
      <TopNavbar />

      < OrderStatusChart className="mt-10 mb-10 mx-auto"/>

      <div className="mt-12 ml-5">
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setquery(e.target.value)}
            className="w-full md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"
            placeholder={t("orders.searchPlaceholder")}
          />
          <button
            onClick={() => {
              setIsFormVisible(true);
              setselectedOrder(null);
            }}
            className="bg-blue-800 text-white w-40 h-12 rounded-lg flex items-center justify-center"
          >
            <IoMdAdd className="text-xl mr-2" /> {t("orders.addOrder")}
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
              {selectedOrder ? t("orders.editOrder") : t("orders.addOrder")}
            </h1>

            <form onSubmit={selectedOrder ? handleEditSubmit : submitOrder}>
              <div className="mb-4">
                <label>{t("orders.product")}</label>
                <select
                  value={Product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                >
                  <option value="">{t("orders.selectProduct")}</option>
                  {getallproduct?.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label>{t("common.description")}</label>
                <input
                  value={Description}
                  placeholder={t("orders.descPlaceholder")}
                  onChange={(e) => setDescription(e.target.value)}
                  type="text"
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              <div className="mb-4">
                <label>{t("common.price")}</label>
                <input
                  type="number"
                  placeholder={t("orders.pricePlaceholder")}
                  value={Price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              <div className="mb-4">
                <label>{t("common.quantity")}</label>
                <input
                  type="number"
                  placeholder={t("orders.quantityPlaceholder")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              <div className="mb-4">
                <label className="block">{t("orders.status")}</label>
                <select
                  className="mt-3 w-72 h-10 mb-6"
                  value={status}
                  onChange={(e) => setstatus(e.target.value)}
                >
                   <option value="">{t("orders.selectStatus")}</option>
                  <option value="pending">{t("common.statuses.pending")}</option>
                  <option value="shipped">{t("common.statuses.shipped")}</option>
                  <option value="delivered">{t("common.statuses.delivered")}</option>
                </select>
              </div>

              <button
                type="submit"
                className="bg-blue-800 text-white w-full h-12 rounded-lg hover:bg-blue-700 mt-4"
              >
                {selectedOrder ? t("orders.updateOrder") : t("orders.addOrderBtn")}
              </button>
            </form>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">{t("orders.orderList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr className="bg-base-100">
                  <th className="px-3 py-2 bg-base-100 border w-5">#</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.product")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.quantity")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.price")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.description")}</th>
                  <th className="px-3 py-2  bg-base-100  border">{t("orders.totalAmount")}</th>
                  <th className="px-3 py-2 bg-base-100  border">{t("orders.status")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.createdBy")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("orders.timestamp")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.operations")}</th>
                </tr>
              </thead>

              
              <tbody className="bg-base-100">
                {Array.isArray(displayOrder) && displayOrder.length > 0 ? (
           
                  displayOrder.map((order, index) => (
                  

                    <tr key={order?._id} className="bg-base-100">
                      <td className="px-3 py-2 border">{index + 1}</td>
                      <td className="px-3 py-2 border">book</td>{" "}
                      
                      <td className="px-3 py-2 border">
                        {order.Product?.quantity}
                      </td>
                      <td className="px-3 py-2 border">
                        ${order.Product?.price}
                      </td>
                      <td className="px-3 py-2 border">{order?.Description}</td>
                 
                      <td className="px-3 py-2 border">{order?.totalAmount}</td>
                      <td className="px-3 py-2 border">{order?.status ? t(`common.statuses.${order.status}`, order.status) : ""}</td>
                      <td className="px-3 py-2 border">{order.user?.name}</td>
                      <td className="px-3 py-2 border">
                        <FormattedTime timestamp={order?.createdAt} />
                      </td>
                      <td className="px-4 py-2 grid grid-cols-1 border">
                        <button
                          onClick={() => handleremove(order._id)}
                          className="h-10 w-24 bg-red-500 hover:bg-red-700 rounded-md text-white"
                        >
                          {t("common.remove")}
                        </button>

                        <button
                          onClick={() => handleEditClick(order)}
                          className="h-10 w-24 bg-green-500 ml-10 hover:bg-green-700 rounded-md text-white"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="bg-base-100 text-center py-4">
                      {t("orders.noOrder")}
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

export default Orderpage;
