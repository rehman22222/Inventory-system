const mongoose = require('mongoose')
const Product=require('../models/Productmodel')
const Category=require('../models/ Categorymodel')

const logActivity=require('../libs/logger')
const { uploadImage, deleteImage } = require('../libs/cloudinaryImage')
const { ean13FromSequence } = require('../libs/barcode')
const { nextSequence } = require('../models/Countermodel')

const RANDOM_CATEGORY = "Random";
const MISC_CATEGORY = "Miscellaneous";

// Escape a user string so it's a literal in a regex — stops a stray "(" or "*"
// throwing, and closes off regex-injection on the search box.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports.Addproduct=async(req,res)=>{
  const userId=req.user._id;
  const ipAddress=req.ip

    try {

        const {
          name,
          Desciption,
          shelfLabel,
          Category,
          Price,
          costPrice,
          quantity,
          lowStockThreshold,
          barcode,
          expiryDate,
        } = req.body;

        const cleanedBarcode =
          typeof barcode === "string" ? barcode.trim() : barcode;
        const productName = typeof name === "string" ? name.trim() : name;
        const productDescription =
          typeof Desciption === "string" ? Desciption.trim() : Desciption;
        const cleanedShelfLabel =
          typeof shelfLabel === "string" ? shelfLabel.trim() : shelfLabel;

        // Only name and price are mandatory now.
        const required = { name: productName, Price };
        const missing = Object.keys(required).filter(
          (key) => required[key] === undefined || required[key] === null || String(required[key]).trim() === ""
        );
        if (missing.length) {
          return res.status(400).json({ message: `Missing required field(s): ${missing.join(", ")}` });
        }

        // Shelf label, when given, is letters/numbers (plus - and space).
        if (cleanedShelfLabel && !/^[A-Za-z0-9][A-Za-z0-9\- ]*$/.test(cleanedShelfLabel)) {
          return res
            .status(400)
            .json({ message: "Shelf label must be letters and numbers only" });
        }

        const productData = { name: productName, Price };
        if (productDescription) productData.Desciption = productDescription;
        if (Category) productData.Category = Category;
        if (quantity !== undefined && quantity !== "") productData.quantity = quantity;
        if (lowStockThreshold !== undefined && lowStockThreshold !== "")
          productData.lowStockThreshold = Number(lowStockThreshold);
        if (cleanedShelfLabel) productData.shelfLabel = cleanedShelfLabel;
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

// The till's "learn on scan" path. Building the catalogue is restricted to the
// owner side, but a cashier who scans an item the system has never seen must be
// able to ring it through with the customer still standing there — so this stays
// open to every role. It is deliberately narrower than Addproduct: no barcode,
// no quick add.
module.exports.quickAddProduct = async (req, res) => {
  const barcode =
    typeof req.body?.barcode === "string" ? req.body.barcode.trim() : "";

  if (!barcode) {
    return res
      .status(400)
      .json({ message: "Quick add is for scanned items — a barcode is required" });
  }

  // Category is optional at the till, but rather than leaving the item
  // uncategorised we drop it into the permanent "Miscellaneous" bucket — so a
  // cashier who doesn't know (or remember) the category can still add the
  // product cleanly. A real category id, when chosen, is always respected.
  if (!mongoose.isValidObjectId(String(req.body?.Category || ""))) {
    try {
      const misc = await ensureMiscCategory();
      req.body.Category = misc._id;
    } catch (error) {
      console.error("[quick-add] misc category failed:", error.message);
    }
  }

  return module.exports.Addproduct(req, res);
};


    module.exports.getProduct = async (req, res) => {
        try {
          
          // .lean() returns plain objects instead of full Mongoose documents —
          // the wire JSON is identical, but the server skips hydrating every
          // product on each request, which is the single biggest win when a
          // catalogue of thousands of SKUs is fetched by many tills at once.
          // The whole catalogue still comes back in one call — the till and the
          // product pages filter and search client-side, so paginating here
          // would break them. What we can cut for free is the payload: every
          // consumer only ever reads Category._id and Category.name, so there
          // is no reason to ship the rest of each category document with every
          // product row.
          const Products = await Product.find({})
            .populate('Category', 'name')
            .lean();

          // estimatedDocumentCount() reads collection metadata (O(1)) instead of
          // scanning to count — accurate enough for a total, far cheaper.
          const totalProduct = await Product.estimatedDocumentCount();

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
        const editable = ["name", "Desciption", "shelfLabel", "Category", "Price", "costPrice", "quantity", "lowStockThreshold", "barcode", "expiryDate"];
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
  
      
      // Escaped so the raw query can't break (or abuse) the regex. .lean() +
      // a result cap keep a live search box responsive even on a big catalogue:
      // a substring match can hit a large slice of the products, and nobody
      // scrolls hundreds of results — the top matches are what's wanted.
      const safe = escapeRegex(query.trim());
      const products = await Product.find({
        $or: [
          { name: { $regex: safe, $options: "i" } },
          { Desciption: { $regex: safe, $options: "i" } },
          { barcode: { $regex: safe, $options: "i" } },
        ],
      })
        .populate("Category")
        .limit(100)
        .lean();

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

    // POS scanner hot path — .lean() skips document hydration on every scan.
    const product = await Product.findOne({ barcode: code }).populate("Category").lean();

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


// The permanent "Random" category — created on demand, flagged as a system
// category so it can't be deleted from the UI.
const ensureRandomCategory = async () => {
  let category = await Category.findOne({ name: RANDOM_CATEGORY });

  if (!category) {
    category = await Category.create({
      name: RANDOM_CATEGORY,
      description: "System category for generated price-point barcodes",
      system: true,
    });
  } else if (!category.system) {
    category.system = true;
    await category.save();
  }

  return category;
};

// The permanent "Miscellaneous" catch-all. When a cashier quick-adds a scanned
// item at the till but doesn't know its category, it lands here instead of being
// left uncategorised. Created on demand and flagged system so it always exists.
const ensureMiscCategory = async () => {
  let category = await Category.findOne({ name: MISC_CATEGORY });

  if (!category) {
    category = await Category.create({
      name: MISC_CATEGORY,
      description: "Catch-all for till quick-adds with no chosen category",
      system: true,
    });
  } else if (!category.system) {
    category.system = true;
    await category.save();
  }

  return category;
};


// Generate a batch of price-point products with fresh EAN-13 barcodes, split
// across the given price tiers. A shop can print these labels for generic items
// that have no manufacturer barcode; scanning one rings up that price.
module.exports.generateRandomBarcodes = async (req, res) => {
  try {
    const count = Math.floor(Number(req.body?.count || 0));
    const tiers = (Array.isArray(req.body?.tiers) && req.body.tiers.length > 0
      ? req.body.tiers
      : [5, 10, 15]
    )
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!Number.isFinite(count) || count < 1 || count > 500) {
      return res.status(400).json({ message: "Count must be between 1 and 500" });
    }
    if (tiers.length === 0) {
      return res.status(400).json({ message: "At least one valid price tier is required" });
    }

    // Opening stock per generated item. The owner chooses it now instead of
    // every label being effectively infinite — so random items count toward
    // stock like anything else. Falls back to a large number only when left
    // blank (the old price-point-label behaviour).
    const hasQuantity = req.body?.quantity !== undefined && req.body?.quantity !== "";
    const stockQuantity = hasQuantity ? Math.floor(Number(req.body.quantity)) : 100000;
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0 || stockQuantity > 1000000) {
      return res.status(400).json({ message: "Quantity must be between 0 and 1,000,000" });
    }

    const category = await ensureRandomCategory();

    // Spread the count as evenly as possible across the tiers.
    const created = [];
    for (let index = 0; index < count; index += 1) {
      const price = tiers[index % tiers.length];
      const seq = await nextSequence("randomBarcode");
      const barcode = ean13FromSequence(seq);

      const product = await Product.create({
        name: `Random €${price} #${String(seq).padStart(4, "0")}`,
        Desciption: "Generated price-point item",
        Category: category._id,
        Price: price,
        quantity: stockQuantity,
        lowStockThreshold: 0,
        barcode,
      });

      created.push({
        _id: product._id,
        name: product.name,
        Price: product.Price,
        barcode: product.barcode,
      });
    }

    await logActivity({
      action: "Generate Barcodes",
      description: `Generated ${created.length} random price-point barcodes.`,
      entity: "product",
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: `Generated ${created.length} barcodes`,
      category: { _id: category._id, name: category.name },
      products: created,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Could not generate barcodes" });
  }
};




  module.exports.getTopProductsByQuantity = async (req, res) => {
  try {
    const topProducts = await Product.find({})
      .sort({ quantity: -1 }) // uses the { quantity: 1 } index
      .limit(10)
      .lean();

    res.status(200).json({ success: true, topProducts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products for chart", error: error.message });
  }
};

  

