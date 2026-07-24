import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiBarChart2,
  FiDownloadCloud,
  FiEdit2,
  FiExternalLink,
  FiGlobe,
  FiGrid,
  FiImage,
  FiPlus,
  FiPercent,
  FiRefreshCw,
  FiSave,
  FiSettings,
  FiShoppingCart,
  FiTag,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiUpload,
  FiX,
  FiZap,
} from "react-icons/fi";
import {
  FaFacebookF,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
} from "react-icons/fa6";
import {
  createHeroSlide,
  createOnlineCategory,
  deleteHeroSlide,
  deleteOnlineCategory,
  deleteOnlineListing,
  deleteOnlineVoucher,
  getCatalogue,
  getHeroSlides,
  getOnlineCategories,
  getOnlineListings,
  getOnlineOrders,
  getOnlineSettings,
  getOnlineSummary,
  getOnlineVouchers,
  importInventoryCategories,
  saveOnlineListing,
  saveOnlineSettings,
  saveOnlineVoucher,
  setOrderStatus,
  toggleOnlineListing,
  updateHeroSlide,
  updateOnlineListing,
  uploadListingImages,
} from "../features/onlineStoreSlice";
import { gettingallCategory } from "../features/categorySlice";

const TABS = [
  { id: "overview", label: "Overview", icon: FiBarChart2 },
  { id: "products", label: "Products", icon: FiGrid },
  { id: "categories", label: "Categories", icon: FiGlobe },
  { id: "hero", label: "Hero slides", icon: FiImage },
  { id: "new-this-week", label: "New this week", icon: FiZap },
  { id: "deals", label: "Deals", icon: FiPercent },
  { id: "promotions", label: "Vouchers", icon: FiTag },
  { id: "orders", label: "Orders", icon: FiShoppingCart },
  { id: "settings", label: "Settings", icon: FiSettings },
];

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export default function OnlineStorePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [tab, setTab] = useState("overview");
  const online = useSelector((state) => state.onlineStore);

  const refresh = () => {
    dispatch(getOnlineSummary(30));
    dispatch(getOnlineCategories());
    dispatch(getOnlineListings());
    dispatch(getHeroSlides());
    dispatch(getOnlineVouchers());
    dispatch(getOnlineSettings());
    dispatch(getOnlineOrders());
  };

  useEffect(() => {
    refresh();
    dispatch(gettingallCategory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
            <FiGlobe /> {t("onlineStore.title", "Online Store")}
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Website presentation is separate; POS and web sales always move the
            same inventory.
          </p>
        </div>
        <button
          className="btn btn-sm gap-2"
          disabled={online.isLoading}
          onClick={refresh}
        >
          <FiRefreshCw className={online.isLoading ? "animate-spin" : ""} />{" "}
          Refresh
        </button>
      </header>

      <div className="tabs tabs-boxed w-fit max-w-full overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tab gap-2 ${tab === item.id ? "tab-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <item.icon /> {item.label}
            {item.id === "orders" && online.pendingOrders > 0 && (
              <span className="badge badge-sm badge-warning">
                {online.pendingOrders}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Overview summary={online.summary} counts={online.counts} />
      )}
      {tab === "products" && (
        <Products
          listings={online.listings}
          categories={online.categories}
          counts={online.counts}
          isActing={online.isActing}
        />
      )}
      {tab === "categories" && <Categories categories={online.categories} />}
      {tab === "hero" && (
        <HeroSlides slides={online.slides} listings={online.listings} />
      )}
      {tab === "new-this-week" && (
        <NewThisWeekControls
          listings={online.listings}
          settings={online.settings}
          isActing={online.isActing}
        />
      )}
      {tab === "deals" && (
        <DealsControls
          listings={online.listings}
          settings={online.settings}
          isActing={online.isActing}
        />
      )}
      {tab === "promotions" && (
        <Promotions
          vouchers={online.vouchers}
          listings={online.listings}
          categories={online.categories}
          isActing={online.isActing}
        />
      )}
      {tab === "orders" && (
        <Orders orders={online.orders} isActing={online.isActing} />
      )}
      {tab === "settings" && (
        <StorefrontSettings
          settings={online.settings}
          isActing={online.isActing}
        />
      )}
    </div>
  );
}

function Overview({ summary, counts }) {
  if (!summary)
    return <div className="text-sm text-base-content/60">Loading report…</div>;
  const channels = summary.channels || {};
  const cards = [
    [
      "Online orders",
      summary.online?.orders || 0,
      `last ${summary.rangeDays} days`,
    ],
    [
      "Online revenue",
      `€${money(summary.online?.revenue)}`,
      `${summary.online?.units || 0} units`,
    ],
    ["Live on site", `${counts.listed} / ${counts.total}`, "products listed"],
    ["Categories", summary.catalogue?.categories || 0, "on the storefront"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, sub]) => (
          <div
            key={label}
            className="rounded-xl border border-base-300 bg-base-100 p-4"
          >
            <div className="text-xs uppercase tracking-wide text-base-content/50">
              {label}
            </div>
            <div className="mt-2 font-display text-2xl font-bold tabular-nums">
              {value}
            </div>
            <div className="mt-1 text-xs text-base-content/50">{sub}</div>
          </div>
        ))}
      </div>
      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <h2 className="font-display text-lg font-bold">Sales by channel</h2>
        <p className="mt-1 text-xs text-base-content/50">
          Online orders and till sales write to one ledger and share one stock
          figure.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Online store", channels.online],
                ["Point of sale", channels.pos],
                ["Counter / manual", channels.counter],
              ].map(([name, data]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-right">{data?.lines || 0}</td>
                  <td className="text-right">€{money(data?.revenue)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-base-300 font-bold">
                <td>Combined</td>
                <td className="text-right">{channels.combined?.lines || 0}</td>
                <td className="text-right">
                  €{money(channels.combined?.revenue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-base-300 bg-base-100 p-4">
        <h2 className="font-display text-lg font-bold">Top online sellers</h2>
        {summary.topProducts?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((product) => (
                  <tr key={String(product._id)}>
                    <td>{product.name}</td>
                    <td className="text-right">{product.units}</td>
                    <td className="text-right">€{money(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-base-content/50">
            Top products will appear after the first paid online sale.
          </p>
        )}
      </section>
    </div>
  );
}

function Products({ listings, categories, counts, isActing }) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return listings;
    return listings.filter((listing) =>
      `${listing.webName || listing.product?.name || ""} ${listing.brand || ""}`
        .toLowerCase()
        .includes(search),
    );
  }, [listings, query]);

  const toggle = async (listing) => {
    const result = await dispatch(
      toggleOnlineListing({ id: listing._id, listed: !listing.listed }),
    );
    result.error
      ? toast.error(result.payload || "Could not update")
      : toast.success(
          result.payload.listed ? "Product is live" : "Product hidden",
        );
  };
  const remove = async (listing) => {
    if (!window.confirm("Remove from online store? Inventory is not affected."))
      return;
    const result = await dispatch(deleteOnlineListing(listing._id));
    result.error
      ? toast.error(result.payload)
      : toast.success("Removed from website");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-base-content/60">
          <strong>{counts.listed}</strong> live · {counts.total} configured
        </span>
        <div className="flex gap-2">
          <input
            className="input input-sm input-bordered"
            placeholder="Search listings…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="btn btn-sm btn-primary gap-2"
            onClick={() => setAdding(!adding)}
          >
            <FiPlus /> Add product
          </button>
        </div>
      </div>
      {adding && (
        <ProductPicker
          categories={categories}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <ProductEditor
          key={editing._id}
          listing={editing}
          categories={categories}
          isActing={isActing}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th className="text-right">Shared stock</th>
              <th className="text-right">Website price</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((listing) => {
              const stock = listing.variants?.length
                ? listing.variants.reduce(
                    (sum, option) =>
                      sum + Number(option.product?.quantity || 0),
                    0,
                  )
                : listing.product?.quantity || 0;
              return (
                <tr key={listing._id}>
                  <td>
                    <div className="font-medium">
                      {listing.webName || listing.product?.name}
                    </div>
                    <div className="text-xs text-base-content/50">
                      {listing.brand || listing.product?.name}
                    </div>
                  </td>
                  <td>{listing.category?.name || "—"}</td>
                  <td className="text-right tabular-nums">{stock}</td>
                  <td className="text-right tabular-nums">
                    {listing.salePrice ? (
                      <>
                        <span className="line-through text-base-content/40">
                          €
                          {money(
                            listing.priceOverride ?? listing.product?.Price,
                          )}
                        </span>
                        <span className="ml-2 font-bold text-error">
                          €{money(listing.salePrice)}
                        </span>
                      </>
                    ) : (
                      <>
                        €
                        {money(listing.priceOverride ?? listing.product?.Price)}
                      </>
                    )}
                    {listing.priceOverride != null && (
                      <span className="badge badge-xs ml-1">online only</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${listing.listed ? "badge-success" : ""}`}
                    >
                      {listing.listed ? "Live" : "Hidden"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      className="btn btn-ghost btn-xs"
                      title="Edit website product"
                      onClick={() => setEditing(listing)}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => toggle(listing)}
                    >
                      {listing.listed ? (
                        <FiToggleRight className="text-lg text-success" />
                      ) : (
                        <FiToggleLeft className="text-lg" />
                      )}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => remove(listing)}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-base-content/50"
                >
                  No online products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductEditor({ listing, categories, isActing, onClose }) {
  const dispatch = useDispatch();
  const [useInventoryPrice, setUseInventoryPrice] = useState(
    listing.priceOverride == null,
  );
  const [applyToOptions, setApplyToOptions] = useState(false);
  const [draft, setDraft] = useState({
    webName: listing.webName || listing.product?.name || "",
    brand: listing.brand || "",
    category: listing.category?._id || "",
    priceOverride: listing.priceOverride ?? listing.product?.Price ?? "",
    salePrice: listing.salePrice ?? "",
    saleStartsAt: toLocalDateTime(listing.saleStartsAt),
    saleEndsAt: toLocalDateTime(listing.saleEndsAt),
    shortDescription: listing.shortDescription || "",
    description: listing.description || "",
    featured: Boolean(listing.featured),
    listed: Boolean(listing.listed),
    tags: (listing.tags || []).filter((tag) => tag !== "sale"),
  });
  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const toggleTag = (tag) =>
    set(
      "tags",
      draft.tags.includes(tag)
        ? draft.tags.filter((item) => item !== tag)
        : [...draft.tags, tag],
    );

  const save = async (event) => {
    event.preventDefault();
    if (!draft.category) return toast.error("Choose an online category");
    if (!useInventoryPrice && Number(draft.priceOverride) <= 0) {
      return toast.error("Enter a valid online price");
    }
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        ...draft,
        priceOverride: useInventoryPrice ? null : draft.priceOverride,
        salePrice: draft.salePrice || null,
        saleStartsAt: draft.saleStartsAt || null,
        saleEndsAt: draft.saleEndsAt || null,
        applyPriceToVariants: applyToOptions,
      }),
    );
    if (result.error)
      return toast.error(result.payload || "Could not save product");
    toast.success("Website product saved; inventory price was not changed");
    onClose();
  };

  return (
    <form
      onSubmit={save}
      className="rounded-xl border border-primary/30 bg-base-100 p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-lg font-bold">
            Edit website product
          </h3>
          <p className="text-xs text-base-content/60">
            Online-only details. Inventory/POS price remains €
            {money(listing.product?.Price)}.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onClose}
        >
          <FiX />
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Online product name">
          <input
            className="input input-sm input-bordered"
            value={draft.webName}
            onChange={(event) => set("webName", event.target.value)}
            required
          />
        </Field>
        <Field label="Brand">
          <input
            className="input input-sm input-bordered"
            value={draft.brand}
            onChange={(event) => set("brand", event.target.value)}
          />
        </Field>
        <Field label="Online category" className="md:col-span-2">
          <select
            className="select select-sm select-bordered"
            value={draft.category}
            onChange={(event) => set("category", event.target.value)}
            required
          >
            <option value="">Choose category</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 rounded-lg bg-base-200/70 p-3">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Regular online price (€)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input input-sm input-bordered"
              disabled={useInventoryPrice}
              value={draft.priceOverride}
              onChange={(event) => set("priceOverride", event.target.value)}
            />
          </Field>
          <Field label="Sale price (€)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input input-sm input-bordered"
              placeholder="No sale"
              value={draft.salePrice}
              onChange={(event) => set("salePrice", event.target.value)}
            />
          </Field>
          <Field label="Sale starts">
            <input
              type="datetime-local"
              className="input input-sm input-bordered"
              value={draft.saleStartsAt}
              onChange={(event) => set("saleStartsAt", event.target.value)}
            />
          </Field>
          <Field label="Sale ends">
            <input
              type="datetime-local"
              className="input input-sm input-bordered"
              value={draft.saleEndsAt}
              onChange={(event) => set("saleEndsAt", event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-xs">
          <Check
            checked={useInventoryPrice}
            onChange={setUseInventoryPrice}
            label="Follow inventory price automatically"
          />
          {!!listing.variants?.length && (
            <Check
              checked={applyToOptions}
              onChange={setApplyToOptions}
              label={`Apply regular online price to all ${listing.variants.length} options`}
            />
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Card description">
          <textarea
            className="textarea textarea-sm textarea-bordered"
            rows={2}
            value={draft.shortDescription}
            onChange={(event) => set("shortDescription", event.target.value)}
          />
        </Field>
        <Field label="Full description">
          <textarea
            className="textarea textarea-sm textarea-bordered"
            rows={2}
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        {[
          ["new", "New this week"],
          ["bestseller", "Bestseller"],
          ["limited", "Limited"],
        ].map(([tag, label]) => (
          <Check
            key={tag}
            checked={draft.tags.includes(tag)}
            onChange={() => toggleTag(tag)}
            label={label}
          />
        ))}
        <Check
          checked={draft.featured}
          onChange={(value) => set("featured", value)}
          label="featured"
        />
        <Check
          checked={draft.listed}
          onChange={(value) => set("listed", value)}
          label="live on website"
        />
        <button
          className="btn btn-sm btn-primary ml-auto gap-2"
          disabled={isActing}
        >
          <FiSave /> Save website product
        </button>
      </div>
    </form>
  );
}

function ProductPicker({ categories, onClose }) {
  const dispatch = useDispatch();
  const { catalogue, isLoading, isActing, isUploading } = useSelector(
    (state) => state.onlineStore,
  );
  const categoryState = useSelector((state) => state.category.getallCategory);
  const inventoryCategories = Array.isArray(categoryState?.categoriesWithCount)
    ? categoryState.categoriesWithCount
    : Array.isArray(categoryState)
      ? categoryState
      : [];
  const [search, setSearch] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("");
  const [onlineCategory, setOnlineCategory] = useState("");
  const [page, setPage] = useState(1);
  const [images, setImages] = useState([]);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        dispatch(getCatalogue({ search, category: inventoryCategory, page })),
      250,
    );
    return () => clearTimeout(timer);
  }, [dispatch, search, inventoryCategory, page]);

  const upload = async (files) => {
    const selected = Array.from(files || []);
    if (images.length + selected.length > 8)
      return toast.error("Maximum 8 images");
    const result = await dispatch(uploadListingImages(selected));
    result.error
      ? toast.error(result.payload || "Upload failed")
      : setImages((current) => [...current, ...result.payload].slice(0, 8));
  };
  const add = async (product) => {
    if (!onlineCategory) return toast.error("Choose an online category");
    const result = await dispatch(
      saveOnlineListing({
        product: product._id,
        webName: product.name,
        category: onlineCategory,
        listed: true,
        gallery: images.map((image) => ({ ...image, alt: product.name })),
      }),
    );
    if (result.error)
      return toast.error(result.payload || "Could not add product");
    toast.success(`${product.name} is live`);
    setImages([]);
    dispatch(getOnlineListings());
    dispatch(getCatalogue({ search, category: inventoryCategory, page }));
  };

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
      <div className="flex justify-between">
        <div>
          <h3 className="font-bold">Add an inventory product to the website</h3>
          <p className="text-xs text-base-content/50">
            Stock is linked, never copied.
          </p>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <FiX />
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="input input-sm input-bordered"
          placeholder="Search inventory…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="select select-sm select-bordered"
          value={inventoryCategory}
          onChange={(event) => {
            setInventoryCategory(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All inventory categories</option>
          {inventoryCategories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          className="select select-sm select-bordered"
          value={onlineCategory}
          onChange={(event) => setOnlineCategory(event.target.value)}
          required
        >
          <option value="">Online category *</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="btn btn-sm gap-2">
          <FiUpload />{" "}
          {images.length ? `${images.length}/8 photos` : "Multiple photos"}
          <input
            hidden
            multiple
            type="file"
            accept="image/*"
            disabled={isUploading}
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {!!images.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={`${image.url}-${index}`} className="relative">
              <img
                className="h-16 w-16 rounded border object-cover"
                src={image.url}
                alt=""
              />
              <button
                type="button"
                className="btn btn-circle btn-error btn-xs absolute -right-2 -top-2"
                onClick={() =>
                  setImages((current) => current.filter((_, i) => i !== index))
                }
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 max-h-80 overflow-auto">
        <table className="table table-sm">
          <thead className="sticky top-0 bg-base-100">
            <tr>
              <th>Product</th>
              <th>Inventory category</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalogue.products.map((product) => (
              <tr key={product._id}>
                <td>{product.name}</td>
                <td>{product.Category?.name || "—"}</td>
                <td className="text-right">{product.quantity}</td>
                <td className="text-right">€{money(product.Price)}</td>
                <td className="text-right">
                  {product.onlineListing ? (
                    <span className="badge badge-sm">
                      {product.onlineListing.listed ? "Live" : "Added"}
                    </span>
                  ) : (
                    <button
                      className="btn btn-primary btn-xs"
                      disabled={isActing || !onlineCategory}
                      onClick={() => add(product)}
                    >
                      Add
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !catalogue.products.length && (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-base-content/50"
                >
                  No products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {catalogue.pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <button
            className="btn btn-xs"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          Page {catalogue.page} of {catalogue.pages}
          <button
            className="btn btn-xs"
            disabled={page >= catalogue.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function Categories({ categories }) {
  const dispatch = useDispatch();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const add = async (event) => {
    event.preventDefault();
    const result = await dispatch(createOnlineCategory({ name, description }));
    if (result.error)
      return toast.error(result.payload || "Could not create category");
    setName("");
    setDescription("");
    toast.success("Category created");
  };
  const importAll = async () => {
    const result = await dispatch(importInventoryCategories());
    if (result.error) toast.error(result.payload);
    else {
      toast.success(result.payload.message);
      dispatch(getOnlineCategories());
    }
  };
  const remove = async (category) => {
    if (!window.confirm(`Delete ${category.name}?`)) return;
    const result = await dispatch(deleteOnlineCategory(category._id));
    result.error
      ? toast.error(result.payload)
      : toast.success("Category deleted");
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <form
        onSubmit={add}
        className="h-fit space-y-3 rounded-xl border bg-base-100 p-4"
      >
        <h3 className="font-bold">New online category</h3>
        <input
          className="input input-sm input-bordered w-full"
          placeholder="Category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <textarea
          className="textarea textarea-sm textarea-bordered w-full"
          placeholder="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <button className="btn btn-primary btn-sm w-full gap-2">
          <FiPlus /> Add category
        </button>
        <button
          type="button"
          className="btn btn-sm w-full gap-2"
          onClick={importAll}
        >
          <FiDownloadCloud /> Import inventory categories
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Category</th>
              <th>Products</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category._id}>
                <td>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-base-content/50">
                    /{category.slug}
                  </div>
                </td>
                <td>{category.listingCount || 0}</td>
                <td>
                  <span className="badge badge-sm">
                    {category.active ? "Visible" : "Hidden"}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => remove(category)}
                  >
                    <FiTrash2 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BLANK_SLIDE = {
  eyebrow: "",
  titleTop: "",
  titleItalic: "",
  titleBadge: "",
  titleBottom: "",
  copy: "",
  tone: "ink",
  image: "",
  imageAlt: "",
  listing: "",
  burst: { top: "", big: "", bottom: "" },
  ctaPrimary: { label: "Shop now", to: "/shop" },
  ctaSecondary: { label: "View all products", to: "/shop" },
  active: true,
  sortWeight: 0,
};

function HeroSlides({ slides, listings }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(BLANK_SLIDE);
  const [editingId, setEditingId] = useState("");
  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setNested = (group, key, value) =>
    setDraft((current) => ({
      ...current,
      [group]: { ...current[group], [key]: value },
    }));
  const reset = () => {
    setDraft(BLANK_SLIDE);
    setEditingId("");
  };
  const edit = (slide) => {
    setEditingId(slide._id);
    setDraft({
      ...BLANK_SLIDE,
      ...slide,
      listing: slide.listing?._id || slide.listing || "",
      burst: { ...BLANK_SLIDE.burst, ...(slide.burst || {}) },
      ctaPrimary: { ...BLANK_SLIDE.ctaPrimary, ...(slide.ctaPrimary || {}) },
      ctaSecondary: {
        ...BLANK_SLIDE.ctaSecondary,
        ...(slide.ctaSecondary || {}),
      },
    });
  };
  const save = async (event) => {
    event.preventDefault();
    if (!draft.titleTop.trim()) return toast.error("Headline is required");
    if (!draft.listing)
      return toast.error("Choose the product this slide should open");
    const selectedListing = listings.find(
      (listing) => listing._id === draft.listing,
    );
    const payload = {
      ...draft,
      listing: draft.listing,
      ctaPrimary: {
        label: draft.ctaPrimary.label || "Shop this product",
        to: "/product/$id",
        params: selectedListing?.slug ? { id: selectedListing.slug } : {},
      },
      ctaSecondary: {
        label: draft.ctaSecondary.label || "Browse all",
        to: "/shop",
        params: {},
      },
    };
    const result = await dispatch(
      editingId
        ? updateHeroSlide({ id: editingId, ...payload })
        : createHeroSlide(payload),
    );
    if (result.error)
      return toast.error(result.payload || "Could not save slide");
    toast.success(editingId ? "Slide updated" : "Slide created");
    reset();
    dispatch(getHeroSlides());
  };
  const toggle = async (slide) => {
    const result = await dispatch(
      updateHeroSlide({ id: slide._id, active: !slide.active }),
    );
    result.error ? toast.error(result.payload) : toast.success("Slide updated");
  };
  const remove = async (slide) => {
    if (!window.confirm("Delete this hero slide?")) return;
    const result = await dispatch(deleteHeroSlide(slide._id));
    result.error ? toast.error(result.payload) : toast.success("Slide deleted");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
      <form
        onSubmit={save}
        className="h-fit space-y-3 rounded-xl border bg-base-100 p-4"
      >
        <div className="flex justify-between">
          <h3 className="font-bold">
            {editingId ? "Edit hero slide" : "New hero slide"}
          </h3>
          {editingId && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={reset}
            >
              <FiX />
            </button>
          )}
        </div>
        <input
          className="input input-sm input-bordered w-full"
          placeholder="Eyebrow"
          value={draft.eyebrow}
          onChange={(event) => set("eyebrow", event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          {[
            ["titleTop", "Headline *"],
            ["titleItalic", "Italic word"],
            ["titleBadge", "Boxed word"],
            ["titleBottom", "Final line"],
          ].map(([key, placeholder]) => (
            <input
              key={key}
              className="input input-sm input-bordered"
              placeholder={placeholder}
              value={draft[key]}
              onChange={(event) => set(key, event.target.value)}
            />
          ))}
        </div>
        <textarea
          className="textarea textarea-sm textarea-bordered w-full"
          rows={2}
          placeholder="Supporting copy"
          value={draft.copy}
          onChange={(event) => set("copy", event.target.value)}
        />
        <select
          className="select select-sm select-bordered w-full"
          value={draft.listing}
          required
          onChange={(event) => set("listing", event.target.value)}
        >
          <option value="">Choose showcase product *</option>
          {listings
            .filter((listing) => listing.listed)
            .map((listing) => (
              <option key={listing._id} value={listing._id}>
                {listing.webName || listing.product?.name}
              </option>
            ))}
        </select>
        <input
          type="url"
          className="input input-sm input-bordered w-full"
          placeholder="Image URL (auto from product when empty)"
          value={draft.image}
          onChange={(event) => set("image", event.target.value)}
        />
        <div className="grid grid-cols-3 gap-2">
          {[
            ["top", "Badge top"],
            ["big", "20%"],
            ["bottom", "off"],
          ].map(([key, placeholder]) => (
            <input
              key={key}
              className="input input-sm input-bordered"
              placeholder={placeholder}
              value={draft.burst[key]}
              onChange={(event) => setNested("burst", key, event.target.value)}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input input-sm input-bordered"
            placeholder="Shop this product"
            value={draft.ctaPrimary.label}
            onChange={(event) =>
              setNested("ctaPrimary", "label", event.target.value)
            }
          />
          <input
            className="input input-sm input-bordered"
            placeholder="Browse all"
            value={draft.ctaSecondary.label}
            onChange={(event) =>
              setNested("ctaSecondary", "label", event.target.value)
            }
          />
        </div>
        <p className="text-[11px] leading-relaxed text-base-content/50">
          The first button automatically opens the selected product. The second
          always opens the complete online catalogue.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="select select-sm select-bordered"
            value={draft.tone}
            onChange={(event) => set("tone", event.target.value)}
          >
            <option value="ink">Dark</option>
            <option value="cream">Light</option>
            <option value="accent">Accent</option>
          </select>
          <input
            type="number"
            className="input input-sm input-bordered"
            placeholder="Order"
            value={draft.sortWeight}
            onChange={(event) => set("sortWeight", Number(event.target.value))}
          />
        </div>
        <button className="btn btn-primary btn-sm w-full gap-2">
          <FiSave /> {editingId ? "Save slide" : "Add slide"}
        </button>
      </form>
      <div className="space-y-3">
        {slides.map((slide) => (
          <article
            key={slide._id}
            className="flex items-start justify-between gap-4 rounded-xl border bg-base-100 p-4"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase text-base-content/50">
                {slide.eyebrow || "Hero promotion"}
              </div>
              <div className="truncate font-display text-lg font-bold">
                {slide.titleTop} {slide.titleItalic} {slide.titleBadge}{" "}
                {slide.titleBottom}
              </div>
              <p className="line-clamp-2 text-xs text-base-content/60">
                {slide.copy}
              </p>
              <div className="mt-2 flex gap-2">
                <span className="badge badge-sm">{slide.tone}</span>
                {slide.listing && (
                  <span className="badge badge-info badge-sm">product</span>
                )}
                <span className="badge badge-ghost badge-sm">
                  order {slide.sortWeight || 0}
                </span>
              </div>
            </div>
            <div className="whitespace-nowrap">
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => edit(slide)}
              >
                <FiEdit2 />
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => toggle(slide)}
              >
                {slide.active ? (
                  <FiToggleRight className="text-lg text-success" />
                ) : (
                  <FiToggleLeft className="text-lg" />
                )}
              </button>
              <button
                className="btn btn-ghost btn-xs text-error"
                onClick={() => remove(slide)}
              >
                <FiTrash2 />
              </button>
            </div>
          </article>
        ))}
        {!slides.length && (
          <div className="rounded-xl border border-dashed p-8 text-center text-base-content/50">
            No hero slides yet.
          </div>
        )}
      </div>
    </div>
  );
}

const DEFAULT_NEW_THIS_WEEK = {
  enabled: true,
  eyebrow: "Fresh drops",
  title: "New this week.",
  subtitle:
    "The latest products to land in store, selected by the CliffsOfPuff team.",
  limit: 8,
};

function NewThisWeekControls({ listings, settings, isActing }) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(DEFAULT_NEW_THIS_WEEK);

  useEffect(() => {
    setDraft({
      ...DEFAULT_NEW_THIS_WEEK,
      ...(settings?.newThisWeek || {}),
    });
  }, [settings]);

  const selectedCount = listings.filter((listing) =>
    listing.tags?.includes("new"),
  ).length;
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (!listing.listed) return false;
      if (!search) return true;
      return `${listing.webName || listing.product?.name || ""} ${
        listing.brand || ""
      }`
        .toLowerCase()
        .includes(search);
    });
  }, [listings, query]);

  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const saveSection = async (event) => {
    event.preventDefault();
    const result = await dispatch(
      saveOnlineSettings({
        newThisWeek: { ...draft, limit: Number(draft.limit) },
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not save the homepage section")
      : toast.success("New this week section saved");
  };

  const toggleProduct = async (listing) => {
    const tags = (listing.tags || []).filter((tag) => tag !== "sale");
    const selected = tags.includes("new");
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        tags: selected ? tags.filter((tag) => tag !== "new") : [...tags, "new"],
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not update the homepage product")
      : toast.success(
          selected ? "Removed from New this week" : "Added to New this week",
        );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form
        onSubmit={saveSection}
        className="h-fit space-y-4 rounded-xl border bg-base-100 p-5"
      >
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <FiZap /> Homepage section
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-base-content/55">
            This block appears directly below the hero. Product prices and stock
            still come from the shared inventory.
          </p>
        </div>
        <Check
          checked={draft.enabled}
          onChange={(value) => set("enabled", value)}
          label="Show New this week on the storefront"
        />
        <Field label="Small heading">
          <input
            className="input input-sm input-bordered"
            maxLength={80}
            value={draft.eyebrow}
            onChange={(event) => set("eyebrow", event.target.value)}
          />
        </Field>
        <Field label="Main heading">
          <input
            className="input input-sm input-bordered"
            maxLength={120}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </Field>
        <Field label="Supporting text">
          <textarea
            className="textarea textarea-sm textarea-bordered"
            rows={3}
            maxLength={300}
            value={draft.subtitle}
            onChange={(event) => set("subtitle", event.target.value)}
          />
        </Field>
        <Field label="Maximum products">
          <select
            className="select select-sm select-bordered"
            value={draft.limit}
            onChange={(event) => set("limit", Number(event.target.value))}
          >
            <option value={4}>4 products</option>
            <option value={8}>8 products</option>
            <option value={12}>12 products</option>
          </select>
        </Field>
        <button
          className="btn btn-primary btn-sm w-full gap-2"
          disabled={isActing}
        >
          <FiSave /> Save section
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-display font-bold">Choose products</h3>
            <p className="text-xs text-base-content/50">
              {selectedCount
                ? `${selectedCount} manually selected · the first ${draft.limit} are shown`
                : `No manual selection yet · the newest ${draft.limit} products are shown automatically`}
            </p>
          </div>
          <input
            className="input input-sm input-bordered"
            placeholder="Search live products…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-[620px] divide-y overflow-y-auto">
          {shown.map((listing) => {
            const selected = listing.tags?.includes("new");
            const stock = listing.variants?.length
              ? listing.variants.reduce(
                  (sum, option) => sum + Number(option.product?.quantity || 0),
                  0,
                )
              : Number(listing.product?.quantity || 0);
            return (
              <div
                key={listing._id}
                className={`flex items-center justify-between gap-4 p-4 ${
                  selected ? "bg-primary/5" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {listing.webName || listing.product?.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/50">
                    <span>{listing.brand || "Unbranded"}</span>
                    <span>·</span>
                    <span>{stock} in shared stock</span>
                    {selected && (
                      <span className="badge badge-primary badge-xs">
                        New this week
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm shrink-0 ${
                    selected ? "btn-primary" : "btn-outline"
                  }`}
                  disabled={isActing}
                  onClick={() => toggleProduct(listing)}
                >
                  {selected ? "Selected" : "Add"}
                </button>
              </div>
            );
          })}
          {!shown.length && (
            <div className="p-10 text-center text-sm text-base-content/50">
              No live products match this search.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const DEFAULT_DEALS = {
  enabled: true,
  eyebrow: "Live sale",
  title: "Weekly deals.",
  subtitle:
    "Limited-time online prices selected by the CliffsOfPuff team. Stock updates from the same inventory used at the till.",
  ctaLabel: "See the deals",
  limit: 4,
};

const BLANK_DEAL = {
  id: "",
  salePrice: "",
  saleStartsAt: "",
  saleEndsAt: "",
};

const dealState = (listing) => {
  const now = Date.now();
  if (!listing.salePrice) return "none";
  if (listing.saleStartsAt && new Date(listing.saleStartsAt).getTime() > now) {
    return "scheduled";
  }
  if (listing.saleEndsAt && new Date(listing.saleEndsAt).getTime() < now) {
    return "ended";
  }
  return "live";
};

function DealsControls({ listings, settings, isActing }) {
  const dispatch = useDispatch();
  const [section, setSection] = useState(DEFAULT_DEALS);
  const [deal, setDeal] = useState(BLANK_DEAL);

  useEffect(() => {
    setSection({
      ...DEFAULT_DEALS,
      ...(settings?.deals || {}),
    });
  }, [settings]);

  const dealListings = useMemo(
    () =>
      listings
        .filter((listing) => listing.listed || listing.salePrice != null)
        .sort((a, b) =>
          String(a.webName || a.product?.name || "").localeCompare(
            String(b.webName || b.product?.name || ""),
          ),
        ),
    [listings],
  );
  const configuredDeals = useMemo(
    () =>
      listings
        .filter((listing) => listing.salePrice != null)
        .sort((a, b) => {
          const order = { live: 0, scheduled: 1, ended: 2, none: 3 };
          return order[dealState(a)] - order[dealState(b)];
        }),
    [listings],
  );
  const selectedListing = listings.find((listing) => listing._id === deal.id);
  const regularPrice = selectedListing
    ? Number(
        selectedListing.priceOverride ?? selectedListing.product?.Price ?? 0,
      )
    : 0;

  const setSectionField = (key, value) =>
    setSection((current) => ({ ...current, [key]: value }));
  const setDealField = (key, value) =>
    setDeal((current) => ({ ...current, [key]: value }));

  const editDeal = (listing) => {
    setDeal({
      id: listing._id,
      salePrice: listing.salePrice ?? "",
      saleStartsAt: toLocalDateTime(listing.saleStartsAt),
      saleEndsAt: toLocalDateTime(listing.saleEndsAt),
    });
  };

  const saveSection = async (event) => {
    event.preventDefault();
    const result = await dispatch(
      saveOnlineSettings({
        deals: { ...section, limit: Number(section.limit) },
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not save Deals settings")
      : toast.success("Deals section saved");
  };

  const saveDeal = async (event) => {
    event.preventDefault();
    if (!selectedListing) return toast.error("Choose a website product");
    const salePrice = Number(deal.salePrice);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      return toast.error("Enter a valid deal price");
    }
    if (regularPrice > 0 && salePrice >= regularPrice) {
      return toast.error(
        "Deal price must be lower than the regular online price",
      );
    }
    if (
      deal.saleStartsAt &&
      deal.saleEndsAt &&
      new Date(deal.saleEndsAt) <= new Date(deal.saleStartsAt)
    ) {
      return toast.error("Deal end must be after its start");
    }
    const result = await dispatch(
      updateOnlineListing({
        id: selectedListing._id,
        salePrice,
        saleStartsAt: deal.saleStartsAt || null,
        saleEndsAt: deal.saleEndsAt || null,
      }),
    );
    if (result.error) {
      return toast.error(result.payload || "Could not save the deal");
    }
    toast.success("Online deal saved; inventory/POS price was not changed");
    setDeal(BLANK_DEAL);
  };

  const clearDeal = async (listing) => {
    if (
      !window.confirm(
        `Remove the online deal from ${
          listing.webName || listing.product?.name
        }?`,
      )
    ) {
      return;
    }
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        salePrice: null,
        saleStartsAt: null,
        saleEndsAt: null,
      }),
    );
    if (result.error) {
      return toast.error(result.payload || "Could not clear the deal");
    }
    if (deal.id === listing._id) setDeal(BLANK_DEAL);
    toast.success("Online deal removed");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[410px_1fr]">
      <div className="space-y-5">
        <form
          onSubmit={saveSection}
          className="space-y-4 rounded-xl border bg-base-100 p-5"
        >
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <FiPercent /> Deals homepage section
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-base-content/55">
              The discount percentage is calculated automatically from active
              deals. This copy only changes the storefront presentation.
            </p>
          </div>
          <Check
            checked={section.enabled}
            onChange={(value) => setSectionField("enabled", value)}
            label="Show Deals section on the storefront"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Small heading">
              <input
                className="input input-sm input-bordered"
                maxLength={80}
                value={section.eyebrow}
                onChange={(event) =>
                  setSectionField("eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Button label">
              <input
                className="input input-sm input-bordered"
                maxLength={40}
                value={section.ctaLabel}
                onChange={(event) =>
                  setSectionField("ctaLabel", event.target.value)
                }
              />
            </Field>
          </div>
          <Field label="Main heading">
            <input
              className="input input-sm input-bordered"
              maxLength={120}
              value={section.title}
              onChange={(event) => setSectionField("title", event.target.value)}
            />
          </Field>
          <Field label="Supporting text">
            <textarea
              className="textarea textarea-sm textarea-bordered"
              rows={3}
              maxLength={300}
              value={section.subtitle}
              onChange={(event) =>
                setSectionField("subtitle", event.target.value)
              }
            />
          </Field>
          <Field label="Maximum deal products">
            <select
              className="select select-sm select-bordered"
              value={section.limit}
              onChange={(event) =>
                setSectionField("limit", Number(event.target.value))
              }
            >
              {[2, 4, 6, 8].map((limit) => (
                <option key={limit} value={limit}>
                  {limit} products
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn btn-primary btn-sm w-full gap-2"
            disabled={isActing}
          >
            <FiSave /> Save Deals section
          </button>
        </form>

        <form
          onSubmit={saveDeal}
          className="space-y-4 rounded-xl border bg-base-100 p-5"
        >
          <div>
            <h3 className="font-display text-lg font-bold">
              {deal.id ? "Edit product deal" : "Add product deal"}
            </h3>
            <p className="mt-1 text-xs text-base-content/55">
              Online price only. Shared stock and POS price are unchanged.
            </p>
          </div>
          <Field label="Live website product">
            <select
              className="select select-sm select-bordered"
              value={deal.id}
              onChange={(event) => {
                const listing = listings.find(
                  (item) => item._id === event.target.value,
                );
                listing ? editDeal(listing) : setDeal(BLANK_DEAL);
              }}
              required
            >
              <option value="">Choose product</option>
              {dealListings.map((listing) => (
                <option key={listing._id} value={listing._id}>
                  {listing.webName || listing.product?.name}
                  {listing.listed ? "" : " (hidden)"}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Regular online price">
              <input
                className="input input-sm input-bordered"
                value={regularPrice ? `€${money(regularPrice)}` : "—"}
                disabled
              />
            </Field>
            <Field label="Deal price (€)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input input-sm input-bordered"
                value={deal.salePrice}
                onChange={(event) =>
                  setDealField("salePrice", event.target.value)
                }
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered"
                value={deal.saleStartsAt}
                onChange={(event) =>
                  setDealField("saleStartsAt", event.target.value)
                }
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered"
                value={deal.saleEndsAt}
                onChange={(event) =>
                  setDealField("saleEndsAt", event.target.value)
                }
              />
            </Field>
          </div>
          <div className="flex gap-2">
            {deal.id && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDeal(BLANK_DEAL)}
              >
                Cancel
              </button>
            )}
            <button
              className="btn btn-primary btn-sm flex-1 gap-2"
              disabled={isActing}
            >
              <FiSave /> Save online deal
            </button>
          </div>
        </form>
      </div>

      <section className="overflow-hidden rounded-xl border bg-base-100">
        <div className="border-b p-4">
          <h3 className="font-display font-bold">Configured product deals</h3>
          <p className="text-xs text-base-content/50">
            Live, scheduled, and ended offers remain visible here for audit and
            quick reuse.
          </p>
        </div>
        <div className="divide-y">
          {configuredDeals.map((listing) => {
            const state = dealState(listing);
            const regular = Number(
              listing.priceOverride ?? listing.product?.Price ?? 0,
            );
            const discount =
              regular > Number(listing.salePrice)
                ? Math.round(
                    ((regular - Number(listing.salePrice)) / regular) * 100,
                  )
                : 0;
            return (
              <article
                key={listing._id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {listing.webName || listing.product?.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-base-content/50">
                      €{money(regular)}
                    </span>
                    <span>→</span>
                    <strong className="text-error">
                      €{money(listing.salePrice)}
                    </strong>
                    {discount > 0 && (
                      <span className="badge badge-error badge-sm">
                        -{discount}%
                      </span>
                    )}
                    <span
                      className={`badge badge-sm ${
                        state === "live"
                          ? "badge-success"
                          : state === "scheduled"
                            ? "badge-info"
                            : "badge-ghost"
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                  {(listing.saleStartsAt || listing.saleEndsAt) && (
                    <div className="mt-1 text-[11px] text-base-content/45">
                      {listing.saleStartsAt
                        ? `Starts ${new Date(
                            listing.saleStartsAt,
                          ).toLocaleString()}`
                        : "Starts immediately"}
                      {" · "}
                      {listing.saleEndsAt
                        ? `Ends ${new Date(listing.saleEndsAt).toLocaleString()}`
                        : "No end date"}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={isActing}
                    onClick={() => editDeal(listing)}
                  >
                    <FiEdit2 /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    disabled={isActing}
                    onClick={() => clearDeal(listing)}
                  >
                    <FiTrash2 /> Clear
                  </button>
                </div>
              </article>
            );
          })}
          {!configuredDeals.length && (
            <div className="p-10 text-center text-sm text-base-content/50">
              No product deals configured yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const BLANK_VOUCHER = {
  id: "",
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  value: "",
  minSpend: "",
  maxDiscount: "",
  scope: "entire_order",
  listings: [],
  categories: [],
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perCustomerLimit: "1",
  active: true,
};

function Promotions({ vouchers, listings, categories, isActing }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(BLANK_VOUCHER);
  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const toggleTarget = (key, id) =>
    set(
      key,
      draft[key].includes(id)
        ? draft[key].filter((item) => item !== id)
        : [...draft[key], id],
    );
  const edit = (voucher) =>
    setDraft({
      ...BLANK_VOUCHER,
      ...voucher,
      id: voucher._id,
      listings: (voucher.listings || []).map((item) => item._id || item),
      categories: (voucher.categories || []).map((item) => item._id || item),
      startsAt: toLocalDateTime(voucher.startsAt),
      endsAt: toLocalDateTime(voucher.endsAt),
      usageLimit: voucher.usageLimit ?? "",
      perCustomerLimit: voucher.perCustomerLimit ?? "",
      maxDiscount: voucher.maxDiscount ?? "",
    });
  const save = async (event) => {
    event.preventDefault();
    const result = await dispatch(saveOnlineVoucher(draft));
    if (result.error)
      return toast.error(result.payload || "Could not save voucher");
    toast.success(draft.id ? "Voucher updated" : "Voucher created");
    setDraft(BLANK_VOUCHER);
    dispatch(getOnlineVouchers());
  };
  const remove = async (voucher) => {
    if (!window.confirm(`Delete voucher ${voucher.code}?`)) return;
    const result = await dispatch(deleteOnlineVoucher(voucher._id));
    result.error
      ? toast.error(result.payload)
      : toast.success("Voucher removed or disabled");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form
        onSubmit={save}
        className="h-fit space-y-3 rounded-xl border bg-base-100 p-4"
      >
        <div className="flex justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">
              {draft.id ? "Edit voucher" : "Create voucher"}
            </h3>
            <p className="text-xs text-base-content/50">
              Server validated at checkout.
            </p>
          </div>
          {draft.id && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setDraft(BLANK_VOUCHER)}
            >
              <FiX />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input input-sm input-bordered uppercase"
            placeholder="WELCOME10"
            value={draft.code}
            onChange={(event) => set("code", event.target.value.toUpperCase())}
            required
          />
          <input
            className="input input-sm input-bordered"
            placeholder="Campaign name"
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            required
          />
        </div>
        <textarea
          className="textarea textarea-sm textarea-bordered w-full"
          placeholder="Internal description"
          value={draft.description}
          onChange={(event) => set("description", event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="select select-sm select-bordered"
            value={draft.discountType}
            onChange={(event) => set("discountType", event.target.value)}
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (€)</option>
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={draft.discountType === "percentage" ? 100 : undefined}
            className="input input-sm input-bordered"
            placeholder="Value"
            value={draft.value}
            onChange={(event) => set("value", event.target.value)}
            required
          />
          <input
            type="number"
            min="0"
            step="0.01"
            className="input input-sm input-bordered"
            placeholder="Minimum spend €"
            value={draft.minSpend}
            onChange={(event) => set("minSpend", event.target.value)}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            className="input input-sm input-bordered"
            placeholder="Maximum discount €"
            value={draft.maxDiscount}
            onChange={(event) => set("maxDiscount", event.target.value)}
          />
        </div>
        <select
          className="select select-sm select-bordered w-full"
          value={draft.scope}
          onChange={(event) => set("scope", event.target.value)}
        >
          <option value="entire_order">Entire order</option>
          <option value="specific_products">Selected products</option>
          <option value="specific_categories">Selected categories</option>
        </select>
        {draft.scope === "specific_products" && (
          <TargetList
            items={listings.filter((listing) => listing.listed)}
            selected={draft.listings}
            label={(item) => item.webName || item.product?.name}
            onToggle={(id) => toggleTarget("listings", id)}
          />
        )}
        {draft.scope === "specific_categories" && (
          <TargetList
            items={categories}
            selected={draft.categories}
            label={(item) => item.name}
            onToggle={(id) => toggleTarget("categories", id)}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts (optional)">
            <input
              type="datetime-local"
              className="input input-sm input-bordered"
              value={draft.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
            />
          </Field>
          <Field label="Ends (optional)">
            <input
              type="datetime-local"
              className="input input-sm input-bordered"
              value={draft.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
            />
          </Field>
          <input
            type="number"
            min="1"
            className="input input-sm input-bordered"
            placeholder="Total usage limit"
            value={draft.usageLimit}
            onChange={(event) => set("usageLimit", event.target.value)}
          />
          <input
            type="number"
            min="1"
            className="input input-sm input-bordered"
            placeholder="Per customer limit"
            value={draft.perCustomerLimit}
            onChange={(event) => set("perCustomerLimit", event.target.value)}
          />
        </div>
        <Check
          checked={draft.active}
          onChange={(value) => set("active", value)}
          label="voucher active"
        />
        <button
          className="btn btn-primary btn-sm w-full gap-2"
          disabled={isActing}
        >
          <FiSave /> {draft.id ? "Save voucher" : "Create voucher"}
        </button>
      </form>
      <div className="space-y-4">
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 text-sm">
          <strong>Product discounts:</strong> use Products → Edit to schedule a
          web-only sale. Inventory/POS prices remain unchanged.
        </div>
        <div className="overflow-x-auto rounded-xl border bg-base-100">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Offer</th>
                <th>Scope</th>
                <th>Usage</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vouchers.map((voucher) => (
                <tr key={voucher._id}>
                  <td>
                    <div className="font-mono font-bold">{voucher.code}</div>
                    <div className="text-xs text-base-content/50">
                      {voucher.name}
                    </div>
                  </td>
                  <td>
                    {voucher.discountType === "percentage"
                      ? `${voucher.value}%`
                      : `€${money(voucher.value)}`}
                  </td>
                  <td className="capitalize">
                    {voucher.scope.replaceAll("_", " ")}
                  </td>
                  <td>
                    {voucher.usedCount || 0}
                    {voucher.usageLimit ? ` / ${voucher.usageLimit}` : ""}
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${voucher.active ? "badge-success" : ""}`}
                    >
                      {voucher.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => edit(voucher)}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => remove(voucher)}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
              {!vouchers.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-base-content/50"
                  >
                    No vouchers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const BLANK_SETTINGS = {
  social: { instagram: "", facebook: "", twitter: "", tiktok: "" },
  footer: { description: "", supportEmail: "", supportPhone: "", address: "" },
  announcement: { primary: "", secondary: "" },
};

const SOCIAL_CHANNELS = [
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/your-profile",
    Icon: FaInstagram,
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/your-page",
    Icon: FaFacebookF,
  },
  {
    key: "twitter",
    label: "X / Twitter",
    placeholder: "https://x.com/your-profile",
    Icon: FaXTwitter,
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@your-profile",
    Icon: FaTiktok,
  },
];

function StorefrontSettings({ settings, isActing }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(BLANK_SETTINGS);
  useEffect(() => {
    if (settings) {
      setDraft({
        social: { ...BLANK_SETTINGS.social, ...(settings.social || {}) },
        footer: { ...BLANK_SETTINGS.footer, ...(settings.footer || {}) },
        announcement: {
          ...BLANK_SETTINGS.announcement,
          ...(settings.announcement || {}),
        },
      });
    }
  }, [settings]);
  const set = (section, key, value) =>
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  const save = async (event) => {
    event.preventDefault();
    const result = await dispatch(saveOnlineSettings(draft));
    result.error
      ? toast.error(result.payload || "Could not save settings")
      : toast.success("Storefront settings saved");
  };
  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-base-100 p-5">
          <h3 className="font-display text-lg font-bold">Social channels</h3>
          <p className="text-xs text-base-content/50">
            Add the public profile links shown as icons in the online store
            footer. Empty channels stay hidden.
          </p>
          <div className="mt-4 space-y-3">
            {SOCIAL_CHANNELS.map(({ key, label, placeholder, Icon }) => (
              <Field key={key} label={`${label} profile URL`}>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-base-200 text-base-content/70">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="join w-full">
                    <input
                      type="url"
                      className="input input-sm input-bordered join-item w-full"
                      placeholder={placeholder}
                      value={draft.social[key]}
                      onChange={(event) =>
                        set("social", key, event.target.value)
                      }
                    />
                    {draft.social[key] && (
                      <a
                        className="btn btn-sm join-item"
                        href={draft.social[key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${label} profile`}
                        title={`Preview ${label}`}
                      >
                        <FiExternalLink />
                      </a>
                    )}
                  </div>
                </div>
              </Field>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-base-100 p-5">
          <h3 className="font-display text-lg font-bold">Footer & contact</h3>
          <div className="mt-4 space-y-3">
            <Field label="Brand description">
              <textarea
                className="textarea textarea-sm textarea-bordered"
                rows={3}
                value={draft.footer.description}
                onChange={(event) =>
                  set("footer", "description", event.target.value)
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                className="input input-sm input-bordered"
                placeholder="Support email"
                value={draft.footer.supportEmail}
                onChange={(event) =>
                  set("footer", "supportEmail", event.target.value)
                }
              />
              <input
                className="input input-sm input-bordered"
                placeholder="Support phone"
                value={draft.footer.supportPhone}
                onChange={(event) =>
                  set("footer", "supportPhone", event.target.value)
                }
              />
            </div>
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Store address"
              value={draft.footer.address}
              onChange={(event) => set("footer", "address", event.target.value)}
            />
          </div>
        </section>
      </div>
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Header announcement</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="input input-sm input-bordered"
            value={draft.announcement.primary}
            placeholder="Free shipping over €50 · Same-day dispatch"
            onChange={(event) =>
              set("announcement", "primary", event.target.value)
            }
          />
          <input
            className="input input-sm input-bordered"
            value={draft.announcement.secondary}
            placeholder="18+ only · Nicotine warning"
            onChange={(event) =>
              set("announcement", "secondary", event.target.value)
            }
          />
        </div>
      </section>
      <div className="flex justify-end">
        <button className="btn btn-primary gap-2" disabled={isActing}>
          <FiSave /> Save storefront settings
        </button>
      </div>
    </form>
  );
}

const NEXT_STATUS = {
  pending_payment: "paid",
  paid: "processing",
  processing: "shipped",
  shipped: "delivered",
};

function Orders({ orders, isActing }) {
  const dispatch = useDispatch();
  const setStatus = async (order, status) => {
    const result = await dispatch(setOrderStatus({ id: order._id, status }));
    result.error
      ? toast.error(result.payload)
      : toast.success(`Order marked ${status}`);
  };
  return (
    <div className="overflow-x-auto rounded-xl border bg-base-100">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Voucher</th>
            <th className="text-right">Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>
                <div className="font-mono font-bold">{order.orderNo}</div>
                <div className="text-xs text-base-content/50">
                  {new Date(order.createdAt).toLocaleString()}
                </div>
              </td>
              <td>
                <div>{order.customer?.name}</div>
                <div className="text-xs text-base-content/50">
                  {order.customer?.email}
                </div>
              </td>
              <td>
                {order.items?.reduce((sum, item) => sum + item.quantity, 0) ||
                  0}
              </td>
              <td>{order.voucher?.code || "—"}</td>
              <td className="text-right">€{money(order.total)}</td>
              <td>
                <div className="font-medium">
                  {order.payment?.method === "cash_on_delivery"
                    ? "Cash on delivery"
                    : order.payment?.provider || "Manual"}
                </div>
                <div className="text-xs capitalize text-base-content/50">
                  {order.payment?.status || "unpaid"}
                </div>
              </td>
              <td>
                <span className="badge badge-sm">
                  {order.status?.replaceAll("_", " ")}
                </span>
              </td>
              <td className="whitespace-nowrap text-right">
                {NEXT_STATUS[order.status] && (
                  <button
                    className="btn btn-primary btn-xs"
                    disabled={isActing}
                    onClick={() => setStatus(order, NEXT_STATUS[order.status])}
                  >
                    Mark {NEXT_STATUS[order.status]}
                  </button>
                )}
                {!["cancelled", "refunded", "delivered"].includes(
                  order.status,
                ) && (
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    disabled={isActing}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancel order and restore its shared stock?",
                        )
                      ) {
                        setStatus(order, "cancelled");
                      }
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-base-content/50">
                No online orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, className = "", children }) {
  return (
    <label className={`form-control ${className}`}>
      <span className="mb-1 text-xs capitalize">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 capitalize">
      <input
        type="checkbox"
        className="checkbox checkbox-sm"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function TargetList({ items, selected, label, onToggle }) {
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
      {items.map((item) => (
        <label
          key={item._id}
          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-base-200"
        >
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={selected.includes(item._id)}
            onChange={() => onToggle(item._id)}
          />
          {label(item)}
        </label>
      ))}
    </div>
  );
}
