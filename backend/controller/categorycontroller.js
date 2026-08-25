const mongoose = require('mongoose')
const Product=require('../models/Productmodel')
const Category=require('../models/ Categorymodel')
const logActivity = require('../libs/logger');
const StockTransaction = require('../models/StockTranscationmodel');

// Two categories called "Vape" is a mess nobody can untangle from the till, so
// names are compared case-insensitively. `exceptId` skips the row being edited.
const findByName = (name, exceptId) => {
  const query = { name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  if (exceptId) query._id = { $ne: exceptId };
  return Category.findOne(query);
};

module.exports.createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const userId=req.user._id;
        const ipAddress=req.ip

        const cleanName = typeof name === "string" ? name.trim() : "";

        // Only the name is mandatory — a description is nice to have, not a
        // reason to reject the category (this used to fail with an opaque
        // "provide all necessary information" whenever it was left blank).
        if (!cleanName) {
            return res.status(400).json({ message: "Category name is required" });
        }

        const clash = await findByName(cleanName);
        if (clash) {
            return res.status(400).json({ message: `A category called "${clash.name}" already exists` });
        }

        const newCategory = new Category({
            name: cleanName,
            description: typeof description === "string" ? description.trim() : undefined,
        });

        await newCategory.save();

        // Only worth logging once it actually exists.
        await logActivity({
          action:"Add Category",
           description:`Category "${cleanName}" was added`,
           entity:"category",
           entityId:newCategory._id,
           userId:userId,
           ipAddress:ipAddress,
             })

        res.status(201).json(newCategory);

    } catch (error) {
        res.status(500).json({ message: "Error in creating Category", error: error.message });
    }
};





module.exports.RemoveCategory=async(req,res)=>{
    try {
        const {CategoryId}=req.params
        const userId=req.user._id;
        const ipAddress=req.ip

        // System categories (e.g. "Random") are permanent.
        const target = await Category.findById(CategoryId)
        if (target && target.system) {
          return res.status(400).json({ message: "This is a system category and cannot be deleted" })
        }

        const DeletedCategory=await Category.findByIdAndDelete(CategoryId)

         if(!DeletedCategory){
           return  res.status(404).json({message:"Category is not found!"})
         }
    

         await logActivity({
          action: "Delete Category",
          description: `Category "${DeletedCategory.name}" was deleted.`,
          entity: "category",
          entityId: DeletedCategory._id,
          userId: userId,
          ipAddress: ipAddress,
        });


         res.status(200).json({message:"Category delete successfully"})
    
            
        } catch (error) {
            res.status(500).json({ message: "Error deleting Category", error: error.message });
        }


}


module.exports.getCategory = async (req, res) => {
  try {
    // One query for the categories, ONE aggregation for every count — instead
    // of the old per-category countDocuments (an N+1 that fired 50+ queries per
    // page load on a big catalogue).
    const [allCategory, counts] = await Promise.all([
      Category.find({}).lean(),
      Product.aggregate([{ $group: { _id: "$Category", count: { $sum: 1 } } }]),
    ]);
    const countByCat = new Map(counts.map((c) => [String(c._id), c.count]));

    const categoriesWithCount = allCategory.map((category) => ({
      ...category,
      productCount: countByCat.get(String(category._id)) || 0,
    }));

    res.status(200).json({ categoriesWithCount });

  } catch (error) {
    res.status(500).json({ message: "Error getting categories", error: error.message });
  }
};

  

module.exports.updateCategory=async(req,res)=>{
    try {
        // The id comes from the route param; the legacy nested `updatedCategory`
        // body shape is still accepted.
        const CategoryId = req.params.CategoryId || req.body.CategoryId
        const source =
          req.body.updatedCategory && typeof req.body.updatedCategory === "object"
            ? req.body.updatedCategory
            : req.body;
        const userId=req.user._id;
        const ipAddress=req.ip

        if (!mongoose.isValidObjectId(CategoryId)) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        const category = await Category.findById(CategoryId)
        if (!category) {
            return res.status(404).json({ message: "Category is not found" })
        }

        if (source.name !== undefined) {
            const cleanName = String(source.name).trim();
            if (!cleanName) {
                return res.status(400).json({ message: "Category name is required" });
            }

            // Renaming "Random" would orphan every generated price-point product:
            // the next batch would silently create a second "Random".
            if (category.system && cleanName.toLowerCase() !== category.name.toLowerCase()) {
                return res
                  .status(400)
                  .json({ message: "This is a system category and cannot be renamed" });
            }

            const clash = await findByName(cleanName, category._id);
            if (clash) {
                return res.status(400).json({ message: `A category called "${clash.name}" already exists` });
            }

            category.name = cleanName;
        }

        if (source.description !== undefined) {
            category.description = String(source.description).trim();
        }

        await category.save();

        await logActivity({
          action: "Update Category",
          description: `Category "${category.name}" was updated.`,
          entity: "category",
          entityId: category._id,
          userId: userId,
          ipAddress: ipAddress,
        });

        res.status(200).json({ message: "Category successfully updated", category })

    } catch (error) {
        res.status(500).json({ message: "Error in update status Category", error: error.message });
    }

}


module.exports.Searchcategory = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    
    const category = await Category.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { description : { $regex: query, $options: "i" } },
     
      
      ],
    }).lean();

    // The list shows a "Total Product" column, so a searched category has to
    // carry the same count the unfiltered list gives it — otherwise the column
    // goes blank the moment someone types. Counted over just the matches rather
    // than the whole catalogue, since that is all this response can show.
    const counts = await Product.aggregate([
      { $match: { Category: { $in: category.map((c) => c._id) } } },
      { $group: { _id: "$Category", count: { $sum: 1 } } },
    ]);
    const countByCat = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json(
      category.map((entry) => ({
        ...entry,
        productCount: countByCat.get(String(entry._id)) || 0,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: "Error finding category", error: error.message });
  }
};

