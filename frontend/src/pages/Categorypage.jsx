import React,{useState,useEffect} from 'react'
import { IoMdAdd } from "react-icons/io";
import { FaFileExport } from "react-icons/fa6";
import FormattedTime from "../lib/FormattedTime ";





import TopNavbar from "../Components/TopNavbar";

import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { gettingallCategory,CreateCategory , UpdateCategory, RemoveCategory,SearchCategory } from "../features/categorySlice";
import toast from "react-hot-toast";




function Categorypage() {



  
  const { t } = useTranslation();
  const { getallCategory, iscreatedCategory,  searchdata } = useSelector((state) => state.category);
  const { Authuser } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [query, setquery] = useState("");

  // Creating categories belongs to the owner side; a manager edits and removes.
  const canAddCategory = ["admin", "superadmin"].includes(Authuser?.role);

  const [name, setname] = useState("");
  const [description, setdescription] = useState("");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);









  
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

    if (!name.trim()) {
      toast.error(t("categories.nameRequired"));
      return;
    }

    const CategoryData = { name: name.trim(), description: description.trim() };

    // Editing an existing category, or creating a new one.
    if (selectedCategory) {
      dispatch(UpdateCategory({ CategoryId: selectedCategory._id, changes: CategoryData }))
        .unwrap()
        .then(() => {
          toast.success(t("categories.updated"));
          closeForm();
        })
        // Surface the real reason (duplicate name, system category, …) rather
        // than a blanket "failed".
        .catch((error) => toast.error(error || t("categories.updateFail")));
      return;
    }

    dispatch( CreateCategory( CategoryData))
      .unwrap()
      .then(() => {
        toast.success(t("categories.added"));
        closeForm();
      })
      .catch((error) => {
        toast.error(error || t("categories.addFail"));
      });
  };


  const openEdit = (category) => {
    setSelectedCategory(category);
    setname(category.name || "");
    setdescription(category.description || "");
    setIsFormVisible(true);
  };


  const closeForm = () => {
    setIsFormVisible(false);
    setSelectedCategory(null);
    resetForm();
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
      {canAddCategory && (
      <button onClick={()=>{
           setSelectedCategory(null);
           resetForm();
           setIsFormVisible(true);

      }} className="bg-blue-800 ml-10 text-white w-40 h-12 rounded-lg flex items-center justify-center"><IoMdAdd className='text-xl mr-3'/>{t("categories.addCategory")}</button>
      )}
      </div>

      </div>


      {isFormVisible && (
          <div className="fixed right-0 top-0 z-50 flex h-svh w-full max-w-lg flex-col overflow-hidden border-l-2 border-base-300 bg-base-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-base-300 px-5 py-3">
              <h1 className="text-lg font-semibold">
                {selectedCategory ? t("categories.editCategory") : t("categories.addCategoryTitle")}
              </h1>
              <MdKeyboardDoubleArrowLeft
                onClick={closeForm}
                className="cursor-pointer text-2xl"
              />
            </div>

            <form onSubmit={submitCategory} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                <div>
                  <label className="text-sm">{t("common.name")} *</label>
                  <input
                    value={name}
                    placeholder={t("categories.namePlaceholder")}
                    onChange={(e) => setname(e.target.value)}
                    type="text"
                    required
                    className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  />
                </div>

                <div>
                  <label className="text-sm">{t("common.description")}</label>
                  <input
                    value={description}
                    placeholder={t("categories.descPlaceholder")}
                    onChange={(e) => setdescription(e.target.value)}
                    type="text"
                    className="mt-1 h-10 w-full rounded-lg border-2 border-base-300 bg-base-100 px-2 text-base-content"
                  />
                </div>
              </div>

              <div className="border-t border-base-300 px-5 py-3">
                <button
                  type="submit"
                  className="h-11 w-full rounded-lg bg-blue-800 text-white transition hover:bg-blue-700"
                >
                  {selectedCategory ? t("categories.updateCategory") : t("categories.addCategoryTitle")}
                </button>
              </div>
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
                          onClick={() => openEdit(Category)}
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