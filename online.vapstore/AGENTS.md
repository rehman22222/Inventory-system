# Cliffs of Puff — online store

TanStack Start (SSR React) storefront. It sells the shop's real stock: product,
category and hero content come from the E360 inventory backend, and an order
placed here decrements the same `Product.quantity` the till reads.

## Running it

```
npm install
npm run dev      # http://localhost:5173
npm run build    # SSR build into .output
```

## Where things live

```
src/routes/        file-based routes (index, shop, category.$slug, product.$id, cart, sale, account)
src/components/    Header, Footer, HeroCarousel, ProductCard, CategoryTile, BrandMarquee
src/lib/cart.tsx   client cart (localStorage, SSR-safe)
src/data/          catalogue + hero slides (moving to the backend API)
src/styles.css     design tokens — cream / lime / ink editorial system
```

## House rules

- Stock is never stored here. It is read from the backend and decremented there.
- Prices go through `src/lib/format.ts` so currency changes in one place.
- Hero slides are data, not markup — see `src/data/promos.ts`.
