const mongoose = require('mongoose')
const zlib = require("zlib");
const Product=require('../models/Productmodel')
const Category=require('../models/ Categorymodel')
const OnlineListing=require('../models/OnlineListingmodel')
const Sale=require('../models/Salesmodel')
const Deal=require('../models/Dealmodel')

const logActivity=require('../libs/logger')
const { uploadImage, deleteImage } = require('../libs/cloudinaryImage')
const { ean13FromSequence } = require('../libs/barcode')
const { nextSequence } = require('../models/Countermodel')
const { fxContext, resolveCost } = require('../libs/cost')
const { getProductCatalog } = require("../libs/productCatalogCache");

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
          costCurrency,
          costRate,
          costNote,
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
        // A cost billed in another currency is converted before it is stored,
        // so reports never subtract pounds from a euro shelf price.
        if (costPrice !== undefined && costPrice !== "") {
          const { shopCcy, rates } = await fxContext();
          const cost = resolveCost({ costPrice, costCurrency, costRate, costNote }, shopCcy, rates);
          if (!cost.ok) return res.status(400).json({ message: cost.message });
          productData.costPrice = cost.costPrice;
          if (cost.costSource) productData.costSource = cost.costSource;
        }
        if (cleanedBarcode) productData.barcode = cleanedBarcode;
        if (expiryDate) productData.expiryDate = expiryDate;

        // Upload image to Cloudinary from the backend; store only url + publicId.
        if (req.file) {
          productData.image = await uploadImage(req.file);
        }

        const createdProduct = new Product(productData);
        await createdProduct.save();
        await createdProduct.populate('Category');

        void logActivity({

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
          const views = {
            pos: "name Desciption Category Price quantity lowStockThreshold barcode image.url",
            dashboard: "name Category Price quantity lowStockThreshold",
            lookup: "name",
            // What the till's unknown-barcode dialog needs to show a candidate
            // and let the cashier recognise it: enough to identify, nothing more.
            link: "name Price Category barcode quantity stockCounted",
            supplier: "name barcode supplier Price",
          };
          const view = Object.prototype.hasOwnProperty.call(views, req.query.view)
            ? req.query.view
            : "full";
          const projection =
            views[view] ||
            "name Desciption shelfLabel Category Price costPrice costSource quantity lowStockThreshold barcode expiryDate image.url supplier";

          // The till can only ring up what it can scan. Online-only products —
          // web flavours that share a Product row with the shop but were never
          // given a barcode, and never will be — are filtered out of the POS
          // view so the cashier's grid holds shelf stock and nothing else. They
          // stay in every other view: the product pages still manage them, and
          // the website still sells them off the same `quantity`.
          const filter =
            view === "pos" ? { barcode: { $exists: true, $nin: [null, ""] } } : {};

          // The Products page can narrow the catalogue to one channel. "pos" is
          // what the till can scan; "online" is what a listing actually sells —
          // taken from the listings themselves rather than from a category name,
          // so the products BOTH channels share (barcoded on the shelf and sold
          // on the site) show up under either filter, which is the whole point
          // of them being one row. Default stays the full catalogue.
          const channel = ["pos", "online"].includes(req.query.channel)
            ? req.query.channel
            : "all";
          // "Which products are still waiting for a barcode?" — the till asks
          // this when a scan finds nothing and the cashier is holding the box.
          const needsBarcode = String(req.query.needsBarcode || "") === "1";

          const onlineProductIds = async () => {
            const listings = await OnlineListing.find({})
              .select("product variants.product")
              .lean();
            const ids = new Set();
            for (const l of listings) {
              if (l.product) ids.add(String(l.product));
              for (const v of l.variants || []) if (v.product) ids.add(String(v.product));
            }
            return [...ids].map((id) => new mongoose.Types.ObjectId(id));
          };
          
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
          // Cache per view AND channel: they are different answers to different
          // questions and must not share an entry.
          const catalogue = await getProductCatalog(async () => {
          const scoped = { ...filter };
          if (channel === "pos") {
            scoped.barcode = { $exists: true, $nin: [null, ""] };
          } else if (channel === "online") {
            scoped._id = { $in: await onlineProductIds() };
          }
          if (needsBarcode) {
            // Unset or empty — both mean "never been given one".
            scoped.$or = [{ barcode: { $exists: false } }, { barcode: { $in: [null, ""] } }];
          }
          const productsPromise = Product.find(scoped)
            .select(projection)
            .populate('Category', 'name')
            .lean();

          // estimatedDocumentCount() reads collection metadata (O(1)) instead of
          // scanning to count — accurate enough for a total, far cheaper. A
          // filtered view has to count for real, but only over the sparse
          // barcode index rather than the whole collection.
          const [Products, totalProduct] = await Promise.all([
            productsPromise,
            Object.keys(scoped).length
              ? Product.countDocuments(scoped)
              : Product.estimatedDocumentCount(),
          ]);

            const json = JSON.stringify({ Products, totalProduct });
            return { json, gzip: zlib.gzipSync(json) };
          }, `${view}:${channel}:${needsBarcode ? "nb" : "any"}`);

            res.set("Cache-Control", "private, no-store");
          res.vary("Accept-Encoding").type("application/json");
          if (String(req.get("accept-encoding") || "").includes("gzip")) {
            res.set("Content-Encoding", "gzip");
            return res.status(200).send(catalogue.gzip);
          }
          return res.status(200).send(catalogue.json);
        } catch (error) {
            res.status(500).json({ message: "Error getting products", error: error.message });
        }
    };
    





    module.exports.RemoveProduct = async (req, res) => {
      try {
        const { productId } = req.params;
        const userId=req.user._id;
        const ipAddress=req.ip

        if (!mongoose.isValidObjectId(productId)) {
          return res.status(400).json({ message: "Invalid product id" });
        }

        const doomed = await Product.findById(productId);
        if (!doomed) {
          return res.status(404).json({ message: "Product not found!" });
        }

        // Deleting a product that something else still points at is not wrong,
        // but it is never something to do by accident: it takes the item off the
        // storefront too. So the first attempt reports what else it would take
        // with it, and only a typed confirmation goes through.
        const [listings, soldCount, deals] = await Promise.all([
          OnlineListing.find({
            $or: [{ product: productId }, { "variants.product": productId }],
          }).select("webName seo.title slug product variants").lean(),
          Sale.countDocuments({ "products.product": productId }),
          Deal.find({ "items.product": productId }).select("name items mode groupQuantity").lean(),
        ]);

        const blockers = [];
        if (listings.length) {
          // A listing cannot outlive the product it is built on, so deleting a
          // master takes its whole shop page — and every flavour hanging off it
          // stops being buyable online. That is the part worth saying out loud.
          const asMaster = listings.filter((l) => String(l.product) === String(productId));
          const strandedVariants = asMaster.reduce(
            (sum, l) => sum + (l.variants || []).filter((v) => String(v.product) !== String(productId)).length,
            0,
          );

          // A listing is titled by `webName`; imported ones often leave it blank,
          // so fall back the way the online-store page itself does rather than
          // naming the page nothing at all.
          const listingName = (l) => l.webName || l.seo?.title || l.slug || "";

          blockers.push({
            kind: "online",
            count: listings.length,
            names: listings.map(listingName).filter(Boolean).slice(0, 5),
            listingsRemoved: asMaster.length,
            strandedVariants,
          });
        }
        if (soldCount) blockers.push({ kind: "sales", count: soldCount });
        if (deals.length) {
          blockers.push({ kind: "deals", count: deals.length, names: deals.map((d) => d.name) });
        }

        // The word is deliberately short and fixed: this gets typed on a
        // touchscreen keyboard, where retyping a long product name is its own
        // kind of accident.
        const CONFIRM_WORD = "DELETE";
        const confirmed =
          String(req.query.confirm || req.body?.confirm || "").trim().toUpperCase() === CONFIRM_WORD;

        if (blockers.length && !confirmed) {
          return res.status(409).json({
            needsConfirmation: true,
            confirmWord: CONFIRM_WORD,
            product: doomed.name,
            blockers,
            message: `"${doomed.name}" is still in use. Confirm to delete it and remove it from everywhere it appears.`,
          });
        }

        // Confirmed: take the references with it rather than leaving them
        // dangling. A listing whose master product is gone has nothing left to
        // sell, so it goes; a variant is just pulled out of its listing.
        const cleaned = { listingsDeleted: 0, variantsPulled: 0, dealsEdited: 0, dealsDisabled: 0 };
        if (blockers.length) {
          const pulled = await OnlineListing.updateMany(
            { "variants.product": productId },
            { $pull: { variants: { product: productId } } },
          );
          cleaned.variantsPulled = pulled.modifiedCount || 0;

          const removed = await OnlineListing.deleteMany({ product: productId });
          cleaned.listingsDeleted = removed.deletedCount || 0;

          if (deals.length) {
            const edited = await Deal.updateMany(
              { "items.product": productId },
              { $pull: { items: { product: productId } } },
            );
            cleaned.dealsEdited = edited.modifiedCount || 0;

            // A deal that no longer has enough products to be a deal must not
            // stay switched on at the till.
            const survivors = await Deal.find({ _id: { $in: deals.map((d) => d._id) } }).select("items mode groupQuantity active");
            for (const deal of survivors) {
              const units = (deal.items || []).reduce((sum, i) => sum + Math.max(1, Number(i.quantity || 1)), 0);
              const stillValid = deal.mode === "mix" ? (deal.items || []).length > 0 : units >= 2;
              if (!stillValid && deal.active) {
                await Deal.updateOne({ _id: deal._id }, { $set: { active: false } });
                cleaned.dealsDisabled += 1;
              }
            }
          }
        }

        const deletedProduct = await Product.findByIdAndDelete(productId);

        if (!deletedProduct) {
          return res.status(404).json({ message: "Product not found!" });
        }

        // Remove its image from Cloudinary so we don't leave orphaned assets.
        void deleteImage(deletedProduct.image?.publicId);

        // What went with it belongs in the log too — "why did this vanish from
        // the website" is the question this record has to answer later.
        const alsoRemoved = [
          cleaned.listingsDeleted ? `${cleaned.listingsDeleted} online listing(s)` : null,
          cleaned.variantsPulled ? `${cleaned.variantsPulled} listing variant(s)` : null,
          cleaned.dealsEdited ? `${cleaned.dealsEdited} deal(s)` : null,
          cleaned.dealsDisabled ? `${cleaned.dealsDisabled} deal(s) switched off` : null,
        ].filter(Boolean);

        void logActivity({
          action: "Delete Product",
          description: `Product "${deletedProduct.name}" was deleted${alsoRemoved.length ? `, along with ${alsoRemoved.join(", ")}` : ""}.`,
          entity: "product",
          entityId: deletedProduct._id,
          userId: userId,
          ipAddress: ipAddress,
        });

        res.status(200).json({
          message: "Product deleted successfully",
          product: deletedProduct.name,
          cleaned,
        });
    
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

        // Apply only the fields that were actually provided. costPrice is handled
        // separately below because it may need converting first.
        const editable = ["name", "Desciption", "shelfLabel", "Category", "Price", "quantity", "lowStockThreshold", "barcode", "expiryDate"];
        // Typing a quantity by hand IS the count. From here the figure is the
        // shop's own, and bulk "set every web flavour to 15" must not undo it.
        editable.forEach((field) => {
          if (source[field] !== undefined && source[field] !== "") {
            product[field] =
              typeof source[field] === "string" ? source[field].trim() : source[field];
          }
        });
        if (source.quantity !== undefined && String(source.quantity).trim() !== "") {
          product.stockCounted = true;
        }

        if (source.costPrice !== undefined && source.costPrice !== "") {
          const { shopCcy, rates } = await fxContext();
          const cost = resolveCost(
            {
              costPrice: source.costPrice,
              costCurrency: source.costCurrency,
              costRate: source.costRate,
              costNote: source.costNote,
            },
            shopCcy,
            rates
          );
          if (!cost.ok) return res.status(400).json({ message: cost.message });
          product.costPrice = cost.costPrice;
          // Billed in the shop's own currency now: drop any stale conversion so
          // the record cannot claim a rate that no longer produced this figure.
          product.costSource = cost.costSource || undefined;
        }
        if (!product.barcode) {
          product.barcode = undefined;
        }

        // Replace the image if a new file was uploaded, deleting the old one.
        if (req.file) {
          const oldPublicId = product.image?.publicId;
          product.image = await uploadImage(req.file);
          void deleteImage(oldPublicId);
        }

        await product.save();
        await product.populate("Category");

        void logActivity({
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


// One product, in full.
//
// The till fetches its catalogue with a narrow projection that deliberately
// leaves out cost price — that is the shop's margin, and it has no business
// sitting in every terminal's memory. So the till's edit form asks for the whole
// record only for the one product being edited, and only for someone allowed to
// change it (the route restricts this to admin/manager, same as EditProduct).
module.exports.getProductById = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const product = await Product.findById(productId)
      .populate("Category", "name")
      .lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({ product });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching product", error: error.message });
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
//
// It also settles who owns the stock. Somebody is standing at the till with the
// box in their hand — that is the strongest evidence this catalogue ever gets
// that the figure is real, so the product becomes `stockCounted` and bulk tools
// stop flattening it. Passing `quantity` records what they actually counted.
module.exports.attachBarcode = async (req, res) => {
  try {
    const { productId } = req.params;
    const barcode = String(req.body?.barcode || "").trim();
    const replace = Boolean(req.body?.replace);
    const hasQuantity =
      req.body?.quantity !== undefined && String(req.body.quantity).trim() !== "";
    const quantity = hasQuantity ? Math.floor(Number(req.body.quantity)) : null;

    if (hasQuantity && (!Number.isFinite(quantity) || quantity < 0)) {
      return res.status(400).json({ message: "Enter a quantity of 0 or more" });
    }

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

    // The barcode being scanned is free (checked above), but the product picked
    // may already carry a different one — easy to do from an unfiltered list,
    // and it would silently retire a code the shelf labels still use.
    const target = await Product.findById(productId).select("barcode name");
    if (!target) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (target.barcode && target.barcode !== barcode && !replace) {
      return res.status(409).json({
        message: `${target.name} already has barcode ${target.barcode}`,
        currentBarcode: target.barcode,
        needsReplaceConfirmation: true,
      });
    }

    const update = { barcode, stockCounted: true };
    if (hasQuantity) update.quantity = quantity;

    const product = await Product.findByIdAndUpdate(
      productId,
      update,
      { new: true }
    ).populate("Category");

    await logActivity({
      action: "Attach Barcode",
      description:
        `Barcode ${barcode} linked to ${product.name}` +
        (target.barcode && target.barcode !== barcode ? ` (replaced ${target.barcode})` : "") +
        (hasQuantity ? `, counted stock set to ${quantity}` : "") +
        ".",
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

// Exported so the server can guarantee the catch-all exists at boot. Until now
// it was only created the first time a cashier quick-added an item with no
// category, which meant the till showed no Miscellaneous tile on a fresh shop —
// exactly when a cashier is most likely to need it.
module.exports.ensureMiscCategory = ensureMiscCategory;
module.exports.MISC_CATEGORY = MISC_CATEGORY;


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

  

