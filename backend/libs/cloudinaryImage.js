const cloudinary = require("./Cloundinary");

/**
 * Upload an in-memory multer file (req.file) to Cloudinary.
 * Returns { url, publicId } — the only two things we persist in MongoDB.
 */
const uploadImage = async (file, folder = "product_inventory_system") => {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, { folder });
  return { url: result.secure_url, publicId: result.public_id };
};

/**
 * Delete an image from Cloudinary by its publicId. No-ops if none is given
 * so callers can safely call it unconditionally.
 */
const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    // Don't fail the request if cleanup of the old asset fails.
    console.error("Cloudinary delete failed for", publicId, error.message);
  }
};

module.exports = { uploadImage, deleteImage };
