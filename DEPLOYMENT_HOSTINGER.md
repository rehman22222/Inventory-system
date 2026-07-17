# Deploying to Hostinger (single full-stack app)

The whole app — Express API **and** the React frontend — runs as **one Node
deployment** on Hostinger, served from **`inventory.eiretech360.com`**. The
Express server serves the built React app for every non-`/api` path, so there is
**no separate `api` subdomain, no CORS, and no cross-subdomain cookies** to
manage. The database stays on **MongoDB Atlas** (Hostinger shared hosting has no
MongoDB).

| Piece | Where |
|---|---|
| App (API + frontend) | One Node.js deployment → `https://inventory.eiretech360.com` |
| Database | MongoDB Atlas (unchanged) |

How it fits together:
- `backend/package.json` `build` script builds the frontend into
  `frontend/build`.
- `backend/server.js` serves that build and falls back to `index.html` for
  client routes; `/api/*` stays the API.
- `frontend/.env.production` points the app at its own public URL.

---

## Phase 0 — Pre-flight

1. **Atlas network access (critical).** MongoDB Atlas → Network Access → add the
   Hostinger server IP **`153.92.9.187`** (or `0.0.0.0/0`). Without this the app
   can't reach the database.
2. **Copy the current secrets** from Render: `MONGODB_URL`, `SecretKey`, and the
   `CLOUDINARY_*` values — you'll paste the same ones into Hostinger. Keep
   `SecretKey` identical.
3. **(Recommended) Server location → Europe** (Plan details → pencil next to
   Server Location) — the shop is in Ireland.

---

## Phase 1 — Deploy on Hostinger (Deployments → import repo)

Repo: **`etumairansari-pixel/inventory.system`**, branch **`main`**. On the
**Review build settings** screen set:

| Field | Value |
|---|---|
| Framework preset | **Express** |
| Branch | **main** |
| Node version | **22.x** |
| Root directory | **backend** |
| Package manager (Build & output → Change) | **npm** |
| Entry file (Build & output → Change) | **server.js** |

Hostinger's Express deploy only runs `npm install` then the entry file — there is
no separate build-command field. The frontend is built automatically by the
backend's **`postinstall`** hook (it runs after `npm install` and builds
`frontend/build`, which the server then serves). Nothing extra to configure.

Then **Add environment variables** (see below) and **Deploy**. Deploys to
`inventory.eiretech360.com`.

> **If the build errors with "cannot find ../frontend":** Hostinger checked out
> only the `backend` subfolder. In that case set **Root directory** to the repo
> root and Build command to `npm --prefix backend install && npm run build --prefix backend`,
> Start to `npm start --prefix backend`. (Usually not needed — the whole repo is
> checked out and `../frontend` resolves from `backend`.)

---

## Environment variables

Set these on the deployment. **Do NOT set `PORT`** — Hostinger assigns it.

**Required**
```
MONGODB_URL         = <your Atlas connection string>
SecretKey           = <your JWT secret>          # exact casing: SecretKey
CLOUDINARY_CLOUD_NAME = <from Cloudinary>
CLOUDINARY_API_KEY    = <from Cloudinary>
CLOUDINARY_API_SECRET = <from Cloudinary>
SMTP_HOST           = smtp.hostinger.com
SMTP_PORT           = 465
SMTP_SECURE         = true
SMTP_USER           = orders@inventory.eiretech360.com
SMTP_PASS           = <the mailbox password>
APP_URL             = https://inventory.eiretech360.com
NODE_ENV            = production
```

**Optional** (sensible defaults already in code)
```
CORS_ORIGIN         = https://inventory.eiretech360.com   # same-origin, harmless
RATE_LIMIT_MAX      = 600
AUTH_RATE_LIMIT_MAX = 40
DB_POOL_MAX         = 20
DB_POOL_MIN         = 2
```

**Do NOT set**
- `PORT` — Hostinger assigns it.
- `RENDER_EXTERNAL_URL` — Render-only keep-alive; harmless if absent.
- `USE_LOCAL_STORAGE` — leave unset (or `false`) so it uses MongoDB.

---

## Phase 2 — Verify end-to-end

- `https://inventory.eiretech360.com` loads the app; refresh on a deep link
  (e.g. `/pos`) still works (SPA routing).
- **Login / roles** work.
- **Image upload** (add a product image) — confirms Cloudinary env.
- **Reports** download.
- **Real-time** (notifications/stock) — Socket.IO; falls back to polling if
  websockets are restricted, so it still works.
- **Email (the reason for the move):** sell a product down to its threshold →
  a reorder appears + the shop gets the reminder email → approve it → the
  supplier gets the order email. This confirms SMTP sends from Hostinger.

---

## Notes / gotchas

- **`SecretKey` casing matters** — read as `process.env.SecretKey`. Set it
  exactly, same value as before, or existing logins break.
- **Database stays on Atlas.** Only where the server runs changes.
- **Same-origin** means no CORS headache: the frontend calls `/api` on the very
  domain it's served from (`frontend/.env.production` sets the URL).
- **Email deliverability:** to keep supplier emails out of spam, later add the
  **SPF/DKIM** records Hostinger provides for the mail domain — at GoDaddy,
  since that's where the domain's DNS lives (`ns03/ns04.domaincontrol.com`).
- **Keep Render/Vercel up until Hostinger is verified**, then switch off.
