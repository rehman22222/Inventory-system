const mongoose = require('mongoose')
const Product=require('../models/Productmodel')

const logActivity=require('../libs/logger')
const { uploadImage, deleteImage } = require('../libs/cloudinaryImage')

module.exports.Addproduct=async(req,res)=>{
  const userId=req.user._id;
  const ipAddress=req.ip

    try {

        const {
          name,
          Desciption,
          Category,
          Price,
          costPrice,
          quantity,
          barcode,
          expiryDate,
        } = req.body;

        const cleanedBarcode =
          typeof barcode === "string" ? barcode.trim() : barcode;
        const productName = typeof name === "string" ? name.trim() : name;
        const productDescription =
          typeof Desciption === "string" ? Desciption.trim() : Desciption;

        const required = {
          name: productName,
          Category,
          Desciption: productDescription,
          Price,
          quantity,
        };
        const missing = Object.keys(required).filter(
          (key) => required[key] === undefined || required[key] === null || String(required[key]).trim() === ""
        );
        if (missing.length) {
          return res.status(400).json({ message: `Missing required field(s): ${missing.join(", ")}` });
        }

        const productData = {
          name: productName,
          Desciption: productDescription,
          Category,
          Price,
          quantity,
        };
        if (costPrice !== undefined && costPrice !== "") productData.costPrice = costPrice;
        if (cleanedBarcode) productData.barcode = cleanedBarcode;
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
      description:`Product ${productName} was added`,
      entity:"product",
      entityId:createdProduct._id,
      userId:userId,
      ipAddress:ipAddress,

        })


        res.status(201).json({ message: "Product created successfully", product: createdProduct });

     } catch (error) {
        if (error.code === 11000) {
          const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "value";
          return res.status(400).json({ message: `A product with this ${field} already exists` });
        }
        res.status(500).json({ message: error.message || "Error in creating product" });
     }
    }

    module.exports.getProduct = async (req, res) => {
        try {
          
          const Products = await Product.find({}).populate('Category'); 


          const totalProduct=await Product.countDocuments({})
     
            
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
        const editable = ["name", "Desciption", "Category", "Price", "costPrice", "quantity", "barcode", "expiryDate"];
        editable.forEach((field) => {
          if (source[field] !== undefined && source[field] !== "") {
            product[field] =
              typeof source[field] === "string" ? source[field].trim() : source[field];
          }
        });
        if (!product.barcode) {
          product.barcode = undefined;
        }

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
        if (error.code === 11000) {
          const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || "value";
          return res.status(400).json({ message: `A product with this ${field} already exists` });
        }
        res.status(500).json({ message: error.message || "Error updating product" });
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
          { Desciption: { $regex: query, $options: "i" } },
          { barcode: { $regex: query, $options: "i" } },
        ],
      }).populate("Category");

      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Error finding product", error: error.message });
    }
  };


// Exact barcode match — what the POS scanner calls on every scan.
module.exports.getProductByBarcode = async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();

    if (!code) {
      return res.status(400).json({ message: "Barcode is required" });
    }

    const product = await Product.findOne({ barcode: code }).populate("Category");

    if (!product) {
      return res.status(404).json({ message: "No product with this barcode", barcode: code });
    }

    return res.status(200).json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Error finding product", error: error.message });
  }
};


// "Learn on scan": attach a freshly scanned barcode to a product that doesn't
// have one yet. This is how the imported PLU-only catalogue gains real barcodes
// during normal trading.
module.exports.attachBarcode = async (req, res) => {
  try {
    const { productId } = req.params;
    const barcode = String(req.body?.barcode || "").trim();

    if (!barcode) {
      return res.status(400).json({ message: "Barcode is required" });
    }

    // Otherwise a bad id throws a CastError and surfaces as a 500.
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const clash = await Product.findOne({ barcode });

    if (clash && String(clash._id) !== String(productId)) {
      return res
        .status(400)
        .json({ message: `Barcode already belongs to ${clash.name}`, product: clash });
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      { barcode },
      { new: true }
    ).populate("Category");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await logActivity({
      action: "Attach Barcode",
      description: `Barcode ${barcode} linked to ${product.name}.`,
      entity: "product",
      entityId: product._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Barcode linked successfully", product });
  } catch (error) {
    return res.status(500).json({ message: "Error linking barcode", error: error.message });
  }
};




  module.exports.getTopProductsByQuantity = async (req, res) => {
  try {
    const topProducts = await Product.find({})
      .sort({ quantity: -1 }) 
      .limit(10); 

    res.status(200).json({ success: true, topProducts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products for chart", error: error.message });
  }
};

  

