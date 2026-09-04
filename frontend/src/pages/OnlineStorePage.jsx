import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  FiBarChart2,
  FiBookOpen,
  FiDownloadCloud,
  FiEdit2,
  FiAlertTriangle,
  FiExternalLink,
  FiGlobe,
  FiGrid,
  FiImage,
  FiMail,
  FiPlus,
  FiPercent,
  FiRefreshCw,
  FiSave,
  FiSettings,
  FiShoppingCart,
  FiStar,
  FiTag,
  FiToggleLeft,
  FiToggleRight,
  FiTrash2,
  FiLayers,
  FiUpload,
  FiUsers,
  FiAward,
  FiX,
} from "react-icons/fi";
import {
  FaFacebookF,
  FaInstagram,
  FaTiktok,
  FaXTwitter,
} from "react-icons/fa6";
import {
  createHeroSlide,
  createInventoryProduct,
  createOnlineCategory,
  deleteHeroSlide,
  deleteOnlineCategory,
  deleteOnlineListing,
  deleteOnlineVoucher,
  getCatalogue,
  getHeroSlides,
  getOnlineCategories,
  getOnlineBlogPosts,
  getOnlineReviews,
  updateOnlineReview,
  deleteOnlineReview,
  getOnlineListings,
  getOnlineOrders,
  getOnlineSettings,
  getOnlineSummary,
  getOnlineVouchers,
  getLoyaltyRules,
  getNewsletterSubscribers,
  importInventoryCategories,
  saveOnlineListing,
  saveOnlineSettings,
  saveOnlineVoucher,
  searchInventoryProducts,
  setOnlineListingStock,
  downloadOnlineReport,
  toggleOnlineListing,
  updateHeroSlide,
  updateOnlineCategory,
  updateOnlineListing,
  uploadListingImages,
} from "../features/onlineStoreSlice";
import { gettingallCategory } from "../features/categorySlice";
import CustomersTab from "../Components/onlineStore/CustomersTab";
import LoyaltyTab from "../Components/onlineStore/LoyaltyTab";
import FulfilmentModal, {
  FulfilmentTrack,
  statusLabel,
} from "../Components/onlineStore/FulfilmentModal";
import { isDemoMode } from "../lib/demoMode";
import BlogManager, { BLOG_PAGE_DEFAULTS } from "../Components/onlineStore/BlogManager";
import { Field, toLocalDateTime } from "../Components/onlineStore/shared";

/* Used by PolicyEditor, below, for the legal pages. Lazily loaded and pointing
 * at the same chunk BlogManager uses, so opening the Blog tab and then editing
 * a policy downloads the editor once. */
const RichTextEditor = lazy(() => import("../Components/onlineStore/RichTextEditor"));


const TABS = [
  { id: "overview", label: "Overview", icon: FiBarChart2 },
  { id: "products", label: "Products", icon: FiGrid },
  { id: "categories", label: "Categories", icon: FiGlobe },
  { id: "hero", label: "Hero banner", icon: FiImage },
  { id: "best-sellers", label: "Best sellers", icon: FiStar },
  { id: "deals", label: "Deals", icon: FiPercent },
  { id: "blog", label: "Blog", icon: FiBookOpen },
  { id: "promotions", label: "Vouchers", icon: FiTag },
  { id: "orders", label: "Orders", icon: FiShoppingCart },
  { id: "customers", label: "Customers", icon: FiUsers },
  { id: "loyalty", label: "Rewards", icon: FiAward },
  { id: "newsletter", label: "Emails for newsletter", icon: FiMail },
  { id: "emergency-alert", label: "Emergency alert", icon: FiAlertTriangle },
  { id: "reviews", label: "Reviews", icon: FiStar },
  { id: "settings", label: "Settings", icon: FiSettings },
];

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });


export default function OnlineStorePage() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [tab, setTab] = useState("overview");
  const [listingToEdit, setListingToEdit] = useState("");
  const [loadedTabs, setLoadedTabs] = useState({});
  const online = useSelector((state) => state.onlineStore);
  const showNoStoreAttached = isDemoMode();

  const editListing = (listing) => {
    setListingToEdit(listing._id);
    setTab("products");
  };

  const refresh = () => {
    dispatch(getOnlineSummary(30));
    dispatch(getOnlineCategories());
    dispatch(getOnlineListings());
    dispatch(getHeroSlides());
    dispatch(getOnlineVouchers());
    dispatch(getOnlineSettings());
    dispatch(getOnlineOrders());
    dispatch(getNewsletterSubscribers());
    dispatch(getOnlineReviews());
    dispatch(getOnlineBlogPosts());
    dispatch(getLoyaltyRules());
    dispatch(gettingallCategory());
    setLoadedTabs(
      Object.fromEntries(TABS.map((item) => [item.id, true])),
    );
  };

  useEffect(() => {
    dispatch(getOnlineSummary(30));
    dispatch(getOnlineSettings());
    dispatch(getOnlineOrders());
    setLoadedTabs((current) => ({
      ...current,
      overview: true,
      orders: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (loadedTabs[tab]) return;

    if (tab === "products") {
      dispatch(getOnlineCategories());
      dispatch(getOnlineListings());
      dispatch(gettingallCategory());
    } else if (tab === "categories") {
      dispatch(getOnlineCategories());
    } else if (tab === "hero") {
      dispatch(getHeroSlides());
      dispatch(getOnlineListings());
      dispatch(getOnlineCategories());
    } else if (tab === "best-sellers") {
      dispatch(getOnlineListings());
      dispatch(getOnlineSettings());
      dispatch(getOnlineCategories());
    } else if (tab === "deals") {
      dispatch(getOnlineListings());
      dispatch(getOnlineSettings());
    } else if (tab === "blog") {
      dispatch(getOnlineBlogPosts());
      dispatch(getOnlineSettings());
    } else if (tab === "promotions") {
      dispatch(getOnlineVouchers());
      dispatch(getOnlineListings());
      dispatch(getOnlineCategories());
    } else if (tab === "orders") {
      dispatch(getOnlineOrders());
    } else if (tab === "customers") {
      // The list fetches itself (it is searched and paged inside the tab); the
      // settings come along for the points name shown in its column headings.
      dispatch(getOnlineSettings());
    } else if (tab === "loyalty") {
      dispatch(getLoyaltyRules());
      dispatch(getOnlineSettings());
      // The rule editor picks targets from these, so they have to be here
      // before somebody opens it.
      dispatch(getOnlineListings());
      dispatch(getOnlineCategories());
    } else if (tab === "newsletter") {
      dispatch(getNewsletterSubscribers());
      dispatch(getOnlineSettings());
    } else if (tab === "emergency-alert") {
      dispatch(getOnlineSettings());
    } else if (tab === "reviews") {
      dispatch(getOnlineReviews());
    } else if (tab === "settings") {
      dispatch(getOnlineSettings());
      dispatch(getOnlineListings());
      dispatch(getOnlineCategories());
    }

    setLoadedTabs((current) => ({ ...current, [tab]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dispatch]);

  useEffect(() => {
    if (tab !== "settings") return;
    if (!online.listings.length) dispatch(getOnlineListings());
    if (!online.categories.length) dispatch(getOnlineCategories());
  }, [tab, dispatch, online.listings.length, online.categories.length]);

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

      {/* Fifteen sections.
          On a wide screen they are tabs. On a phone a fifteen-tab strip is a
          horizontal scroll with most of itself off the edge — you cannot see
          what is available, and you cannot tell how far along you are. A native
          select shows the whole list at once, in the platform's own picker,
          and takes one tap to open. */}
      {!showNoStoreAttached && (
        <>
          <label className="form-control w-full lg:hidden">
            <span className="sr-only">Choose a section</span>
            <select
              className="select select-bordered w-full font-medium"
              value={tab}
              onChange={(event) => setTab(event.target.value)}
            >
              {TABS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.id === "orders" && online.pendingOrders > 0
                    ? ` (${online.pendingOrders} to action)`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="tabs tabs-boxed hidden w-fit max-w-full flex-nowrap overflow-x-auto lg:flex">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`tab h-auto shrink-0 flex-nowrap gap-2 whitespace-nowrap py-2 ${tab === item.id ? "tab-active" : ""}`}
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
        </>
      )}

      {showNoStoreAttached ? (
        <NoStoreAttachedState tab={tab} />
      ) : (
        <>
          {tab === "overview" && (
            <Overview summary={online.summary} counts={online.counts} />
          )}
          {tab === "products" && (
            <Products
              listings={online.listings}
              categories={online.categories}
              counts={online.counts}
              isActing={online.isActing}
              editListingId={listingToEdit}
              onEditHandled={() => setListingToEdit("")}
            />
          )}
          {tab === "categories" && <Categories categories={online.categories} />}
          {tab === "hero" && (
            <HeroSlides
              slides={online.slides}
              listings={online.listings}
              categories={online.categories}
            />
          )}
          {tab === "best-sellers" && (
            <BestSellerControls
              listings={online.listings}
              categories={online.categories}
              settings={online.settings}
              isActing={online.isActing}
              onEditListing={editListing}
            />
          )}
          {tab === "deals" && (
            <DealsControls
              listings={online.listings}
              settings={online.settings}
              isActing={online.isActing}
            />
          )}
          {tab === "blog" && (
            <BlogManager
              posts={online.blogPosts}
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
          {tab === "customers" && <CustomersTab />}
          {tab === "loyalty" && (
            <LoyaltyTab
              settings={online.settings}
              rules={online.loyaltyRules}
              listings={online.listings}
              categories={online.categories}
              isActing={online.isActing}
            />
          )}
          {tab === "newsletter" && (
            <NewsletterEmails
              subscribers={online.newsletterSubscribers}
              settings={online.settings}
              isActing={online.isActing}
            />
          )}
          {tab === "emergency-alert" && (
            <EmergencyAlertSettings
              settings={online.settings}
              isActing={online.isActing}
            />
          )}
          {tab === "reviews" && (
            <Reviews reviews={online.reviews} isActing={online.isActing} />
          )}
          {tab === "settings" && (
            <StorefrontSettings
              settings={online.settings}
              listings={online.listings}
              categories={online.categories}
              isActing={online.isActing}
            />
          )}
        </>
      )}
    </div>
  );
}

function NoStoreAttachedState({ tab }) {
  const tabLabel = TABS.find((item) => item.id === tab)?.label || "this section";

  return (
    <section className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-base-200 text-2xl text-base-content/50">
        <FiGlobe />
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold">
        No store attached yet
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-base-content/60">
        {tabLabel} will appear here once a real online store is connected. This
        demo login is isolated, so it does not load or save live store data.
      </p>
    </section>
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

function Products({
  listings,
  categories,
  counts,
  isActing,
  editListingId,
  onEditHandled,
}) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!editListingId) return;
    const listing = listings.find((item) => item._id === editListingId);
    if (listing) setEditing(listing);
    onEditHandled?.();
  }, [editListingId, listings, onEditHandled]);
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (
        categoryFilter &&
        (listing.category?._id || listing.category) !== categoryFilter &&
        !(listing.categories || []).some(
          (category) => (category?._id || category) === categoryFilter,
        )
      ) {
        return false;
      }
      if (!search) return true;
      return `${listing.webName || listing.product?.name || ""} ${
        listing.brand || ""
      }`
        .toLowerCase()
        .includes(search);
    });
  }, [listings, query, categoryFilter]);

  // Set one figure across every flavour this listing sells. The prompt says
  // "per variant" because it is: eight flavours at 15 is 120 units on the shelf,
  // not 15, and that misreading is the whole reason this wording is fixed here.
  const setStock = async (listing) => {
    const name = listing.webName || listing.product?.name || "this product";
    const answer = window.prompt(
      `Stock PER VARIANT for ${name}.

Every web flavour is set to this number. Flavours the shop counts for real are left alone.`,
      "",
    );
    if (answer === null) return;
    const quantity = Number(String(answer).trim());
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error("Enter a whole number, 0 or more");
      return;
    }

    const result = await dispatch(
      setOnlineListingStock({ id: listing._id, quantity: Math.floor(quantity) }),
    );
    if (result.error) {
      toast.error(result.payload || "Could not set stock");
      return;
    }
    const { applied, skipped = [] } = result.payload;
    toast.success(
      `${applied} variant(s) set to ${Math.floor(quantity)} each` +
        (skipped.length ? ` · left alone: ${skipped.join(", ")}` : ""),
    );
  };

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
          <select
            className="select select-sm select-bordered"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {(categories || []).map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
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
                      title="Set stock for every web flavour"
                      onClick={() => setStock(listing)}
                    >
                      <FiLayers />
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
  const allListings = useSelector((state) => state.onlineStore.listings || []);
  const [useInventoryPrice, setUseInventoryPrice] = useState(
    listing.priceOverride == null,
  );
  const [applyToOptions, setApplyToOptions] = useState(false);
  const [draft, setDraft] = useState({
    webName: listing.webName || listing.product?.name || "",
    brand: listing.brand || "",
    optionLabel: listing.optionLabel || "",
    variantLabel: listing.variantLabel || "",
    selfVariantLabel: listing.selfVariantLabel || "",
    category: listing.category?._id || "",
    categories: (listing.categories || []).map((c) => c._id || c),
    priceOverride: listing.priceOverride ?? listing.product?.Price ?? "",
    salePrice: listing.salePrice ?? "",
    saleStartsAt: toLocalDateTime(listing.saleStartsAt),
    saleEndsAt: toLocalDateTime(listing.saleEndsAt),
    shortDescription: listing.shortDescription || "",
    description: listing.description || "",
    featured: Boolean(listing.featured),
    listed: Boolean(listing.listed),
    tags: (listing.tags || []).filter((tag) => tag !== "sale"),
    gallery: (listing.gallery || []).map((image) => ({
      url: image.url,
      publicId: image.publicId || "",
      alt: image.alt || "",
    })),
    catalogImage: {
      url: listing.catalogImage?.url || "",
      publicId: listing.catalogImage?.publicId || "",
      alt:
        listing.catalogImage?.alt ||
        listing.webName ||
        listing.product?.name ||
        "",
    },
    variants: (listing.variants || [])
      .filter((variant) => variant.product)
      .map((variant) => ({
        product: variant.product?._id || variant.product,
        productName: variant.product?.name || "",
        productStock: Number(variant.product?.quantity ?? 0),
        label: variant.label || "",
        kind: variant.kind || "option",
        image: variant.image || "",
        priceOverride: variant.priceOverride ?? "",
      })),
    linkedListings: (listing.linkedListings || [])
      .filter((link) => link.listing)
      .map((link) => ({
        listing: link.listing?._id || link.listing,
        listingName:
          link.listing?.webName || link.listing?.product?.name || "",
        label: link.label || link.listing?.webName || link.listing?.product?.name || "",
        image: link.image || "",
        sortWeight: link.sortWeight ?? 0,
      })),
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

  const isUploading = useSelector((state) => state.onlineStore.isUploading);
  const categoryState = useSelector((state) => state.category.getallCategory);
  const inventoryCategories = Array.isArray(categoryState?.categoriesWithCount)
    ? categoryState.categoriesWithCount
    : Array.isArray(categoryState)
      ? categoryState
      : [];

  // Inventory picker used when adding an option (flavour / colour). Each option
  // must link to a real inventory product so its stock stays shared — either an
  // existing product (optionally filtered by inventory category) or a brand-new
  // one created inline. `optionKind` doubles as the open flag ("" = closed).
  const [optionKind, setOptionKind] = useState("");
  const [optionSearch, setOptionSearch] = useState("");
  const [optionCategory, setOptionCategory] = useState("");
  const [optionResults, setOptionResults] = useState([]);
  const [creatingOption, setCreatingOption] = useState(false);
  const [newOption, setNewOption] = useState({
    name: "",
    category: "",
    price: "",
    quantity: "",
  });
  // Which option row (index) currently has its "pick from product photos" tray
  // open. null = none open.
  const [pickPhotoFor, setPickPhotoFor] = useState(null);
  const optionPickerOpen = Boolean(optionKind);

  useEffect(() => {
    if (!optionPickerOpen) return;
    const timer = setTimeout(async () => {
      const result = await dispatch(
        searchInventoryProducts({
          search: optionSearch,
          category: optionCategory,
        }),
      );
      if (!result.error) setOptionResults(result.payload.products || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [dispatch, optionSearch, optionCategory, optionPickerOpen]);

  const openOptionPicker = (kind) => {
    setOptionKind(kind);
    setCreatingOption(false);
    setOptionSearch("");
    setOptionResults([]);
    setNewOption({ name: "", category: "", price: "", quantity: "" });
  };
  const closeOptionPicker = () => setOptionKind("");

  const uploadGallery = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (draft.gallery.length + selected.length > 8)
      return toast.error("Maximum 8 photos");
    const result = await dispatch(uploadListingImages(selected));
    if (result.error) return toast.error(result.payload || "Upload failed");
    set(
      "gallery",
      [
        ...draft.gallery,
        ...result.payload.map((image) => ({
          url: image.url,
          publicId: image.publicId || "",
          alt: draft.webName,
        })),
      ].slice(0, 8),
    );
  };
  const uploadCatalogImage = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const result = await dispatch(uploadListingImages([selected[0]]));
    if (result.error) return toast.error(result.payload || "Upload failed");
    const image = result.payload[0];
    if (!image?.url) return toast.error("Upload finished but no image URL was returned");
    set("catalogImage", {
      url: image.url,
      publicId: image.publicId || "",
      alt: draft.webName || listing.product?.name || "",
    });
  };
  const removeCatalogImage = () =>
    set("catalogImage", {
      url: "",
      publicId: "",
      alt: draft.webName || listing.product?.name || "",
    });
  const removeGalleryImage = (index) =>
    set(
      "gallery",
      draft.gallery.filter((_, i) => i !== index),
    );

  const setVariantField = (index, key, value) =>
    set(
      "variants",
      draft.variants.map((variant, i) =>
        i === index ? { ...variant, [key]: value } : variant,
      ),
    );
  const removeVariant = (index) =>
    set(
      "variants",
      draft.variants.filter((_, i) => i !== index),
    );
  const addVariant = (product) => {
    if (draft.variants.some((variant) => variant.product === product._id)) {
      return toast.error("That product is already an option");
    }
    set("variants", [
      ...draft.variants,
      {
        product: product._id,
        productName: product.name,
        productStock: Number(product.quantity ?? 0),
        label: product.name,
        kind: optionKind || "option",
        image: "",
        priceOverride: "",
      },
    ]);
    closeOptionPicker();
  };
  const addLinkedListing = (listingId) => {
    if (!listingId) return;
    if (String(listingId) === String(listing._id)) {
      return toast.error("A product cannot link to itself");
    }
    if (draft.linkedListings.some((item) => item.listing === listingId)) {
      return toast.error("That product is already linked as a variant");
    }
    const match = allListings.find((item) => item._id === listingId);
    if (!match) return;
    const label = match.webName || match.product?.name || "Variant";
    set("linkedListings", [
      ...draft.linkedListings,
      {
        listing: match._id,
        listingName: label,
        label,
        image: "",
        sortWeight: draft.linkedListings.length,
      },
    ]);
  };
  const setLinkedListingField = (index, key, value) =>
    set(
      "linkedListings",
      draft.linkedListings.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );
  const removeLinkedListing = (index) =>
    set(
      "linkedListings",
      draft.linkedListings.filter((_, i) => i !== index),
    );
  const createOption = async () => {
    const name = newOption.name.trim();
    if (!name) return toast.error("Enter a product name");
    if (Number(newOption.price) <= 0) return toast.error("Enter a valid price");
    const result = await dispatch(
      createInventoryProduct({
        name,
        category: newOption.category || undefined,
        price: newOption.price,
        quantity: newOption.quantity === "" ? 0 : newOption.quantity,
      }),
    );
    if (result.error) {
      return toast.error(result.payload || "Could not create the product");
    }
    toast.success(`${result.payload.name} added to inventory`);
    addVariant(result.payload);
  };
  const uploadVariantImage = async (index, files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const result = await dispatch(uploadListingImages([selected[0]]));
    if (result.error) return toast.error(result.payload || "Upload failed");
    const image = result.payload[0];
    if (image?.url) setVariantField(index, "image", image.url);
  };

  // Many imported products have per-flavour photos in the gallery, listed in the
  // same order as the options, but with no flavour name in the filename to match
  // on. The first photo is the product's main/hero image; the rest are the
  // per-option shots. So we reserve the first photo and assign the REST to the
  // options in order — one click links them all, and the owner just checks the
  // thumbnails before saving. Only fills options that don't already have a photo.
  const autofillFromGallery = () => {
    if (draft.gallery.length < 2) {
      return toast.error("Add at least two product photos first");
    }
    const used = new Set(draft.variants.map((v) => v.image).filter(Boolean));
    const pool = draft.gallery
      .slice(1)
      .map((image) => image.url)
      .filter((url) => !used.has(url));
    if (!pool.length) {
      return toast.error("No unused product photos to assign");
    }
    let poolIndex = 0;
    set(
      "variants",
      draft.variants.map((variant) =>
        variant.image || poolIndex >= pool.length
          ? variant
          : { ...variant, image: pool[poolIndex++] },
      ),
    );
    toast.success("Photos filled in order — check the thumbnails, then Save");
  };

  const save = async (event) => {
    event.preventDefault();
    if (!draft.category) return toast.error("Choose an online category");
    if (!useInventoryPrice && Number(draft.priceOverride) <= 0) {
      return toast.error("Enter a valid online price");
    }
    if (draft.variants.some((variant) => !variant.label.trim())) {
      return toast.error("Every option needs a name (flavour, colour, volume, etc.)");
    }
    if (draft.linkedListings.some((item) => !item.label.trim())) {
      return toast.error("Every linked product variant needs a display name");
    }
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        ...draft,
        optionLabel: draft.optionLabel,
        variantLabel: draft.variantLabel,
        selfVariantLabel: draft.selfVariantLabel,
        priceOverride: useInventoryPrice ? null : draft.priceOverride,
        salePrice: draft.salePrice || null,
        saleStartsAt: draft.saleStartsAt || null,
        saleEndsAt: draft.saleEndsAt || null,
        gallery: draft.gallery.map((image) => ({
          url: image.url,
          publicId: image.publicId || "",
          alt: image.alt || draft.webName,
        })),
        catalogImage: draft.catalogImage?.url
          ? {
              url: draft.catalogImage.url,
              publicId: draft.catalogImage.publicId || "",
              alt: draft.catalogImage.alt || draft.webName,
            }
          : { url: "", publicId: "", alt: "" },
        variants: draft.variants.map((variant) => ({
          product: variant.product,
          label: variant.label.trim(),
          kind: variant.kind || "option",
          image: variant.image || "",
          priceOverride:
            variant.priceOverride === "" || variant.priceOverride == null
              ? null
              : Number(variant.priceOverride),
        })),
        linkedListings: draft.linkedListings.map((item, index) => ({
          listing: item.listing,
          label: item.label.trim(),
          image: item.image || "",
          sortWeight: Number(item.sortWeight || index),
        })),
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
        <Field label="Dropdown label">
          <input
            className="input input-sm input-bordered"
            placeholder="e.g. Flavour, Volume"
            value={draft.optionLabel}
            onChange={(event) => set("optionLabel", event.target.value)}
          />
        </Field>
        <Field label="Product variant label">
          <input
            className="input input-sm input-bordered"
            placeholder="e.g. Size, Volume, Puff count"
            value={draft.variantLabel}
            onChange={(event) => set("variantLabel", event.target.value)}
          />
        </Field>
        <Field label="This product option name">
          <input
            className="input input-sm input-bordered"
            placeholder="e.g. 2ml, 10mg, Standard"
            value={draft.selfVariantLabel}
            onChange={(event) => set("selfVariantLabel", event.target.value)}
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
            {(categories || []).map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Also show in (extra categories)" className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const isPrimary = draft.category === category._id;
              const checked = isPrimary || draft.categories.includes(category._id);
              return (
                <label
                  key={category._id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                    checked ? "border-primary bg-primary/10" : "border-base-300"
                  } ${isPrimary ? "opacity-70" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={checked}
                    disabled={isPrimary}
                    onChange={() =>
                      set(
                        "categories",
                        draft.categories.includes(category._id)
                          ? draft.categories.filter((id) => id !== category._id)
                          : [...draft.categories, category._id],
                      )
                    }
                  />
                  {category.name}
                  {isPrimary ? " · primary" : ""}
                </label>
              );
            })}
          </div>
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

      <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <FiImage /> Catalogue cover image
            </h4>
            <p className="max-w-2xl text-[11px] text-base-content/50">
              Optional combined photo shown only on product cards, category pages
              and search results. The product page still opens with the normal
              product photo, then switches to the selected variant photo.
            </p>
          </div>
          <label className="btn btn-xs w-full gap-1 sm:w-auto">
            <FiUpload /> Upload cover
            <input
              hidden
              type="file"
              accept="image/*"
              disabled={isUploading}
              onChange={(event) => {
                uploadCatalogImage(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {draft.catalogImage?.url ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
            <img
              className="h-20 w-20 rounded-lg border bg-base-200 object-cover"
              src={draft.catalogImage.url}
              alt=""
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                Catalogue cover is active
              </div>
              <div className="truncate text-[11px] text-base-content/45">
                {draft.catalogImage.url}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={removeCatalogImage}
            >
              <FiTrash2 /> Remove
            </button>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-base-content/40">
            No separate catalogue cover yet — product cards use the first product
            photo as fallback.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] lg:items-start">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <FiGrid /> Product family variants
            </h4>
            <p className="text-[11px] text-base-content/50">
              Link existing website products as parent-level choices, like 2ml /
              3ml. After the shopper chooses one, that linked product&apos;s own
              flavours/options appear underneath.
            </p>
          </div>
          <select
            className="select select-sm select-bordered w-full min-w-0"
            value=""
            onChange={(event) => addLinkedListing(event.target.value)}
          >
            <option value="">Add linked website product</option>
            {allListings
              .filter((item) => item._id !== listing._id)
              .map((item) => {
                const disabled = draft.linkedListings.some(
                  (linked) => linked.listing === item._id,
                );
                return (
                  <option key={item._id} value={item._id} disabled={disabled}>
                    {item.webName || item.product?.name || "Untitled product"}
                    {disabled ? " (linked)" : ""}
                  </option>
                );
              })}
          </select>
        </div>

        {draft.linkedListings.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {draft.linkedListings.map((item, index) => (
              <div
                key={item.listing}
                className="min-w-0 rounded-lg border border-primary/20 bg-base-100 p-2"
              >
                <div className="grid gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded border bg-base-200">
                    {item.image ? (
                      <img
                        className="h-full w-full object-cover"
                        src={item.image}
                        alt=""
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-base-content/30">
                        <FiImage />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <input
                      className="input input-sm input-bordered w-full"
                      placeholder="Display label e.g. 2ml"
                      value={item.label}
                      onChange={(event) =>
                        setLinkedListingField(index, "label", event.target.value)
                      }
                    />
                    <div className="truncate text-[11px] text-base-content/50">
                      Linked: {item.listingName || "Website product"}
                    </div>
                    <input
                      className="input input-sm input-bordered w-full"
                      placeholder="Optional cover override URL"
                      value={item.image}
                      onChange={(event) =>
                        setLinkedListingField(index, "image", event.target.value)
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        step="1"
                        className="input input-sm input-bordered w-24 min-w-0"
                        placeholder="0.0"
                        value={item.sortWeight}
                        onChange={(event) =>
                          setLinkedListingField(
                            index,
                            "sortWeight",
                            event.target.value,
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => removeLinkedListing(index)}
                      >
                        <FiTrash2 /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-base-content/40">
            No linked product variants yet. This product will use only its own
            options below.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-base-300 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <FiImage /> Product photos
            </h4>
            <p className="text-[11px] text-base-content/50">
              Shown in the website gallery — the first photo is the main image.
              Up to 8.
            </p>
          </div>
          <label className="btn btn-xs gap-1">
            <FiUpload /> Add photos
            <input
              hidden
              multiple
              type="file"
              accept="image/*"
              disabled={isUploading}
              onChange={(event) => {
                uploadGallery(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {draft.gallery.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.gallery.map((image, index) => (
              <div key={`${image.url}-${index}`} className="relative">
                <img
                  className="h-16 w-16 rounded border object-cover"
                  src={image.url}
                  alt=""
                />
                {index === 0 && (
                  <span className="badge badge-primary badge-xs absolute -left-1 -top-2">
                    Main
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-circle btn-error btn-xs absolute -right-2 -top-2"
                  onClick={() => removeGalleryImage(index)}
                >
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-base-content/40">
            No web photos yet — the till image is used as a fallback.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-base-300 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <FiTag /> Options - flavours, colours &amp; strengths
            </h4>
            <p className="text-[11px] text-base-content/50">
              Each option links to an inventory product, so its stock stays
              shared with the till. Add flavours, nicotine strengths, bottle
              sizes, or any linked product choice; give each a name and photo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.variants.length > 0 && draft.gallery.length > 0 && (
              <button
                type="button"
                className="btn btn-xs gap-1"
                title="Assign gallery photos to options in order"
                onClick={autofillFromGallery}
              >
                <FiImage /> Auto-fill from photos
              </button>
            )}
            <button
              type="button"
              className={`btn btn-xs gap-1 ${optionKind === "flavour" ? "btn-primary" : ""}`}
              onClick={() => openOptionPicker("flavour")}
            >
              <FiPlus /> Add flavour
            </button>
            <button
              type="button"
              className={`btn btn-xs gap-1 ${optionKind === "colour" ? "btn-primary" : ""}`}
              onClick={() => openOptionPicker("colour")}
            >
              <FiPlus /> Add colour
            </button>
            <button
              type="button"
              className={`btn btn-xs gap-1 ${optionKind === "option" ? "btn-primary" : ""}`}
              onClick={() => openOptionPicker("option")}
            >
              <FiPlus /> Add strength / option
            </button>
          </div>
        </div>

        {optionPickerOpen && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-base-200/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold capitalize">
                Add {optionKind}
                <span className="ml-1 font-normal text-base-content/50">
                  — link an inventory product, or create a new one
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`btn btn-xs ${creatingOption ? "" : "btn-primary"}`}
                  onClick={() => setCreatingOption(false)}
                >
                  Existing
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${creatingOption ? "btn-primary" : ""}`}
                  onClick={() => setCreatingOption(true)}
                >
                  Create new
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={closeOptionPicker}
                >
                  <FiX />
                </button>
              </div>
            </div>

            {creatingOption ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  className="input input-sm input-bordered sm:col-span-2"
                  placeholder={`New ${optionKind} product name (e.g. Strawberry)`}
                  value={newOption.name}
                  onChange={(event) =>
                    setNewOption((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <select
                  className="select select-sm select-bordered sm:col-span-2"
                  value={newOption.category}
                  onChange={(event) =>
                    setNewOption((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  <option value="">Inventory category (optional)</option>
                  {inventoryCategories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="input input-sm input-bordered"
                  placeholder="Price €"
                  value={newOption.price}
                  onChange={(event) =>
                    setNewOption((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input input-sm input-bordered"
                  placeholder="Opening stock"
                  value={newOption.quantity}
                  onChange={(event) =>
                    setNewOption((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1 sm:col-span-2"
                  disabled={isActing}
                  onClick={createOption}
                >
                  <FiPlus /> Create &amp; add as {optionKind}
                </button>
              </div>
            ) : (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    className="input input-sm input-bordered"
                    autoFocus
                    placeholder="Search inventory…"
                    value={optionSearch}
                    onChange={(event) => setOptionSearch(event.target.value)}
                  />
                  <select
                    className="select select-sm select-bordered"
                    value={optionCategory}
                    onChange={(event) => setOptionCategory(event.target.value)}
                  >
                    <option value="">All inventory categories</option>
                    {inventoryCategories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 max-h-56 overflow-auto">
                  <table className="table table-xs">
                    <tbody>
                      {optionResults.map((product) => {
                        const already = draft.variants.some(
                          (variant) => variant.product === product._id,
                        );
                        return (
                          <tr key={product._id}>
                            <td>
                              <div className="font-medium">{product.name}</div>
                              <div className="text-[11px] text-base-content/50">
                                {product.Category?.name || "—"} ·{" "}
                                {product.quantity} in stock · €
                                {money(product.Price)}
                              </div>
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                className="btn btn-primary btn-xs"
                                disabled={already}
                                onClick={() => addVariant(product)}
                              >
                                {already ? "Added" : "Add"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!optionResults.length && (
                        <tr>
                          <td className="py-4 text-center text-[11px] text-base-content/40">
                            {optionSearch || optionCategory
                              ? "No products match — try Create new."
                              : "Search your inventory, or switch to Create new."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {draft.variants.length ? (
          <div className="mt-3 space-y-2">
            {draft.variants.map((variant, index) => (
              <div
                key={variant.product}
                className="rounded-lg border border-base-300 bg-base-100 p-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    {variant.image ? (
                      <img
                        className="h-14 w-14 rounded border object-cover"
                        src={variant.image}
                        alt=""
                      />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded border border-dashed text-base-content/30">
                        <FiImage />
                      </div>
                    )}
                    <label
                      className="btn btn-circle btn-xs absolute -bottom-2 -right-2"
                      title="Upload option photo"
                    >
                      <FiUpload />
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        disabled={isUploading}
                        onChange={(event) => {
                          uploadVariantImage(index, event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {variant.image && (
                      <button
                        type="button"
                        className="btn btn-circle btn-error btn-xs absolute -right-2 -top-2"
                        onClick={() => setVariantField(index, "image", "")}
                      >
                        <FiX />
                      </button>
                    )}
                  </div>
                  <div className="min-w-[8rem] flex-1">
                    <input
                      className="input input-sm input-bordered w-full"
                      placeholder="Option name (e.g. Strawberry, Blue)"
                      value={variant.label}
                      onChange={(event) =>
                        setVariantField(index, "label", event.target.value)
                      }
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-base-content/50">
                      <span className="badge badge-xs capitalize">
                        {variant.kind || "option"}
                      </span>
                      <span>
                        {variant.productName} · {variant.productStock} in shared
                        stock
                      </span>
                      {draft.gallery.length > 0 && (
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={() =>
                            setPickPhotoFor(
                              pickPhotoFor === index ? null : index,
                            )
                          }
                        >
                          {pickPhotoFor === index
                            ? "Close photos"
                            : "Pick from product photos"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="input input-sm input-bordered w-full"
                      placeholder="Price €"
                      value={variant.priceOverride}
                      onChange={(event) =>
                        setVariantField(
                          index,
                          "priceOverride",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => removeVariant(index)}
                  >
                    <FiTrash2 />
                  </button>
                </div>

                {pickPhotoFor === index && draft.gallery.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-base-200 pt-2">
                    <span className="w-full text-[11px] text-base-content/50">
                      Tap a photo to use it for “{variant.label || "this option"}”
                      on the website.
                    </span>
                    {draft.gallery.map((image, galleryIndex) => (
                      <button
                        type="button"
                        key={`${image.url}-${galleryIndex}`}
                        title="Use this photo"
                        onClick={() => {
                          setVariantField(index, "image", image.url);
                          setPickPhotoFor(null);
                        }}
                        className={`overflow-hidden rounded border ${
                          image.url === variant.image
                            ? "ring-2 ring-primary"
                            : ""
                        }`}
                      >
                        <img
                          className="h-12 w-12 object-cover"
                          src={image.url}
                          alt=""
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-base-content/40">
            No options yet. Without options the product sells as a single item
            using its own stock.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        {[
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
  const [createdListing, setCreatedListing] = useState(null);

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
    setCreatedListing(result.payload);
    dispatch(getOnlineListings());
    dispatch(getCatalogue({ search, category: inventoryCategory, page }));
  };

  if (createdListing) {
    return (
      <ProductEditor
        key={createdListing._id}
        listing={createdListing}
        categories={categories}
        isActing={isActing}
        onClose={() => {
          setCreatedListing(null);
          onClose();
        }}
      />
    );
  }

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
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [active, setActive] = useState(true);
  const [parent, setParent] = useState("");
  const reset = () => {
    setEditingId("");
    setName("");
    setDescription("");
    setImage("");
    setActive(true);
    setParent("");
  };
  const edit = (category) => {
    setEditingId(category._id);
    setName(category.name || "");
    setDescription(category.description || "");
    setImage(category.image || "");
    setActive(category.active !== false);
    setParent(category.parent || "");
  };
  const save = async (event) => {
    event.preventDefault();
    if (editingId) {
      const result = await dispatch(
        updateOnlineCategory({
          id: editingId,
          name,
          description,
          image,
          active,
          parent: parent || null,
        }),
      );
      if (result.error)
        return toast.error(result.payload || "Could not update category");
      toast.success("Category updated");
      dispatch(getOnlineCategories());
      reset();
      return;
    }
    const result = await dispatch(
      createOnlineCategory({ name, description, image, parent: parent || null }),
    );
    if (result.error)
      return toast.error(result.payload || "Could not create category");
    toast.success("Category created");
    reset();
  };
  // Change (or clear) a category's parent. The backend rejects any move that
  // would form a cycle, so we just surface its message on failure.
  const reparent = async (category, parentId) => {
    const result = await dispatch(
      updateOnlineCategory({ id: category._id, parent: parentId || null }),
    );
    if (result.error)
      return toast.error(result.payload || "Could not move category");
    toast.success("Category moved");
    // Refresh so product counts (only computed by the list endpoint) stay right.
    dispatch(getOnlineCategories());
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
        onSubmit={save}
        className="h-fit space-y-3 rounded-xl border bg-base-100 p-4"
      >
        <h3 className="font-bold">
          {editingId ? "Edit category" : "New online category"}
        </h3>
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
        <input
          className="input input-sm input-bordered w-full"
          placeholder="Image URL (optional)"
          value={image}
          onChange={(event) => setImage(event.target.value)}
        />
        {image && (
          <img
            src={image}
            alt="Category preview"
            className="h-20 w-full rounded-lg border object-cover"
          />
        )}
        <select
          className="select select-sm select-bordered w-full"
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">Top-level category</option>
          {categories
            .filter((category) => category._id !== editingId)
            .map((category) => (
              <option key={category._id} value={category._id}>
                Under: {category.name}
              </option>
            ))}
        </select>
        {editingId && (
          <Check
            checked={active}
            onChange={setActive}
            label="Visible on storefront"
          />
        )}
        <button className="btn btn-primary btn-sm w-full gap-2">
          {editingId ? (
            <>
              <FiSave /> Save changes
            </>
          ) : (
            <>
              <FiPlus /> Add category
            </>
          )}
        </button>
        {editingId ? (
          <button
            type="button"
            className="btn btn-sm w-full"
            onClick={reset}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm w-full gap-2"
            onClick={importAll}
          >
            <FiDownloadCloud /> Import inventory categories
          </button>
        )}
      </form>
      <div className="overflow-x-auto rounded-xl border bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Category</th>
              <th>Parent</th>
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
                <td>
                  <select
                    className="select select-xs select-bordered"
                    value={category.parent || ""}
                    onChange={(event) => reparent(category, event.target.value)}
                  >
                    <option value="">Top level</option>
                    {categories
                      .filter((option) => option._id !== category._id)
                      .map((option) => (
                        <option key={option._id} value={option._id}>
                          {option.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>{category.listingCount || 0}</td>
                <td>
                  <span className="badge badge-sm">
                    {category.active ? "Visible" : "Hidden"}
                  </span>
                </td>
                <td className="whitespace-nowrap text-right">
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => edit(category)}
                  >
                    <FiEdit2 />
                  </button>
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
  mobileImage: "",
  imageAlt: "",
  ctaPosition: "bottom-left",
  linkType: "none",
  listing: "",
  listings: [],
  category: "",
  burst: { top: "", big: "", bottom: "" },
  ctaPrimary: { label: "Shop now", to: "/shop" },
  ctaSecondary: { label: "View all products", to: "/shop" },
  active: true,
  sortWeight: 0,
};

function HeroSlides({ slides, listings, categories }) {
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
      listings: (slide.listings || []).map((item) => item._id || item),
      category: slide.category?._id || slide.category || "",
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
    if (!draft.image.trim()) return toast.error("Hero banner image is required");
    if (draft.linkType === "product" && !draft.listing)
      return toast.error("Choose one product for the button");
    if (draft.linkType === "products" && !draft.listings.length)
      return toast.error("Choose at least one product for the button");
    if (draft.linkType === "category" && !draft.category)
      return toast.error("Choose one category for the button");
    const payload = {
      ...draft,
      listing: draft.linkType === "product" ? draft.listing : "",
      listings: draft.linkType === "products" ? draft.listings : [],
      category: draft.linkType === "category" ? draft.category : "",
      ctaPrimary: {
        label: draft.ctaPrimary.label || "Shop now",
        to: "",
        params: {},
      },
      ctaSecondary: {
        label: "",
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
  const uploadHeroImage = async (field, files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const result = await dispatch(uploadListingImages([selected[0]]));
    if (result.error) return toast.error(result.payload || "Upload failed");
    const image = result.payload?.[0];
    if (!image?.url) return toast.error("Upload finished but no image URL was returned");
    set(field, image.url);
    toast.success(field === "mobileImage" ? "Mobile banner uploaded" : "Desktop banner uploaded");
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
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
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
        <p className="rounded-lg bg-base-200 p-3 text-xs leading-relaxed text-base-content/60">
          Storefront hero now shows only the banner image and an optional button.
          Use a 14:5 image for desktop and a 16:8 image for mobile. The button
          appears only when you choose a link target below.
        </p>
        <div className="space-y-2">
          <div className="rounded-lg border border-base-300 p-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
              Desktop banner — 14:5
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="url"
                className="input input-sm input-bordered w-full"
                placeholder="Desktop hero image URL *"
                value={draft.image}
                onChange={(event) => set("image", event.target.value)}
              />
              <label className="btn btn-outline btn-sm">
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => uploadHeroImage("image", event.target.files)}
                />
              </label>
            </div>
          </div>
          <div className="rounded-lg border border-base-300 p-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
              Mobile banner — 16:8 optional
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="url"
                className="input input-sm input-bordered w-full"
                placeholder="Mobile hero image URL"
                value={draft.mobileImage || ""}
                onChange={(event) => set("mobileImage", event.target.value)}
              />
              <label className="btn btn-outline btn-sm">
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) =>
                    uploadHeroImage("mobileImage", event.target.files)
                  }
                />
              </label>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-base-content/50">
            Mobile image is optional. If blank, the desktop banner will be used
            on mobile too.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input input-sm input-bordered"
            placeholder="Button label"
            value={draft.ctaPrimary.label}
            onChange={(event) =>
              setNested("ctaPrimary", "label", event.target.value)
            }
          />
          <select
            className="select select-sm select-bordered"
            value={draft.linkType}
            onChange={(event) => set("linkType", event.target.value)}
          >
            <option value="none">No button</option>
            <option value="product">Single product</option>
            <option value="products">Multiple products</option>
            <option value="category">Category</option>
          </select>
        </div>
        <select
          className="select select-sm select-bordered w-full"
          value={draft.ctaPosition || "bottom-left"}
          onChange={(event) => set("ctaPosition", event.target.value)}
        >
          <option value="bottom-left">Button bottom left</option>
          <option value="bottom-center">Button bottom center</option>
          <option value="bottom-right">Button bottom right</option>
        </select>
        {draft.linkType === "product" && (
          <select
            className="select select-sm select-bordered w-full"
            value={draft.listing}
            onChange={(event) => set("listing", event.target.value)}
          >
            <option value="">Choose product *</option>
            {listings
              .filter((listing) => listing.listed)
              .map((listing) => (
                <option key={listing._id} value={listing._id}>
                  {listing.webName || listing.product?.name}
                </option>
              ))}
          </select>
        )}
        {draft.linkType === "products" && (
          <select
            className="select select-sm select-bordered h-32 w-full"
            multiple
            value={draft.listings}
            onChange={(event) =>
              set(
                "listings",
                Array.from(event.target.selectedOptions).map((option) => option.value),
              )
            }
          >
            {listings
              .filter((listing) => listing.listed)
              .map((listing) => (
                <option key={listing._id} value={listing._id}>
                  {listing.webName || listing.product?.name}
                </option>
              ))}
          </select>
        )}
        {draft.linkType === "category" && (
          <select
            className="select select-sm select-bordered w-full"
            value={draft.category}
            onChange={(event) => set("category", event.target.value)}
          >
            <option value="">Choose category *</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
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
            placeholder="0.0"
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
            className="grid min-w-0 gap-4 rounded-xl border bg-base-100 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          >
            <div className="min-w-0">
              <div className="text-xs uppercase text-base-content/50">
                {slide.linkType === "none" ? "Banner only" : `Button: ${slide.linkType}`}
              </div>
              <div className="truncate font-display text-lg font-bold">
                {slide.ctaPrimary?.label || "Hero banner"}
              </div>
              <p className="line-clamp-2 text-xs text-base-content/60">
                {slide.image || "No image URL"}
              </p>
              {slide.mobileImage && (
                <p className="line-clamp-1 text-xs text-base-content/50">
                  Mobile: {slide.mobileImage}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <span className="badge badge-sm">{slide.tone}</span>
                <span className="badge badge-info badge-sm">
                  {slide.linkType || "none"}
                </span>
                <span className="badge badge-ghost badge-sm">
                  order {slide.sortWeight || 0}
                </span>
                <span className="badge badge-ghost badge-sm">
                  {slide.ctaPosition || "bottom-left"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1 sm:whitespace-nowrap">
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

const DEFAULT_BEST_SELLERS = {
  enabled: true,
  limit: 8,
};

function BestSellerControls({
  listings,
  categories,
  settings,
  isActing,
  onEditListing,
}) {
  const dispatch = useDispatch();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [draft, setDraft] = useState(DEFAULT_BEST_SELLERS);

  useEffect(() => {
    setDraft({
      ...DEFAULT_BEST_SELLERS,
      ...(settings?.bestSellers || {}),
    });
  }, [settings]);

  const selectedCount = listings.filter((listing) =>
    listing.tags?.includes("bestseller"),
  ).length;
  const hotCount = listings.filter((listing) =>
    listing.tags?.includes("hot"),
  ).length;
  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (!listing.listed) return false;
      if (
        categoryFilter &&
        (listing.category?._id || listing.category) !== categoryFilter &&
        !(listing.categories || []).some(
          (category) => (category?._id || category) === categoryFilter,
        )
      ) {
        return false;
      }
      if (!search) return true;
      return `${listing.webName || listing.product?.name || ""} ${
        listing.brand || ""
      }`
        .toLowerCase()
        .includes(search);
    });
  }, [listings, query, categoryFilter]);

  const saveSection = async (event) => {
    event.preventDefault();
    const result = await dispatch(
      saveOnlineSettings({
        bestSellers: { ...draft, limit: Number(draft.limit) },
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not save the best sellers section")
      : toast.success("Best sellers section saved");
  };

  const toggleProduct = async (listing) => {
    const tags = listing.tags || [];
    const selected = tags.includes("bestseller");
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        tags: selected
          ? tags.filter((tag) => tag !== "bestseller")
          : Array.from(new Set([...tags, "bestseller"])),
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not update this product")
      : toast.success(
          selected
            ? "Removed from Best sellers — storefront updated"
            : "Added to Best sellers — storefront updated",
        );
  };

  const toggleHot = async (listing) => {
    const tags = listing.tags || [];
    const selected = tags.includes("hot");
    const result = await dispatch(
      updateOnlineListing({
        id: listing._id,
        tags: selected
          ? tags.filter((tag) => tag !== "hot")
          : Array.from(new Set([...tags, "hot"])),
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not update this product")
      : toast.success(selected ? "Hot item tag removed" : "Hot item tag added");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
      <form
        onSubmit={saveSection}
        className="h-fit space-y-4 rounded-xl border bg-base-100 p-5"
      >
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <FiStar /> Best sellers section
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-base-content/55">
            Pick products for the storefront Best seller rail. Existing bestsellers stay selected;
            the owner can remove them whenever they want.
          </p>
        </div>
        <Check
          checked={draft.enabled}
          onChange={(value) => setDraft((current) => ({ ...current, enabled: value }))}
          label="Show Best sellers on the storefront"
        />
        <Field label="Maximum products">
          <select
            className="select select-sm select-bordered"
            value={draft.limit}
            onChange={(event) =>
              setDraft((current) => ({ ...current, limit: Number(event.target.value) }))
            }
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
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-base-200 p-3 text-center">
          <div>
            <div className="font-display text-2xl font-bold">{selectedCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-base-content/50">
              Best sellers
            </div>
          </div>
          <div>
            <div className="font-display text-2xl font-bold text-error">{hotCount}</div>
            <div className="text-[10px] uppercase tracking-widest text-base-content/50">
              Hot tags
            </div>
          </div>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-display font-bold">Choose products</h3>
            <p className="text-xs text-base-content/50">
              {selectedCount
                ? `${selectedCount} manually selected · the first ${draft.limit} are shown`
                : "No products selected · this section stays hidden until you add one"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select select-sm select-bordered"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {(categories || []).map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              className="input input-sm input-bordered"
              placeholder="Search live products..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="max-h-[620px] divide-y overflow-y-auto">
          {shown.map((listing) => {
            const selected = listing.tags?.includes("bestseller");
            const hot = listing.tags?.includes("hot");
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
                        Best seller
                      </span>
                    )}
                    {hot && (
                      <span className="badge badge-error badge-xs text-white">
                        Hot item
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-error checkbox-xs"
                      checked={hot}
                      disabled={isActing}
                      onChange={() => toggleHot(listing)}
                    />
                    Hot item
                  </label>
                  {selected && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-2"
                      disabled={isActing}
                      onClick={() => onEditListing(listing)}
                    >
                      <FiEdit2 /> Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn-sm gap-2 ${
                      selected ? "btn-error btn-outline" : "btn-primary"
                    }`}
                    disabled={isActing}
                    onClick={() => toggleProduct(listing)}
                  >
                    {selected ? (
                      <>
                        <FiTrash2 /> Remove
                      </>
                    ) : (
                      <>
                        <FiPlus /> Add
                      </>
                    )}
                  </button>
                </div>
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
  title: "Don’t miss out.",
  subtitle:
    "Limited-time online prices selected by the Cliffs of Puff team. Stock updates from the same inventory used at the till.",
  ctaLabel: "See the deals",
  limit: 4,
};

const BLANK_DEAL = {
  id: "",
  salePrice: "",
  saleStartsAt: "",
  saleEndsAt: "",
  // "" or 1 = the deal applies to every unit; >=2 = "buy N+ for the deal price".
  minQty: "",
  // { url, publicId } | null — optional promo image the shop uploads.
  dealImage: null,
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
  const isUploading = useSelector((state) => state.onlineStore.isUploading);
  const [section, setSection] = useState(DEFAULT_DEALS);
  const [deal, setDeal] = useState(BLANK_DEAL);
  // Bulk deal: one % off applied to several products at once.
  const [bulkPct, setBulkPct] = useState(20);
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkIds, setBulkIds] = useState([]);
  const [bulkSearch, setBulkSearch] = useState("");

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
      minQty: listing.dealMinQty ?? "",
      dealImage: listing.dealImage?.url ? listing.dealImage : null,
    });
  };

  // Upload a promo image for the current deal (same endpoint as gallery photos).
  const uploadDealImage = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const result = await dispatch(uploadListingImages([selected[0]]));
    if (result.error) return toast.error(result.payload || "Upload failed");
    const image = (result.payload || [])[0];
    if (image?.url) setDealField("dealImage", image);
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
    let minQty = null;
    if (deal.minQty !== "" && deal.minQty != null) {
      minQty = Math.floor(Number(deal.minQty));
      if (!Number.isFinite(minQty) || minQty < 1) {
        return toast.error("Minimum quantity must be a whole number of 1 or more");
      }
      if (minQty <= 1) minQty = null; // 1 = an ordinary sale on every unit
    }
    const result = await dispatch(
      updateOnlineListing({
        id: selectedListing._id,
        salePrice,
        saleStartsAt: deal.saleStartsAt || null,
        saleEndsAt: deal.saleEndsAt || null,
        dealMinQty: minQty,
        dealImage: deal.dealImage?.url
          ? { url: deal.dealImage.url, publicId: deal.dealImage.publicId || "" }
          : null,
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
        dealMinQty: null,
        dealImage: null,
      }),
    );
    if (result.error) {
      return toast.error(result.payload || "Could not clear the deal");
    }
    if (deal.id === listing._id) setDeal(BLANK_DEAL);
    toast.success("Online deal removed");
  };

  const toggleBulk = (id) =>
    setBulkIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );

  // Apply one percentage discount to every selected product — each product's
  // deal price is worked out from its OWN regular price, so a mixed basket of
  // prices all get the same % off rather than the same absolute price.
  const applyBulk = async (event) => {
    event.preventDefault();
    const pct = Number(bulkPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      return toast.error("Enter a discount between 1% and 99%");
    }
    if (!bulkIds.length) return toast.error("Select at least one product");
    if (bulkStart && bulkEnd && new Date(bulkEnd) <= new Date(bulkStart)) {
      return toast.error("Deal end must be after its start");
    }
    const targets = listings.filter((listing) => bulkIds.includes(listing._id));
    const results = await Promise.all(
      targets.map((listing) => {
        const regular = Number(
          listing.priceOverride ?? listing.product?.Price ?? 0,
        );
        const salePrice = money(regular * (1 - pct / 100));
        return dispatch(
          updateOnlineListing({
            id: listing._id,
            salePrice: salePrice > 0 ? salePrice : null,
            saleStartsAt: bulkStart || null,
            saleEndsAt: bulkEnd || null,
          }),
        );
      }),
    );
    const failed = results.filter((result) => result.error).length;
    failed
      ? toast.error(`${failed} of ${targets.length} deals could not be saved`)
      : toast.success(`Deal applied to ${targets.length} products`);
    setBulkIds([]);
  };

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,410px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <form
          onSubmit={saveSection}
          className="min-w-0 space-y-4 rounded-xl border bg-base-100 p-4 sm:p-5"
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
                className="input input-sm input-bordered w-full"
                maxLength={80}
                value={section.eyebrow}
                onChange={(event) =>
                  setSectionField("eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Button label">
              <input
                className="input input-sm input-bordered w-full"
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
              className="input input-sm input-bordered w-full"
              maxLength={120}
              value={section.title}
              onChange={(event) => setSectionField("title", event.target.value)}
            />
          </Field>
          <Field label="Supporting text">
            <textarea
              className="textarea textarea-sm textarea-bordered w-full"
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
              className="select select-sm select-bordered w-full"
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
          className="min-w-0 space-y-4 rounded-xl border bg-base-100 p-4 sm:p-5"
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
              className="select select-sm select-bordered w-full"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Regular online price">
              <input
                className="input input-sm input-bordered w-full"
                value={regularPrice ? `€${money(regularPrice)}` : "—"}
                disabled
              />
            </Field>
            <Field label="Deal price (€)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input input-sm input-bordered w-full"
                value={deal.salePrice}
                onChange={(event) =>
                  setDealField("salePrice", event.target.value)
                }
                required
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered w-full"
                value={deal.saleStartsAt}
                onChange={(event) =>
                  setDealField("saleStartsAt", event.target.value)
                }
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered w-full"
                value={deal.saleEndsAt}
                onChange={(event) =>
                  setDealField("saleEndsAt", event.target.value)
                }
              />
            </Field>
          </div>
          <Field label="Minimum quantity for this price">
            <input
              type="number"
              min="1"
              step="1"
              placeholder="0.0"
              className="input input-sm input-bordered w-full"
              value={deal.minQty}
              onChange={(event) => setDealField("minQty", event.target.value)}
            />
            <span className="mt-1 text-[11px] text-base-content/50">
              Set 3 for a “buy 3 or more, deal price each” offer — any mix of
              flavours counts toward the total. Leave blank (or 1) to give the
              deal price on every unit.
            </span>
          </Field>
          <Field label="Deal image (optional)">
            {deal.dealImage?.url ? (
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src={deal.dealImage.url}
                  alt="Deal"
                  className="h-16 w-16 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setDealField("dealImage", null)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="btn btn-outline btn-sm w-fit gap-2">
                <FiUpload /> Upload deal image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={isUploading}
                  onChange={(event) => uploadDealImage(event.target.files)}
                />
              </label>
            )}
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
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

        <form
          onSubmit={applyBulk}
          className="min-w-0 space-y-4 rounded-xl border bg-base-100 p-4 sm:p-5"
        >
          <div>
            <h3 className="font-display text-lg font-bold">
              Deal on multiple products
            </h3>
            <p className="mt-1 text-xs text-base-content/55">
              Pick several products and set one % off. Each product's deal price
              is worked out from its own regular price. Online only — POS/stock
              unchanged.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount (% off)">
              <input
                type="number"
                min="1"
                max="99"
                className="input input-sm input-bordered w-full"
                value={bulkPct}
                onChange={(event) => setBulkPct(event.target.value)}
                required
              />
            </Field>
            <Field label="Selected">
              <input
                className="input input-sm input-bordered w-full"
                value={`${bulkIds.length} product${bulkIds.length === 1 ? "" : "s"}`}
                disabled
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered w-full"
                value={bulkStart}
                onChange={(event) => setBulkStart(event.target.value)}
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                type="datetime-local"
                className="input input-sm input-bordered w-full"
                value={bulkEnd}
                onChange={(event) => setBulkEnd(event.target.value)}
              />
            </Field>
          </div>
          <input
            className="input input-sm input-bordered w-full"
            placeholder="Search products…"
            value={bulkSearch}
            onChange={(event) => setBulkSearch(event.target.value)}
          />
          <div className="max-h-56 min-w-0 divide-y overflow-y-auto rounded-lg border">
            {dealListings
              .filter((listing) =>
                String(listing.webName || listing.product?.name || "")
                  .toLowerCase()
                  .includes(bulkSearch.toLowerCase()),
              )
              .map((listing) => {
                const regular = Number(
                  listing.priceOverride ?? listing.product?.Price ?? 0,
                );
                const preview = money(
                  regular * (1 - Number(bulkPct || 0) / 100),
                );
                return (
                  <label
                    key={listing._id}
                    className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-base-200 sm:items-center"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={bulkIds.includes(listing._id)}
                      onChange={() => toggleBulk(listing._id)}
                    />
                    <span className="min-w-0 flex-1 break-words sm:truncate">
                      {listing.webName || listing.product?.name}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-base-content/50">
                      €{money(regular)} →{" "}
                      <strong className="text-error">€{preview}</strong>
                    </span>
                  </label>
                );
              })}
          </div>
          <button
            className="btn btn-primary btn-sm w-full gap-2"
            disabled={isActing || !bulkIds.length}
          >
            <FiSave /> Apply to {bulkIds.length} product
            {bulkIds.length === 1 ? "" : "s"}
          </button>
        </form>
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border bg-base-100">
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
                className="grid min-w-0 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {listing.dealImage?.url && (
                    <img
                      src={listing.dealImage.url}
                      alt="Deal"
                      className="h-12 w-12 shrink-0 rounded-lg border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                  <div className="break-words font-medium sm:truncate">
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
                    {listing.dealMinQty > 1 && (
                      <span className="badge badge-warning badge-sm">
                        Buy {listing.dealMinQty}+
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
                    <div className="mt-1 break-words text-[11px] text-base-content/45">
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
                </div>
                <div className="flex flex-wrap gap-1 sm:justify-end">
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
            placeholder="0.0"
            value={draft.usageLimit}
            onChange={(event) => set("usageLimit", event.target.value)}
          />
          <input
            type="number"
            min="1"
            className="input input-sm input-bordered"
            placeholder="0.0"
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

// Shown greyed-out in the order-terms box when a shop has cleared it, so the
// wording this shipped with stays recoverable from the form itself.
const CHECKOUT_TERMS_PLACEHOLDER = [
  "18+ only. Valid ID may be required.",
  "7-day returns with receipt; unused & unopened items only.",
  "Statutory consumer rights remain unaffected.",
].join("\n");

const BLANK_SETTINGS = {
  logo: "",
  social: { instagram: "", facebook: "", twitter: "", tiktok: "" },
  footer: {
    newsletterHeading: "Subscribe to our newsletters",
    description: "",
    supportEmail: "",
    supportPhone: "",
    address: "",
    openingHours: "Mon-Sat 9am - 4pm",
    paymentImage: "/payment-logo2.webp",
    restrictionImage: "/not.webp",
    whyECigarettesTitle: "Why e-cigarettes?",
    whyECigarettesContent:
      "E-cigarettes give adult smokers an alternative to combustible cigarettes. Cliffs of Puff stocks age-restricted, authentic products only.",
  },
  footerLinks: {
    contact: { enabled: true, label: "Contact us", href: "/contact" },
    terms: { enabled: true, label: "Terms and Conditions", href: "/terms" },
    privacy: { enabled: true, label: "Privacy Policy", href: "/privacy" },
    refunds: { enabled: true, label: "Return & Refund", href: "/refunds" },
    about: { enabled: true, label: "About Us", href: "/about" },
    bestSellers: { enabled: true, label: "Best Sellers", href: "/#best-sellers" },
    whyECigarettes: { enabled: true, label: "Why e-cigarettes?", href: "/why-e-cigarettes" },
    deals: { enabled: true, label: "Deals", href: "/sale" },
    blog: { enabled: true, label: "Blog", href: "/blog" },
  },
  announcement: { enabled: true, primary: "", secondary: "" },
  events: { enabled: false, heading: "", align: "center", items: [] },
  blog: { ...BLOG_PAGE_DEFAULTS },
  emergencyAlert: {
    active: false,
    title: "Website under maintenance",
    message: "We are making a few improvements. Please check back shortly.",
    buttonLabel: "Come back soon",
    tone: "maintenance",
  },
  shipping: { flatRate: 4.99, freeThreshold: 100 },
  checkout: { deliveryNote: "", orderTerms: "" },
  promises: {
    dispatch: "Fast dispatch",
    returnsDays: 14,
    authentic: true,
    authenticLabel: "100% authentic",
  },
  business: {
    legalName: "",
    tradingName: "",
    companyNumber: "",
    vatNumber: "",
  },
  policies: {
    terms: "",
    privacy: "",
    shippingReturns: "",
    refunds: "",
    cookies: "",
    about: "",
  },
};

const blankEventItem = () => ({
  kind: "product",
  targetId: "",
  enabled: false,
  eventPrice: "",
  tag: "",
});

const normalizeEventItems = (items = []) =>
  Array.from({ length: 3 }, (_, index) => {
    const item = items[index] || {};
    return {
      kind: item.kind === "category" ? "category" : "product",
      targetId: item.targetId || "",
      enabled: Boolean(item.enabled),
      tag: item.tag || "",
      eventPrice:
        item.eventPrice === null || item.eventPrice === undefined
          ? ""
          : String(item.eventPrice),
    };
  });

/* One legal page.
 *
 * Collapsed by default — six open editors at once is a wall nobody can work
 * in, and a shop normally edits one policy at a time. Collapsing also means
 * TipTap only mounts for the page actually being edited.
 *
 * Text written before this editor existed is plain, with "## " for headings.
 * It is shown as-is in a plain textarea until somebody chooses to convert it,
 * because silently reinterpreting a shop's legal wording as HTML — and
 * rewriting it on the next save — is not a decision to make on their behalf. */
function PolicyEditor({ label, path, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const isHtml = /<[a-z][\s\S]*>/i.test(String(value || ""));
  const [converting, setConverting] = useState(false);

  const convert = () => {
    // Same convention the storefront has always rendered: a blank line starts
    // a paragraph, "## " starts a heading.
    const html = String(value || "")
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) =>
        block.startsWith("## ")
          ? `<h2>${block.slice(3).trim()}</h2>`
          : `<p>${block.replace(/\n/g, "<br />")}</p>`,
      )
      .join("");
    onChange(html);
    setConverting(true);
  };

  return (
    <div className="rounded-xl border border-base-300">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="font-display font-bold">{label}</span>
          <span className="ml-2 font-mono text-[11px] text-base-content/45">{path}</span>
        </span>
        <span className="flex items-center gap-2">
          {!isHtml && !converting && (
            <span className="badge badge-ghost badge-sm">Plain text</span>
          )}
          <span className="text-xs text-base-content/50">{open ? "Close" : "Edit"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-base-300 p-3">
          {isHtml || converting ? (
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center rounded-lg border border-base-300 bg-base-200/40">
                  <span className="loading loading-spinner loading-md text-primary" />
                </div>
              }
            >
              <RichTextEditor
                value={value}
                syncKey={`${path}-${converting}`}
                minHeight={320}
                disabled={disabled}
                placeholder={`Write the ${label.toLowerCase()}…`}
                onChange={onChange}
              />
            </Suspense>
          ) : (
            <>
              <textarea
                className="textarea textarea-bordered w-full font-mono text-xs leading-relaxed"
                rows={10}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-sm btn-primary" onClick={convert}>
                  Convert to the rich editor
                </button>
                <span className="text-[11px] text-base-content/50">
                  Keeps your wording — paragraphs stay paragraphs and “## ” lines become
                  headings — and lets you add links. Save afterwards to keep it.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const POLICY_FIELDS = [
  ["terms", "Terms & Conditions", "/terms"],
  ["privacy", "Privacy Policy", "/privacy"],
  ["shippingReturns", "Shipping & Returns", "/shipping-returns"],
  ["refunds", "Refund Policy", "/refunds"],
  ["cookies", "Cookie Policy", "/cookies"],
  ["about", "About Us", "/about"],
];

const FOOTER_LINK_FIELDS = [
  ["contact", "Contact"],
  ["terms", "Terms and Conditions"],
  ["privacy", "Privacy Policy"],
  ["refunds", "Return & Refund"],
  ["about", "About Us"],
  ["bestSellers", "Best Sellers"],
  ["whyECigarettes", "Why e-cigarettes?"],
  ["deals", "Deals"],
  ["blog", "Blog"],
];

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

function StorefrontSettings({ settings, listings = [], categories = [], isActing }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(BLANK_SETTINGS);
  const productOptions = useMemo(
    () =>
      (Array.isArray(listings) ? listings : [])
        .filter((listing) => listing?._id)
        .map((listing) => ({
          value: listing._id,
          label:
            listing.webName ||
            listing.product?.name ||
            listing.slug ||
            "Product",
          hidden: listing.listed === false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [listings],
  );
  const categoryOptions = useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .filter((category) => category?.slug)
        .map((category) => ({
          value: category.slug,
          label: category.name || category.slug,
          hidden: category.active === false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );
  useEffect(() => {
    if (settings) {
      setDraft({
        logo: settings.logo || "",
        social: { ...BLANK_SETTINGS.social, ...(settings.social || {}) },
        footer: { ...BLANK_SETTINGS.footer, ...(settings.footer || {}) },
        footerLinks: Object.fromEntries(
          Object.entries(BLANK_SETTINGS.footerLinks).map(([key, value]) => [
            key,
            { ...value, ...(settings.footerLinks?.[key] || {}) },
          ]),
        ),
        announcement: {
          ...BLANK_SETTINGS.announcement,
          ...(settings.announcement || {}),
        },
        events: {
          ...BLANK_SETTINGS.events,
          ...(settings.events || {}),
          items: normalizeEventItems(settings.events?.items || []),
        },
        blog: { ...BLANK_SETTINGS.blog, ...(settings.blog || {}) },
        shipping: { ...BLANK_SETTINGS.shipping, ...(settings.shipping || {}) },
        checkout: { ...BLANK_SETTINGS.checkout, ...(settings.checkout || {}) },
        promises: { ...BLANK_SETTINGS.promises, ...(settings.promises || {}) },
        business: { ...BLANK_SETTINGS.business, ...(settings.business || {}) },
        policies: { ...BLANK_SETTINGS.policies, ...(settings.policies || {}) },
      });
    }
  }, [settings]);
  const set = (section, key, value) =>
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  const setFooterLink = (key, patch) =>
    setDraft((current) => ({
      ...current,
      footerLinks: {
        ...current.footerLinks,
        [key]: { ...current.footerLinks[key], ...patch },
      },
    }));
  const setEventItem = (index, patch) =>
    setDraft((current) => {
      const items = normalizeEventItems(current.events.items || []);
      const currentItem = items[index] || blankEventItem();
      items[index] = { ...currentItem, ...patch };
      return {
        ...current,
        events: {
          ...current.events,
          items: normalizeEventItems(items),
        },
      };
    });
  const save = async (event) => {
    event.preventDefault();
    const result = await dispatch(saveOnlineSettings(draft));
    result.error
      ? toast.error(result.payload || "Could not save settings")
      : toast.success("Storefront settings saved");
  };
  return (
    <form onSubmit={save} className="space-y-5">
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Store logo</h3>
        <p className="text-xs text-base-content/50">
          Shown in the header of customer emails (order confirmation &amp;
          review). Paste an image URL. Leave blank to show the store name as
          text.
        </p>
        <div className="mt-3 flex items-center gap-4">
          {draft.logo ? (
            <img
              src={draft.logo}
              alt="Logo preview"
              className="h-14 w-14 shrink-0 rounded-lg border object-contain bg-base-200"
            />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border bg-base-200 text-xs text-base-content/40">
              None
            </div>
          )}
          <input
            type="url"
            className="input input-sm input-bordered w-full"
            placeholder="https://res.cloudinary.com/.../logo.png"
            value={draft.logo}
            onChange={(event) =>
              setDraft((current) => ({ ...current, logo: event.target.value }))
            }
          />
        </div>
      </section>
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
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Opening hours e.g. Mon-Sat 9am - 4pm"
              value={draft.footer.openingHours}
              onChange={(event) =>
                set("footer", "openingHours", event.target.value)
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input input-sm input-bordered"
                placeholder="Payment logo URL"
                value={draft.footer.paymentImage}
                onChange={(event) =>
                  set("footer", "paymentImage", event.target.value)
                }
              />
              <input
                className="input input-sm input-bordered"
                placeholder="Footer warning icons URL"
                value={draft.footer.restrictionImage}
                onChange={(event) =>
                  set("footer", "restrictionImage", event.target.value)
                }
              />
            </div>
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Why e-cigarettes? page title"
              value={draft.footer.whyECigarettesTitle}
              onChange={(event) =>
                set("footer", "whyECigarettesTitle", event.target.value)
              }
            />
            <textarea
              className="textarea textarea-sm textarea-bordered"
              rows={4}
              placeholder="Why e-cigarettes? page content"
              value={draft.footer.whyECigarettesContent}
              onChange={(event) =>
                set("footer", "whyECigarettesContent", event.target.value)
              }
            />
          </div>
        </section>
      </div>
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Footer navigation</h3>
        <p className="mt-1 text-xs text-base-content/50">
          Rename, redirect or hide each customer-facing footer link. Use a store
          path such as <code>/blog</code>, a full HTTPS URL, email or phone link.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {FOOTER_LINK_FIELDS.map(([key, fallbackLabel]) => {
            const link = draft.footerLinks[key];
            return (
              <div key={key} className="rounded-lg border border-base-300 bg-base-200/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold">{fallbackLabel}</span>
                  <Check
                    checked={Boolean(link.enabled)}
                    onChange={(value) => setFooterLink(key, { enabled: value })}
                    label="Visible"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="input input-sm input-bordered min-w-0"
                    maxLength={80}
                    aria-label={`${fallbackLabel} label`}
                    placeholder="Link label"
                    value={link.label}
                    onChange={(event) => setFooterLink(key, { label: event.target.value })}
                  />
                  <input
                    className="input input-sm input-bordered min-w-0 font-mono text-xs"
                    aria-label={`${fallbackLabel} destination`}
                    placeholder="/page or https://..."
                    value={link.href}
                    onChange={(event) => setFooterLink(key, { href: event.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border bg-base-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold">
            Header announcement
          </h3>
          <Check
            checked={Boolean(draft.announcement.enabled)}
            onChange={(value) => set("announcement", "enabled", value)}
            label="Show announcement bar"
          />
        </div>
        <p className="text-xs text-base-content/50">
          Tip: use <code>{"{free}"}</code> for the free-shipping amount and{" "}
          <code>{"{dispatch}"}</code> for the dispatch text — they update
          automatically across the store when you change the Shipping settings.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="input input-sm input-bordered"
            value={draft.announcement.primary}
            placeholder="Free shipping over {free} · {dispatch}"
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
      <section className="min-w-0 overflow-hidden rounded-xl border bg-base-100 p-4 sm:p-5">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold">Events heading</h3>
            <p className="text-xs text-base-content/50">
              Optional fancy heading shown directly under the hero banner. Use it
              for seasonal events, launches or short announcements.
            </p>
          </div>
          <div className="min-w-0 sm:justify-self-end">
            <Check
              checked={Boolean(draft.events.enabled)}
              onChange={(value) => set("events", "enabled", value)}
              label="Show events heading"
            />
          </div>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <input
            className="input input-sm input-bordered w-full min-w-0"
            maxLength={140}
            value={draft.events.heading}
            placeholder="e.g. Summer drop live now"
            onChange={(event) => set("events", "heading", event.target.value)}
          />
          <select
            className="select select-sm select-bordered w-full min-w-0"
            value={draft.events.align}
            onChange={(event) => set("events", "align", event.target.value)}
          >
            <option value="left">Align left</option>
            <option value="center">Align center</option>
            <option value="right">Align right</option>
          </select>
        </div>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">
          {[0, 1, 2].map((index) => {
            const item = draft.events.items?.[index] || {
              kind: "product",
              targetId: "",
              enabled: false,
            };
            const options =
              item.kind === "category" ? categoryOptions : productOptions;
            return (
              <div
                key={index}
                className={`min-w-0 rounded-xl border p-3 transition-colors ${
                  item.enabled
                    ? "border-primary/40 bg-primary/5"
                    : "bg-base-200"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-base-content/50">
                    Event card {index + 1}
                  </div>
                  <label className="flex items-center gap-1 text-[11px] font-medium">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={Boolean(item.enabled)}
                      onChange={(event) =>
                        setEventItem(index, { enabled: event.target.checked })
                      }
                    />
                    Show
                  </label>
                </div>
                <div className="grid min-w-0 gap-2">
                  <select
                    className="select select-sm select-bordered w-full min-w-0"
                    value={item.kind}
                    onChange={(event) =>
                      setEventItem(index, {
                        kind: event.target.value,
                        targetId: "",
                        eventPrice: "",
                        tag: "",
                      })
                    }
                  >
                    <option value="product">Product</option>
                    <option value="category">Category</option>
                  </select>
                  <select
                    className="select select-sm select-bordered w-full min-w-0"
                    value={item.targetId}
                    onChange={(event) =>
                      setEventItem(index, {
                        targetId: event.target.value,
                        enabled: Boolean(event.target.value),
                      })
                    }
                  >
                    <option value="">
                      {item.kind === "category"
                        ? "Choose category"
                        : "Choose product"}
                    </option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.hidden ? " (hidden)" : ""}
                      </option>
                    ))}
                  </select>
                  {!options.length && (
                    <p className="text-[11px] text-warning">
                      No {item.kind === "category" ? "categories" : "products"} loaded yet.
                      Use Refresh if this tab was opened before the catalogue loaded.
                    </p>
                  )}
                  <input
                    className="input input-sm input-bordered w-full min-w-0"
                    maxLength={40}
                    placeholder="Optional red tag e.g. Halloween deal"
                    value={item.tag || ""}
                    onChange={(event) =>
                      setEventItem(index, { tag: event.target.value })
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="input input-sm input-bordered w-full min-w-0"
                    placeholder="Event price e.g. 5.99"
                    value={item.eventPrice || ""}
                    disabled={item.kind !== "product"}
                    onChange={(event) =>
                      setEventItem(index, { eventPrice: event.target.value })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div
          className={`mt-5 overflow-hidden rounded-2xl border bg-black p-5 text-white shadow-inner ${
            draft.events.align === "left"
              ? "text-left"
              : draft.events.align === "right"
                ? "text-right"
                : "text-center"
          }`}
        >
          <div>
            <span className="box-decoration-clone bg-white px-3 font-display text-3xl font-black leading-none text-black shadow-[8px_8px_0_#c6ff2e]">
              {draft.events.heading || "Your event heading"}
            </span>
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Shipping</h3>
        <p className="text-xs text-base-content/50">
          Charged at checkout. Orders at or above the free-shipping threshold
          ship free. POS sales are unaffected.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Flat shipping rate (€)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input input-sm input-bordered w-full"
              value={draft.shipping.flatRate}
              onChange={(event) =>
                set("shipping", "flatRate", Number(event.target.value))
              }
            />
          </Field>
          <Field label="Free shipping over (€)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input input-sm input-bordered w-full"
              value={draft.shipping.freeThreshold}
              onChange={(event) =>
                set("shipping", "freeThreshold", Number(event.target.value))
              }
            />
          </Field>
        </div>
        {/* Wording only — neither of these changes what anybody is charged or
            what may be returned. They sit under Shipping because that is the
            subject a shopper reads them about. */}
        <div className="mt-5 border-t border-base-300 pt-5">
          <h4 className="font-display font-bold">What the checkout says</h4>
          <p className="mt-1 text-xs text-base-content/50">
            Wording shown to the shopper. The free-delivery amount above is added
            automatically — do not repeat it here, or it will be said twice and
            can end up disagreeing with what is actually charged.
          </p>
          <div className="mt-4 grid gap-3">
            <Field label="Delivery note — shown under the payment method">
              <input
                maxLength={300}
                className="input input-sm input-bordered w-full"
                placeholder="Delivery is free within a 5 mile radius."
                value={draft.checkout.deliveryNote}
                onChange={(event) =>
                  set("checkout", "deliveryNote", event.target.value)
                }
              />
            </Field>
            <Field label="Order terms — shown once an order is placed">
              <textarea
                rows={4}
                maxLength={1200}
                className="textarea textarea-sm textarea-bordered w-full leading-relaxed"
                placeholder={CHECKOUT_TERMS_PLACEHOLDER}
                value={draft.checkout.orderTerms}
                onChange={(event) =>
                  set("checkout", "orderTerms", event.target.value)
                }
              />
              <span className="mt-1 block text-[11px] text-base-content/45">
                One rule per line. Leave blank to show nothing.
              </span>
            </Field>
          </div>
        </div>
      </section>
      <section className="hidden">
        <h3 className="font-display text-lg font-bold">Legacy trust settings</h3>
        <p className="text-xs text-base-content/50">
          The trust badges shown on every product page. Change these once and
          they update across the whole storefront.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Dispatch">
            <input
              className="input input-sm input-bordered w-full"
              placeholder="e.g. Fast dispatch / 2–3 day dispatch"
              value={draft.promises.dispatch}
              onChange={(event) =>
                set("promises", "dispatch", event.target.value)
              }
            />
          </Field>
          <Field label="Returns window (days)">
            <input
              type="number"
              min={0}
              max={365}
              className="input input-sm input-bordered w-full"
              value={draft.promises.returnsDays}
              onChange={(event) =>
                set("promises", "returnsDays", Number(event.target.value))
              }
            />
          </Field>
          {/* NOT wrapped in <Field> (a <label>): a label around a checkbox
              forwards the click back to it, double-toggling and cancelling the
              change. A plain container keeps the toggle working. */}
          <div className="form-control">
            <span className="mb-1 text-xs capitalize">Authenticity badge</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={!!draft.promises.authentic}
                onChange={(event) =>
                  set("promises", "authentic", event.target.checked)
                }
              />
              <input
                className="input input-sm input-bordered w-full"
                placeholder="100% authentic"
                value={draft.promises.authenticLabel}
                disabled={!draft.promises.authentic}
                onChange={(event) =>
                  set("promises", "authenticLabel", event.target.value)
                }
              />
            </div>
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Business &amp; legal</h3>
        <p className="text-xs text-base-content/50">
          Shown in the online store footer for transparency. Leave any field
          blank if it does not apply to your business.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Registered / legal name">
            <input
              className="input input-sm input-bordered"
              placeholder="e.g. Cliffs Retail Ltd"
              value={draft.business.legalName}
              onChange={(event) =>
                set("business", "legalName", event.target.value)
              }
            />
          </Field>
          <Field label="Trading name (if different)">
            <input
              className="input input-sm input-bordered"
              placeholder="e.g. Cliffs of Puff"
              value={draft.business.tradingName}
              onChange={(event) =>
                set("business", "tradingName", event.target.value)
              }
            />
          </Field>
          <Field label="Company registration number">
            <input
              className="input input-sm input-bordered"
              placeholder="e.g. 123456"
              value={draft.business.companyNumber}
              onChange={(event) =>
                set("business", "companyNumber", event.target.value)
              }
            />
          </Field>
          <Field label="VAT number">
            <input
              className="input input-sm input-bordered"
              placeholder="e.g. IE1234567X"
              value={draft.business.vatNumber}
              onChange={(event) =>
                set("business", "vatNumber", event.target.value)
              }
            />
          </Field>
        </div>
      </section>
      <section className="rounded-xl border bg-base-100 p-5">
        <h3 className="font-display text-lg font-bold">Policies &amp; legal pages</h3>
        <p className="text-xs text-base-content/50">
          These appear on the online store and are linked in the footer. Starter
          wording is provided — review and adapt it to your business. Use the
          toolbar for headings, lists and links; a link can point at another
          page on the site (<code>/refunds</code>), an outside address, an email
          or a phone number.
        </p>
        <div className="mt-4 space-y-3">
          {POLICY_FIELDS.map(([key, label, path]) => (
            <PolicyEditor
              key={key}
              label={label}
              path={path}
              value={draft.policies[key]}
              disabled={isActing}
              onChange={(html) => set("policies", key, html)}
            />
          ))}
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

// One-click happy path. A Pick & Pay shop fulfils in a single step, so a processing
// order goes straight to "delivered" (which is also what triggers the customer's
// review email). "shipped" remains a valid status for already-shipped orders.
const orderUnitCount = (order) =>
  (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const orderLineAmount = (item) => {
  const explicit = Number(item.lineTotal);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Number(item.unitPrice || 0) * Number(item.quantity || 0);
};

function Orders({ orders, isActing }) {
  const dispatch = useDispatch();
  // The order currently being moved along. One at a time, deliberately: this is
  // the screen where stock goes back on shelves and points change hands.
  const [fulfilling, setFulfilling] = useState(null);
  const downloadReport = async () => {
    const result = await dispatch(
      downloadOnlineReport({
        type: "orders",
        filename: `online-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not download orders report")
      : toast.success("Orders report downloaded");
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-sm btn-outline gap-2"
          onClick={downloadReport}
        >
          <FiDownloadCloud /> Generate orders report
        </button>
      </div>
      {/* The shop fulfils from whatever is to hand, and that is often a phone
          on the packing bench. A nine-column table cannot be worked from one,
          so below lg the same orders are cards: the reference and the money
          where the eye lands, the progress rail, and one button that opens the
          same sheet the table's Update button does. */}
      <div className="space-y-3 lg:hidden">
        {orders.map((order) => (
          <div key={order._id} className="rounded-xl border bg-base-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono font-bold">{order.orderNo}</div>
                <div className="text-xs text-base-content/50">
                  {new Date(order.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  €{money(order.total)}
                </div>
                <div className="text-xs text-base-content/50">
                  {orderUnitCount(order)} item
                  {orderUnitCount(order) === 1 ? "" : "s"}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div className="font-medium">{order.customer?.name}</div>
              <div className="truncate text-xs text-base-content/50">
                {order.customer?.email}
              </div>
            </div>

            {order.items?.length > 0 && (
              <ul className="mt-3 space-y-0.5 border-t pt-3 text-sm">
                {order.items.slice(0, 3).map((item, index) => (
                  <li
                    key={`${order._id}-m-${item.product || item.name || index}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">
                      {item.name || "Product"}
                    </span>
                    <span className="shrink-0 text-xs text-base-content/60">
                      x{item.quantity || 0}
                    </span>
                  </li>
                ))}
                {order.items.length > 3 && (
                  <li className="text-xs text-base-content/50">
                    +{order.items.length - 3} more
                  </li>
                )}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
              <div className="min-w-0">
                <FulfilmentTrack order={order} compact />
                <div className="mt-1 text-xs text-base-content/60">
                  {statusLabel(order.status)} ·{" "}
                  {order.payment?.method === "cash_on_delivery"
                    ? "Pick & Pay"
                    : order.payment?.provider || "Manual"}
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm shrink-0"
                disabled={isActing}
                onClick={() => setFulfilling(order)}
              >
                Update
              </button>
            </div>
          </div>
        ))}
        {!orders.length && (
          <div className="rounded-xl border bg-base-100 py-8 text-center text-base-content/50">
            No online orders yet.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-base-100 lg:block">
        <table className="table table-sm">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Description</th>
            <th>Voucher</th>
            <th className="text-right">Total</th>
            <th>Payment</th>
            <th>Fulfilment</th>
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
              <td>{orderUnitCount(order)}</td>
              <td className="min-w-[280px] max-w-[420px]">
                {order.items?.length ? (
                  <div className="space-y-1">
                    {order.items.slice(0, 3).map((item, index) => (
                      <div
                        key={`${order._id}-${item.product || item.name || index}`}
                        className="flex items-start justify-between gap-3 text-sm"
                        title={`${item.name || "Product"} x ${item.quantity || 0}`}
                      >
                        <span className="min-w-0 truncate">
                          {item.name || "Product"}
                        </span>
                        <span className="shrink-0 text-xs text-base-content/60">
                          x{item.quantity || 0} · €{money(orderLineAmount(item))}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-xs text-base-content/50">
                        +{order.items.length - 3} more item
                        {order.items.length - 3 === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-base-content/40">No item detail</span>
                )}
              </td>
              <td>{order.voucher?.code || "—"}</td>
              <td className="text-right">€{money(order.total)}</td>
              <td>
                <div className="font-medium">
                  {order.payment?.method === "cash_on_delivery"
                    ? "Pick & Pay"
                    : order.payment?.provider || "Manual"}
                </div>
                <div className="text-xs capitalize text-base-content/50">
                  {order.payment?.status || "unpaid"}
                </div>
              </td>
              <td>
                <div className="flex flex-col gap-1">
                  <FulfilmentTrack order={order} compact />
                  <span className="text-xs text-base-content/60">
                    {statusLabel(order.status)}
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap text-right">
                <button
                  className="btn btn-primary btn-xs"
                  disabled={isActing}
                  onClick={() => setFulfilling(order)}
                >
                  Update
                </button>
              </td>
            </tr>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={9} className="py-8 text-center text-base-content/50">
                No online orders yet.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>

      {fulfilling && (
        <FulfilmentModal
          order={fulfilling}
          isActing={isActing}
          onClose={() => setFulfilling(null)}
        />
      )}
    </div>
  );
}

function NewsletterEmails({ subscribers, settings, isActing }) {
  const dispatch = useDispatch();
  const [heading, setHeading] = useState("Subscribe to our newsletters");

  useEffect(() => {
    setHeading(
      settings?.footer?.newsletterHeading || "Subscribe to our newsletters",
    );
  }, [settings]);

  const saveHeading = async (event) => {
    event.preventDefault();
    const result = await dispatch(
      saveOnlineSettings({
        footer: {
          ...(settings?.footer || {}),
          newsletterHeading: heading,
        },
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not save newsletter heading")
      : toast.success("Newsletter heading saved");
  };

  const downloadReport = async () => {
    const result = await dispatch(
      downloadOnlineReport({
        type: "newsletter",
        filename: `newsletter-emails-${new Date().toISOString().slice(0, 10)}.csv`,
      }),
    );
    result.error
      ? toast.error(result.payload || "Could not download newsletter report")
      : toast.success("Newsletter report downloaded");
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={saveHeading}
        className="rounded-xl border bg-base-100 p-5"
      >
        <h3 className="font-display text-lg font-bold">
          Newsletter footer text
        </h3>
        <p className="text-xs text-base-content/50">
          This controls the heading above the email box in the storefront footer.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input input-sm input-bordered min-w-[260px] flex-1"
            value={heading}
            maxLength={120}
            onChange={(event) => setHeading(event.target.value)}
          />
          <button className="btn btn-sm btn-primary gap-2" disabled={isActing}>
            <FiSave /> Save
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline gap-2"
            onClick={downloadReport}
          >
            <FiDownloadCloud /> Generate report
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Email</th>
              <th>Source</th>
              <th>Status</th>
              <th>Subscribed at</th>
            </tr>
          </thead>
          <tbody>
            {(subscribers || []).map((subscriber) => (
              <tr key={subscriber._id || subscriber.email}>
                <td className="font-medium">{subscriber.email}</td>
                <td>{subscriber.source || "footer"}</td>
                <td>
                  <span className="badge badge-sm">
                    {subscriber.active === false ? "inactive" : "active"}
                  </span>
                </td>
                <td>
                  {subscriber.createdAt
                    ? new Date(subscriber.createdAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
            {!subscribers?.length && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-base-content/50">
                  No newsletter emails yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmergencyAlertSettings({ settings, isActing }) {
  const dispatch = useDispatch();
  const [draft, setDraft] = useState(BLANK_SETTINGS.emergencyAlert);

  useEffect(() => {
    setDraft({
      ...BLANK_SETTINGS.emergencyAlert,
      ...(settings?.emergencyAlert || {}),
    });
  }, [settings]);

  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    const result = await dispatch(saveOnlineSettings({ emergencyAlert: draft }));
    result.error
      ? toast.error(result.payload || "Could not save emergency alert")
      : toast.success("Emergency alert saved");
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="rounded-xl border bg-base-100 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Emergency alert</h3>
            <p className="max-w-2xl text-xs leading-relaxed text-base-content/50">
              When active, visitors see only the maintenance page across the
              storefront. Turn it off to restore the normal shop.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-full bg-base-200 px-4 py-2 text-sm font-medium">
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={!!draft.active}
              onChange={(event) => set("active", event.target.checked)}
            />
            {draft.active ? "Active" : "Inactive"}
          </label>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Field label="Alert title">
              <input
                className="input input-sm input-bordered w-full"
                maxLength={120}
                value={draft.title}
                placeholder="Website under maintenance"
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>
            <Field label="Alert message">
              <textarea
                className="textarea textarea-bordered min-h-28 w-full"
                maxLength={500}
                value={draft.message}
                placeholder="We are updating the website. Please check back shortly."
                onChange={(event) => set("message", event.target.value)}
              />
            </Field>
            <Field label="Button label">
              <input
                className="input input-sm input-bordered w-full"
                maxLength={80}
                value={draft.buttonLabel}
                placeholder="Come back soon"
                onChange={(event) => set("buttonLabel", event.target.value)}
              />
            </Field>
            <Field label="Alert style">
              <select
                className="select select-sm select-bordered w-full"
                value={draft.tone}
                onChange={(event) => set("tone", event.target.value)}
              >
                <option value="maintenance">Maintenance yellow</option>
                <option value="warning">Red warning</option>
                <option value="info">Clean info</option>
              </select>
            </Field>
          </div>

          <div className="rounded-2xl border bg-base-200 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-base-content/50">
              Storefront preview
            </div>
            <div
              className={`rounded-2xl border p-4 shadow-lg ${
                draft.tone === "warning"
                  ? "border-red-300 bg-red-50 text-red-950"
                  : draft.tone === "info"
                    ? "border-sky-200 bg-sky-50 text-sky-950"
                    : "border-yellow-300 bg-yellow-100 text-yellow-950"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">
                {draft.active ? "Live alert" : "Hidden until activated"}
              </div>
              <div className="mt-2 font-display text-2xl leading-none">
                {draft.title || "Website under maintenance"}
              </div>
              <p className="mt-3 text-sm leading-6 opacity-80">
                {draft.message ||
                  "We are making a few improvements. Please check back shortly."}
              </p>
              <div className="mt-4 inline-flex rounded-md bg-black/70 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
                {draft.buttonLabel || "Come back soon"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button className="btn btn-primary gap-2" disabled={isActing}>
          <FiSave /> Save emergency alert
        </button>
      </div>
    </form>
  );
}

function Reviews({ reviews, isActing }) {
  const dispatch = useDispatch();
  const toggle = async (review) => {
    const status = review.status === "published" ? "hidden" : "published";
    const result = await dispatch(
      updateOnlineReview({ id: review._id, status }),
    );
    result.error
      ? toast.error(result.payload)
      : toast.success(status === "hidden" ? "Review hidden" : "Review published");
  };
  const remove = async (review) => {
    if (!window.confirm("Delete this review permanently?")) return;
    const result = await dispatch(deleteOnlineReview(review._id));
    result.error
      ? toast.error(result.payload)
      : toast.success("Review deleted");
  };
  return (
    <div className="overflow-x-auto rounded-xl border bg-base-100">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Product</th>
            <th>Rating</th>
            <th>Review</th>
            <th>Customer</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review._id} className={review.status === "hidden" ? "opacity-50" : ""}>
              <td>
                <div className="font-medium">{review.product}</div>
                <div className="text-xs text-base-content/50">
                  {new Date(review.createdAt).toLocaleDateString()}
                </div>
              </td>
              <td className="whitespace-nowrap text-amber-500">
                {"★".repeat(review.rating)}
                <span className="text-base-content/20">
                  {"★".repeat(5 - review.rating)}
                </span>
              </td>
              <td className="max-w-xs">
                {review.title && (
                  <div className="font-medium">{review.title}</div>
                )}
                {review.body && (
                  <div className="text-xs text-base-content/60 line-clamp-2">
                    {review.body}
                  </div>
                )}
              </td>
              <td>
                <div>{review.customerName}</div>
                {review.verified && (
                  <div className="text-xs text-success">Verified purchase</div>
                )}
              </td>
              <td>
                <span
                  className={`badge badge-sm ${
                    review.status === "published" ? "badge-success" : "badge-ghost"
                  }`}
                >
                  {review.status}
                </span>
              </td>
              <td className="whitespace-nowrap text-right">
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={isActing}
                  onClick={() => toggle(review)}
                >
                  {review.status === "published" ? "Hide" : "Show"}
                </button>
                <button
                  className="btn btn-ghost btn-xs text-error"
                  disabled={isActing}
                  onClick={() => remove(review)}
                >
                  <FiTrash2 />
                </button>
              </td>
            </tr>
          ))}
          {!reviews.length && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-base-content/50">
                No reviews yet. Customers are invited to review each product once
                their order is marked delivered.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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
