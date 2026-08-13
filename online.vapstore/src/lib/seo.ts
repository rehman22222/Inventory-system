const SITE_ORIGIN = "https://cliffsofpuff.com";

export const canonicalUrl = (path: string) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${cleanPath}`;
};
