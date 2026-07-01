const Product=require('../models/Productmodel')

const logActivity=require('../libs/logger')
const { uploadImage, deleteImage } = require('../libs/cloudinaryImage')

module.exports.Addproduct=async(req,res)=>{
  const userId=req.user._id;
  const ipAddress=req.ip

    try {

        const { name, Desciption, Category, Price, quantity, barcode, expiryDate } = req.body;

        if (!name|| !Category || !  Desciption|| !Price || !quantity) {
           return res.status(400).json({ error: "Please provide all product details." });
        }

        const productData = { name, Desciption, Category, Price, quantity };
        if (barcode) productData.barcode = barcode;
        if (expiryDate) productData.expiryDate = expiryDate;

        // Upload image to Cloudinary from the backend; store only url + publicId.
        if (req.file) {
          productData.image = await uploadImage(req.file);
        }

        const createdProduct = new Product(productData);
        await createdProduct.save();
        await createdProduct.populate('Category');

       await logActivity({

     action:"Add Product",
      description:`Product ${name} was added`,
      entity:"product",
      entityId:createdProduct._id,
      userId:userId,
      ipAddress:ipAddress,

        })


        res.status(201).json({ message: "Product created successfully", product: createdProduct });

     } catch (error) {

        res.status(500).json({ message: "Error in creating product", error: error.message });
     }
    }

    module.exports.getProduct = async (req, res) => {
        try {
          
          const Products = await Product.find({}).populate('Category'); 


          const totalProduct=await Product.countDocuments({})
     
            
            if (!Products || Products.length === 0) {
                return res.status(404).json({ message: "Products not found" });
            }

            

    
            res.status(200).json({Products,totalProduct});  
        } catch (error) {
            res.status(500).json({ message: "Error getting products", error: error.message });
        }
    };
    





    module.exports.RemoveProduct = async (req, res) => {
      try {
        const { productId } = req.params; 
        const userId=req.user._id;
        const ipAddress=req.ip
    
        const deletedProduct = await Product.findByIdAndDelete(productId);

        if (!deletedProduct) {
          return res.status(404).json({ message: "Product not found!" });
        }

        // Remove its image from Cloudinary so we don't leave orphaned assets.
        await deleteImage(deletedProduct.image?.publicId);

        await logActivity({
          action: "Delete Product",
          description: `Product ${deletedProduct.name}" was deleted.`,
          entity: "product",
          entityId: deletedProduct._id,
          userId: userId,
          ipAddress: ipAddress,
        });
    
        res.status(200).json({ message: "Product deleted successfully" });
    
      } catch (error) {
        res.status(500).json({ message: "Error deleting product", error: error.message });
      }
    };
    



    module.exports.EditProduct = async (req, res) => {
      try {
        // productId comes from the route param; fields arrive as multipart form
        // fields (or JSON). Support the legacy nested `updatedData` shape too.
        const productId = req.params.productId || req.body.productId;
        const userId = req.user._id;
        const ipAddress = req.ip;

        const source =
          req.body.updatedData && typeof req.body.updatedData === "object"
            ? req.body.updatedData
            : req.body;

        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ message: "Product not found." });
        }

        // Apply only the fields that were actually provided.
        const editable = ["name", "Desciption", "Category", "Price", "quantity", "barcode", "expiryDate"];
        editable.forEach((field) => {
          if (source[field] !== undefined && source[field] !== "") {
            product[field] = source[field];
          }
        });

        // Replace the image if a new file was uploaded, deleting the old one.
        if (req.file) {
          const oldPublicId = product.image?.publicId;
          product.image = await uploadImage(req.file);
          await deleteImage(oldPublicId);
        }

        await product.save();
        await product.populate("Category");

        await logActivity({
          action: "Update Product",
          description: `Product "${product.name}" was updated.`,
          entity: "product",
          entityId: product._id,
          userId: userId,
          ipAddress: ipAddress,
        });

        res.status(200).json(product);
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: "Error updating product", error: error.message });
      }
    };




module.exports.SearchProduct = async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ message: "Query parameter is required" });
      }
  
      
      const products = await Product.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { Description: { $regex: query, $options: "i" } },
       
          { 'Category.name': { $regex: query, $options: 'i' } },
        ],
      });
  
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Error finding product", error: error.message });
    }
  };
  



  module.exports.getTopProductsByQuantity = async (req, res) => {
  try {
    const topProducts = await Product.find({})
      .sort({ quantity: -1 }) 
      .limit(10); 

    if (!topProducts || topProducts.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    res.status(200).json({ success: true, topProducts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products for chart", error: error.message });
  }
};

  

