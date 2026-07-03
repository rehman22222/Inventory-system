import React,{useState,useEffect} from 'react'
import { IoMdAdd } from "react-icons/io";
import { FaFileExport } from "react-icons/fa6";
import FormattedTime from "../lib/FormattedTime ";





import TopNavbar from "../Components/TopNavbar";

import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { gettingallCategory,CreateCategory , RemoveCategory,SearchCategory } from "../features/categorySlice";
import toast from "react-hot-toast";




function Categorypage() {



  
  const { t } = useTranslation();
  const { getallCategory, iscreatedCategory,  searchdata } = useSelector((state) => state.category);
  const dispatch = useDispatch();
  const [query, setquery] = useState("");

  const [name, setname] = useState("");
  const [description, setdescription] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);









  
  useEffect(() => {

    dispatch(gettingallCategory());
  }, [dispatch]);

  



  useEffect(() => {
    if (query.trim() !== "") {
      const repeatTimeout = setTimeout(() => {
        dispatch(SearchCategory(query));
      }, 500);
      return () => clearTimeout(repeatTimeout);
    } else {
      dispatch(gettingallCategory()); 
    }
  }, [query, dispatch]); 


  const handleremove = async (categoryId) => {
    dispatch( RemoveCategory (categoryId))
      .unwrap()
      .then(() => {
        toast.success(t("categories.removed"));
      })
      .catch((error) => {
        toast.error(error || t("categories.removeFail"));
      });
  };

  


  const submitCategory = async (event) => {
    event.preventDefault();
    const CategoryData = { name, description};

    dispatch( CreateCategory( CategoryData))
      .unwrap()
      .then(() => {
        toast.success(t("categories.added"));
        resetForm();
      })
      .catch(() => {
        toast.error(t("categories.addFail"));
      });
  };


  const resetForm = () => {
    setname("");
    setdescription("");
  };

  


  const displayCategory =query.trim() !== "" ? searchdata : getallCategory;

  





  return (

    <div className='bg-base-200 min-h-screen'>
         <TopNavbar />


         <div className="mt-10 flex ">
      <div className="bg-blue-950 w-56 rounded-xl  ml-10 block h-24">
          <h1 className="text-white ml-12 block pt-5 font-bold">{t("categories.totalCategory")}</h1>
          <p className="text-white font-bold  pt-2  ml-24">{getallCategory?.length || "0"}</p>

        </div>
  
</div>

      <div className='flex'>

      <input type='text' 
       value={query}
       onChange={(e) => setquery(e.target.value)}
      placeholder={t("categories.searchPlaceholder")}
      className="w-full ml-10 mt-20 md:w-96 h-12 pl-4 pr-12 border-2 border-base-300 rounded-lg bg-base-100 text-base-content"/>
      <div className='flex mt-20'>
      <button onClick={()=>{
           setIsFormVisible(true);
           setSelectedProduct(null);

      }} className="bg-blue-800 ml-10 text-white w-40 h-12 rounded-lg flex items-center justify-center"><IoMdAdd className='text-xl mr-3'/>{t("categories.addCategory")}</button>
      </div>

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
              {selectedProduct ? t("categories.editCategory") : t("categories.addCategoryTitle")}
            </h1>

            <form onSubmit={ submitCategory}>
              <div className="mb-4">
                <label>{t("common.name")}</label>
                <input
                  value={name}
                  placeholder={t("categories.namePlaceholder")}
                  onChange={(e) => setname(e.target.value)}
                  type="text"
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              

              <div className="mb-4">
                <label>{t("common.description")}</label>
                <input
                  value={description}
                  placeholder={t("categories.descPlaceholder")}
                  onChange={(e) => setdescription(e.target.value)}
                  type="text"
                  className="w-full h-10 px-2 border-2 border-base-300 rounded-lg mt-2 bg-base-100 text-base-content"
                />
              </div>

              

             

              <button
                type="submit"
                className="bg-blue-800 text-white w-full h-12 rounded-lg hover:bg-blue-700 mt-4"
              >
                {selectedProduct ? t("categories.updateCategory") : t("categories.addCategoryTitle")}
              </button>
            </form>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl ml-10 font-semibold mb-4">{t("categories.categoryList")}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full ml-10 bg-base-100 border mb-24 border-base-300 rounded-lg shadow-md">
              <thead className="bg-base-200">
                <tr>
                <th className="px-3 py-2 bg-base-100 border w-5">#</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.name")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("categories.totalProduct")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("common.description")}</th>
                  <th className="px-3 py-2 bg-base-100 border">{t("categories.createdAt")}</th>
                  <th className="px-3 py-2 bg-base-100 w-72 border">{t("common.operations")}</th>
                </tr>
              </thead>
              <tbody className='bg-base-100'>
                {Array.isArray(displayCategory) &&
                displayCategory.length > 0 ? (
                  displayCategory.map((Category,index) => (
                    <tr key={Category._id} className="">
                       <td className="px-3 py-2 border">{index+1}</td>
                      <td className="px-3 py-2 border">{Category.name}</td>
                      <td className="px-3 py-2 border">
                        {Category.productCount}
                      </td>
                      <td className="px-3 py-2 border">
                        {Category.description}
                      </td>
                      <td className="px-3 py-2 border">
                        <FormattedTime timestamp={Category.createdAt}/>
                      </td>

                      <td className="px-4  py-2 border">
                        <button
                          onClick={() => handleremove(Category._id)}
                         
                          className="h-10 w-24 bg-red-500 hover:bg-red-700 rounded-md text-white"
                        >
                          {t("common.remove")}
                        </button>
                        <button

                          className="h-10 w-24 bg-green-500 ml-10 hover:bg-green-700 rounded-md text-white"
                        >
                          {t("common.edit")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center bg-base-100 py-4">
                      {t("categories.noCategory")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      
    </div>
  )
}

export default Categorypage