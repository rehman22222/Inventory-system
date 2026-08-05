const CLOUDINARY_UPLOAD = "/upload/";

function withCloudinaryTransform(url: string, transform: string): string {
  if (!url || !url.includes("res.cloudinary.com/") || !url.includes(CLOUDINARY_UPLOAD)) {
    return url;
  }

  const [prefix, rest] = url.split(CLOUDINARY_UPLOAD);
  if (!prefix || !rest) return url;

  // Cloudinary transforms live between `/upload/` and `/v123/...`.
  // If an image has already passed through this helper, replace the old
  // transform instead of chaining another one. That keeps URLs short and avoids
  // asking Cloudinary for oversized intermediate images.
  const segments = rest.split("/");
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const publicPath = versionIndex >= 0 ? segments.slice(versionIndex).join("/") : rest;

  if (rest.startsWith(`${transform}/`)) return url;
  return `${prefix}${CLOUDINARY_UPLOAD}${transform}/${publicPath}`;
}

/* Cloudinary delivery optimisation.
 *
 * Inserts `f_auto,q_auto` into a Cloudinary URL so the image is served as
 * WebP/AVIF (whatever the browser supports) at an automatically chosen quality.
 * A no-op for non-Cloudinary URLs and safe to call anywhere. */
export function cldAuto(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto");
}

export function cldImage(url: string, transform: string): string {
  return withCloudinaryTransform(url, transform);
}

/* Product images are displayed on a standard white 1:1 catalogue canvas.
 *
 * Portrait, landscape, and oddly cropped uploads are padded instead of stretched
 * or cut, so existing and future Cloudinary product uploads keep a consistent
 * product-card/detail-page shape across the shop. */
export function cldProductImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_pad,b_white,w_900,h_900");
}

export function cldProductCardImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_pad,b_white,w_420,h_420,dpr_auto");
}

export function cldProductHeroImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_pad,b_white,w_1000,h_1000,dpr_auto");
}

export function cldProductThumbImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_pad,b_white,w_180,h_180,dpr_auto");
}

export function cldCategoryImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_fill,w_640,h_480,dpr_auto");
}
