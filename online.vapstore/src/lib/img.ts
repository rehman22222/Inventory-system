/* Cloudinary delivery optimisation.
 *
 * Inserts `f_auto,q_auto` into a Cloudinary URL so the image is served as
 * WebP/AVIF (whatever the browser supports) at an automatically chosen quality
 * — typically 20–40% smaller with no visible loss. A no-op for non-Cloudinary
 * URLs and for URLs that already carry the transform, so it is safe to call
 * anywhere and to apply more than once. */
export function cldAuto(url: string): string {
  if (!url || !url.includes("res.cloudinary.com/") || !url.includes("/upload/")) {
    return url;
  }
  if (url.includes("f_auto")) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}
