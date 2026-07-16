const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    // System categories (e.g. "Random") are created by the app and cannot be
    // deleted through the UI.
    system: { type: Boolean, default: false },
  },

{ timestamps: true }

);

const Category= mongoose.model("Category", CategorySchema);

module.exports =Category
