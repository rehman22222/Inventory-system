import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosInstance from "../lib/axios";

/* The online store's admin state.
 *
 * Everything here talks to /api/online, which reads and writes the SAME
 * product stock the till uses — listing a product on the website never copies
 * it, it just opens a window onto the shelf. */

const fail = (error, fallback) => error.response?.data?.message || fallback;

// ── Report ──────────────────────────────────────────────────────────────────
export const getOnlineSummary = createAsyncThunk(
  "online/summary",
  async (days = 30, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(`online/summary?days=${days}`);
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load the online report"));
    }
  },
);

// ── The "Add product" picker ────────────────────────────────────────────────
// Server-side search + category filter + paging, so a big catalogue never has
// to be shipped to the browser in one go.
export const getCatalogue = createAsyncThunk(
  "online/catalogue",
  async (
    { search = "", category = "", page = 1 } = {},
    { rejectWithValue },
  ) => {
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "40" });
      if (search) qs.set("search", search);
      if (category) qs.set("category", category);
      const { data } = await axiosInstance.get(
        `online/catalogue?${qs.toString()}`,
      );
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load the catalogue"));
    }
  },
);

// Search the inventory for options (flavours / colours). Returns the payload
// directly to the caller (kept in the editor's local state) so it never fights
// the shared `catalogue` slice the "Add product" picker uses.
export const searchInventoryProducts = createAsyncThunk(
  "online/inventory/search",
  async ({ search = "", category = "", page = 1 } = {}, { rejectWithValue }) => {
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) qs.set("search", search);
      if (category) qs.set("category", category);
      const { data } = await axiosInstance.get(
        `online/catalogue?${qs.toString()}`,
      );
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not search inventory"));
    }
  },
);

// Create a brand-new inventory product inline (e.g. a new flavour/colour that
// the shop has never stocked). Returns the created product to the caller.
export const createInventoryProduct = createAsyncThunk(
  "online/inventory/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post(
        "online/inventory-products",
        payload,
      );
      return data.product;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not create the product"));
    }
  },
);

// Upload a web-only picture; returns { url, publicId } to attach to a listing.
export const uploadListingImages = createAsyncThunk(
  "online/upload",
  async (files, { rejectWithValue }) => {
    try {
      const form = new FormData();
      Array.from(files || []).forEach((file) => form.append("images", file));
      const { data } = await axiosInstance.post("online/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data.images || (data.image ? [data.image] : []);
    } catch (error) {
      return rejectWithValue(fail(error, "Image upload failed"));
    }
  },
);

export const importInventoryCategories = createAsyncThunk(
  "online/categories/import",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post("online/categories/import");
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not import categories"));
    }
  },
);

// ── Categories ──────────────────────────────────────────────────────────────
export const getOnlineCategories = createAsyncThunk(
  "online/categories/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/categories");
      return data.categories;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load categories"));
    }
  },
);

export const createOnlineCategory = createAsyncThunk(
  "online/categories/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post("online/categories", payload);
      return data.category;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not create the category"));
    }
  },
);

export const updateOnlineCategory = createAsyncThunk(
  "online/categories/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.put(
        `online/categories/${id}`,
        payload,
      );
      return data.category;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not update the category"));
    }
  },
);

export const deleteOnlineCategory = createAsyncThunk(
  "online/categories/delete",
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`online/categories/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not delete the category"));
    }
  },
);

// ── Reviews ─────────────────────────────────────────────────────────────────
export const getOnlineReviews = createAsyncThunk(
  "online/reviews/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/reviews");
      return data.reviews;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load reviews"));
    }
  },
);

export const updateOnlineReview = createAsyncThunk(
  "online/reviews/update",
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.patch(`online/reviews/${id}`, {
        status,
      });
      return { id, status: data.review.status };
    } catch (error) {
      return rejectWithValue(fail(error, "Could not update the review"));
    }
  },
);

export const deleteOnlineReview = createAsyncThunk(
  "online/reviews/delete",
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`online/reviews/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not delete the review"));
    }
  },
);

// ── Listings ────────────────────────────────────────────────────────────────
export const getOnlineListings = createAsyncThunk(
  "online/listings/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/listings");
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load listings"));
    }
  },
);

export const saveOnlineListing = createAsyncThunk(
  "online/listings/save",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post("online/listings", payload);
      return data.listing;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not save the listing"));
    }
  },
);

export const updateOnlineListing = createAsyncThunk(
  "online/listings/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.put(
        `online/listings/${id}`,
        payload,
      );
      return data.listing;
    } catch (error) {
      return rejectWithValue(
        fail(error, "Could not update the online product"),
      );
    }
  },
);

export const toggleOnlineListing = createAsyncThunk(
  "online/listings/toggle",
  async ({ id, listed }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.patch(
        `online/listings/${id}/toggle`,
        { listed },
      );
      return data.listing;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not update the listing"));
    }
  },
);

export const deleteOnlineListing = createAsyncThunk(
  "online/listings/delete",
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`online/listings/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not remove the listing"));
    }
  },
);

// ── Vouchers and public store settings ────────────────────────────────────
export const getOnlineVouchers = createAsyncThunk(
  "online/vouchers/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/vouchers");
      return data.vouchers;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load vouchers"));
    }
  },
);

export const saveOnlineVoucher = createAsyncThunk(
  "online/vouchers/save",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = id
        ? await axiosInstance.put(`online/vouchers/${id}`, payload)
        : await axiosInstance.post("online/vouchers", payload);
      return data.voucher;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not save the voucher"));
    }
  },
);

export const deleteOnlineVoucher = createAsyncThunk(
  "online/vouchers/delete",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.delete(`online/vouchers/${id}`);
      return { id, voucher: data.voucher || null };
    } catch (error) {
      return rejectWithValue(fail(error, "Could not delete the voucher"));
    }
  },
);

export const getOnlineSettings = createAsyncThunk(
  "online/settings/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/settings");
      return data.settings;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load storefront settings"));
    }
  },
);

export const saveOnlineSettings = createAsyncThunk(
  "online/settings/save",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.put("online/settings", payload);
      return data.settings;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not save storefront settings"));
    }
  },
);

// ── Hero slides ─────────────────────────────────────────────────────────────
export const getHeroSlides = createAsyncThunk(
  "online/hero/get",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get("online/hero");
      return data.slides;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load hero slides"));
    }
  },
);

export const createHeroSlide = createAsyncThunk(
  "online/hero/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post("online/hero", payload);
      return data.slide;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not create the slide"));
    }
  },
);

export const updateHeroSlide = createAsyncThunk(
  "online/hero/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.put(`online/hero/${id}`, payload);
      return data.slide;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not update the slide"));
    }
  },
);

export const deleteHeroSlide = createAsyncThunk(
  "online/hero/delete",
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.delete(`online/hero/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not delete the slide"));
    }
  },
);

// ── Orders ──────────────────────────────────────────────────────────────────
export const getOnlineOrders = createAsyncThunk(
  "online/orders/get",
  async (status, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(
        `online/orders${status ? `?status=${status}` : ""}`,
      );
      return data;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not load orders"));
    }
  },
);

export const setOrderStatus = createAsyncThunk(
  "online/orders/status",
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.patch(`online/orders/${id}/status`, {
        status,
      });
      return data.order;
    } catch (error) {
      return rejectWithValue(fail(error, "Could not update the order"));
    }
  },
);

const initialState = {
  summary: null,
  categories: [],
  listings: [],
  counts: { total: 0, listed: 0 },
  slides: [],
  vouchers: [],
  settings: null,
  orders: [],
  pendingOrders: 0,
  reviews: [],
  // The picker's paged view of the inventory catalogue.
  catalogue: { products: [], total: 0, page: 1, pages: 1 },
  isLoading: false,
  isActing: false,
  isUploading: false,
  error: null,
};

const upsert = (list, item) => {
  const i = list.findIndex((x) => x._id === item._id);
  if (i === -1) return [item, ...list];
  const copy = [...list];
  copy[i] = item;
  return copy;
};

const onlineStoreSlice = createSlice({
  name: "onlineStore",
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b
      // Summary
      .addCase(getOnlineSummary.pending, (s) => {
        s.isLoading = true;
      })
      .addCase(getOnlineSummary.fulfilled, (s, a) => {
        s.isLoading = false;
        s.summary = a.payload;
      })
      .addCase(getOnlineSummary.rejected, (s, a) => {
        s.isLoading = false;
        s.error = a.payload;
      })

      // Picker
      .addCase(getCatalogue.pending, (s) => {
        s.isLoading = true;
      })
      .addCase(getCatalogue.fulfilled, (s, a) => {
        s.isLoading = false;
        s.catalogue = a.payload;
      })
      .addCase(getCatalogue.rejected, (s, a) => {
        s.isLoading = false;
        s.error = a.payload;
      })
      .addCase(uploadListingImages.pending, (s) => {
        s.isUploading = true;
      })
      .addCase(uploadListingImages.fulfilled, (s) => {
        s.isUploading = false;
      })
      .addCase(uploadListingImages.rejected, (s) => {
        s.isUploading = false;
      })
      .addCase(importInventoryCategories.fulfilled, (s, a) => {
        if (Array.isArray(a.payload.categories))
          s.categories = [...s.categories, ...a.payload.categories];
      })

      // Categories
      .addCase(getOnlineCategories.fulfilled, (s, a) => {
        s.categories = a.payload;
      })
      .addCase(createOnlineCategory.fulfilled, (s, a) => {
        s.categories = [...s.categories, a.payload];
      })
      .addCase(updateOnlineCategory.fulfilled, (s, a) => {
        s.categories = upsert(s.categories, a.payload);
      })
      .addCase(deleteOnlineCategory.fulfilled, (s, a) => {
        s.categories = s.categories.filter((c) => c._id !== a.payload);
      })

      // Reviews
      .addCase(getOnlineReviews.fulfilled, (s, a) => {
        s.reviews = a.payload;
      })
      .addCase(updateOnlineReview.fulfilled, (s, a) => {
        s.reviews = s.reviews.map((r) =>
          r._id === a.payload.id ? { ...r, status: a.payload.status } : r,
        );
      })
      .addCase(deleteOnlineReview.fulfilled, (s, a) => {
        s.reviews = s.reviews.filter((r) => r._id !== a.payload);
      })

      // Listings
      .addCase(getOnlineListings.pending, (s) => {
        s.isLoading = true;
      })
      .addCase(getOnlineListings.fulfilled, (s, a) => {
        s.isLoading = false;
        s.listings = a.payload.listings;
        s.counts = a.payload.counts;
      })
      .addCase(getOnlineListings.rejected, (s, a) => {
        s.isLoading = false;
        s.error = a.payload;
      })
      .addCase(saveOnlineListing.pending, (s) => {
        s.isActing = true;
      })
      .addCase(saveOnlineListing.fulfilled, (s, a) => {
        s.isActing = false;
        s.listings = upsert(s.listings, a.payload);
      })
      .addCase(saveOnlineListing.rejected, (s) => {
        s.isActing = false;
      })
      .addCase(updateOnlineListing.pending, (s) => {
        s.isActing = true;
      })
      .addCase(updateOnlineListing.fulfilled, (s, a) => {
        s.isActing = false;
        s.listings = upsert(s.listings, a.payload);
        s.counts.listed = s.listings.filter((listing) => listing.listed).length;
      })
      .addCase(updateOnlineListing.rejected, (s) => {
        s.isActing = false;
      })
      .addCase(toggleOnlineListing.fulfilled, (s, a) => {
        s.listings = s.listings.map((l) =>
          l._id === a.payload._id ? { ...l, listed: a.payload.listed } : l,
        );
        s.counts.listed = s.listings.filter((l) => l.listed).length;
      })
      .addCase(deleteOnlineListing.fulfilled, (s, a) => {
        s.listings = s.listings.filter((l) => l._id !== a.payload);
      })

      // Promotions and storefront settings
      .addCase(getOnlineVouchers.fulfilled, (s, a) => {
        s.vouchers = a.payload;
      })
      .addCase(saveOnlineVoucher.pending, (s) => {
        s.isActing = true;
      })
      .addCase(saveOnlineVoucher.fulfilled, (s, a) => {
        s.isActing = false;
        s.vouchers = upsert(s.vouchers, a.payload);
      })
      .addCase(saveOnlineVoucher.rejected, (s) => {
        s.isActing = false;
      })
      .addCase(deleteOnlineVoucher.fulfilled, (s, a) => {
        s.vouchers = a.payload.voucher
          ? upsert(s.vouchers, a.payload.voucher)
          : s.vouchers.filter((voucher) => voucher._id !== a.payload.id);
      })
      .addCase(getOnlineSettings.fulfilled, (s, a) => {
        s.settings = a.payload;
      })
      .addCase(saveOnlineSettings.pending, (s) => {
        s.isActing = true;
      })
      .addCase(saveOnlineSettings.fulfilled, (s, a) => {
        s.isActing = false;
        s.settings = a.payload;
      })
      .addCase(saveOnlineSettings.rejected, (s) => {
        s.isActing = false;
      })

      // Hero
      .addCase(getHeroSlides.fulfilled, (s, a) => {
        s.slides = a.payload;
      })
      .addCase(createHeroSlide.fulfilled, (s, a) => {
        s.slides = [...s.slides, a.payload];
      })
      .addCase(updateHeroSlide.fulfilled, (s, a) => {
        s.slides = upsert(s.slides, a.payload);
      })
      .addCase(deleteHeroSlide.fulfilled, (s, a) => {
        s.slides = s.slides.filter((x) => x._id !== a.payload);
      })

      // Orders
      .addCase(getOnlineOrders.pending, (s) => {
        s.isLoading = true;
      })
      .addCase(getOnlineOrders.fulfilled, (s, a) => {
        s.isLoading = false;
        s.orders = a.payload.orders;
        s.pendingOrders = a.payload.pending;
      })
      .addCase(getOnlineOrders.rejected, (s, a) => {
        s.isLoading = false;
        s.error = a.payload;
      })
      .addCase(setOrderStatus.pending, (s) => {
        s.isActing = true;
      })
      .addCase(setOrderStatus.fulfilled, (s, a) => {
        s.isActing = false;
        s.orders = upsert(s.orders, a.payload);
      })
      .addCase(setOrderStatus.rejected, (s) => {
        s.isActing = false;
      });
  },
});

export default onlineStoreSlice.reducer;
