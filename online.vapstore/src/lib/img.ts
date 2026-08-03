const CLOUDINARY_UPLOAD = "/upload/";

function withCloudinaryTransform(url: string, transform: string): string {
  if (!url || !url.includes("res.cloudinary.com/") || !url.includes(CLOUDINARY_UPLOAD)) {
    return url;
  }

  const [prefix, rest] = url.split(CLOUDINARY_UPLOAD);
  if (!prefix || !rest) return url;

  if (transform === "f_auto,q_auto" && rest.includes("f_auto") && rest.includes("q_auto")) {
    return url;
  }

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

/* Product images are displayed on a standard white 1:1 catalogue canvas.
 *
 * Portrait, landscape, and oddly cropped uploads are padded instead of stretched
 * or cut, so existing and future Cloudinary product uploads keep a consistent
 * product-card/detail-page shape across the shop. */
export function cldProductImage(url: string): string {
  return withCloudinaryTransform(url, "f_auto,q_auto,c_pad,b_white,w_900,h_900");
}
