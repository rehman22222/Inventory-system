# Hostinger deployment — online storefront only

This folder is the public storefront. The E360Pro backend, MongoDB connection,
Cloudinary credentials, and admin application remain on the existing backend
host and must not be uploaded to Hostinger.

## hPanel settings

Use **Websites → Add Website → Deploy Web App** and deploy this folder as a
Node.js application. Hostinger currently supports Node.js web apps on Business
and Cloud plans, and supports Node 20, 22, and 24.

- Framework: `Other` (TanStack Start / Nitro)
- Node.js version: `22`
- Package manager: `npm`
- Entry file: `hostinger-entry.mjs`
- Start command: `npm start`

The production build is server-rendered. Do not configure it as a static Vite
site because checkout and inventory requests run in server functions. Hostinger
currently only asks for a package manager and entry file with the `Other`
preset. Its dependency install invokes the package's `postinstall` script,
which generates `.output`; `hostinger-entry.mjs` then starts the generated
Nitro server. Vite, the React Vite plugin, and Nitro intentionally remain in
`dependencies` because Hostinger installs with `NODE_ENV=production` and would
otherwise omit the build tooling.

## Required environment variables

Add these in the Hostinger Node.js application's **Environment Variables**
section:

```text
E360_API_URL=https://YOUR-E360PRO-BACKEND-DOMAIN
STOREFRONT_API_KEY=THE-SAME-VALUE-CONFIGURED-ON-E360PRO
NODE_ENV=production
```

Do not prefix either secret with `VITE_`; `VITE_` variables are exposed to the
browser bundle. Do not upload the local `.env` file.

On the E360Pro backend, keep:

```text
STOREFRONT_API_KEY=THE-SAME-STRONG-RANDOM-VALUE
STOREFRONT_PUBLIC_URL=https://cliffsofpuff.com
```

The backend URL must be public HTTPS and reachable from Hostinger. Browser CORS
is not required for catalogue and checkout calls because the Hostinger Node
process calls E360Pro server-to-server.

## Recommended upload method

GitHub deployment gives repeatable builds and automatic redeployments. If using
a ZIP instead, put `package.json` at the ZIP root and exclude:

- `.env`
- `node_modules`
- `dist`
- `.output`
- `.tanstack`
- `.wrangler`
- local log files

Hostinger installs dependencies and generates `.output` during deployment.

## Production checks

1. Open `/shop` and confirm product prices show `€`.
2. Open a product that has flavours and confirm each option shows its own stock.
3. Add an in-stock option, submit checkout, and confirm the E360Pro product
   quantity decreases once.
4. Retry the same checkout request and confirm the idempotent order number is
   returned without a second stock decrement.
5. Cancel that test order in E360Pro and confirm stock is restored once.
6. Confirm `.env` and `STOREFRONT_API_KEY` are absent from browser source.
7. In **Admin → Online Store → Settings**, save the real Instagram, Facebook,
   X/Twitter and TikTok profile URLs; confirm each visible footer icon opens the
   exact profile in a new tab.
8. Create a restricted test voucher in **Promotions**, apply it at checkout,
   and confirm the final order stores the voucher code and discount.
9. Confirm all four hero slides render, then edit one in **Hero slides** and
   refresh the storefront to confirm the change.

Official references:

- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://tanstack.com/start/latest/docs/framework/react/guide/hosting
