const ttlMs = () => {
  const configured = Number(process.env.PRODUCT_CATALOG_CACHE_MS || 2000);
  return Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, 10_000)
    : 2000;
};

const cached = new Map();
const pending = new Map();

const invalidateProductCatalog = () => {
  cached.clear();
};

const getProductCatalog = async (loader, key = "full") => {
  const hit = cached.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key);

  const request = Promise.resolve()
    .then(loader)
    .then((value) => {
      cached.set(key, { value, expiresAt: Date.now() + ttlMs() });
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
};

module.exports = { getProductCatalog, invalidateProductCatalog };
