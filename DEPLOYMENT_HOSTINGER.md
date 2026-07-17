# Deploying to Hostinger (backend + frontend)

Moving off Render (backend) and Vercel (frontend) onto the Hostinger Business
plan. The plan supports Node.js/Express apps, so the backend can run here and —
unlike Render's free tier — **outbound SMTP works**, so the reorder/supplier
emails go live.

**Architecture:** two pieces on one hosting account.

| Piece | Runs as | Address |
|---|---|---|
| Frontend (React build) | Static files in the subdomain's document root | `https://inventory.eiretech360.com` |
| Backend (Node/Express) | Node.js app | `https://api.eiretech360.com` |
| Database | **stays on MongoDB Atlas** (Hostinger shared hosting has no MongoDB) | Atlas connection string |

> The app lives on the **`inventory.eiretech360.com`** subdomain (the same
> subdomain the `orders@` mailbox is on). The backend gets its own sibling
> subdomain, `api.eiretech360.com`.

---

## Phase 0 — Pre-flight (do these first)

1. **Atlas network access (critical).** MongoDB Atlas → Network Access → add the
   Hostinger server IP **`153.92.9.187`** (or `0.0.0.0/0` to allow anywhere).
   Without this the backend can't reach the database.

2. **Copy the current secrets.** From the Render dashboard, note the current
   values of `MONGODB_URL`, `SecretKey`, and the `CLOUDINARY_*` vars — you'll
   paste the same values into Hostinger so existing data and image uploads keep
   working. (Keep `SecretKey` identical so it stays valid.)

3. **(Recommended) Server location → Europe.** The plan's server is in Indonesia
   while the shop is in Ireland. In Hosting → Plan details, use the pencil next
   to *Server Location* to move it to Europe for much lower latency. Do this
   before deploying.

4. **DNS note.** The domain's nameservers are GoDaddy (`ns03/ns04.domaincontrol.com`),
   not Hostinger. So the `api` subdomain's DNS record is added **at GoDaddy**, not
   in Hostinger (see Phase 1, step 1).

---

## Phase 1 — Backend as a Node.js app (`api.eiretech360.com`)

1. **Create the subdomain DNS record (at GoDaddy).**
   GoDaddy DNS → add an **A record**: host `api`, value `153.92.9.187`.
   (This points `api.eiretech360.com` at the Hostinger server.)

2. **Create the subdomain in Hostinger.**
   Hostinger → Domains → Subdomains → create `api.eiretech360.com`.

3. **Create the Node app.**
   Hostinger → Websites → (Node.js app / Deployments). Connect the GitHub repo
   and set:
   - **App root:** `backend`
   - **Node version:** 20 or 22
   - **Install command:** `npm install`
   - **Start command:** `npm start`
   - **Attach to:** `api.eiretech360.com`

4. **Set environment variables** (Environment variables section). See the full
   list in [Environment variables](#environment-variables) below. **Do NOT set
   `PORT`** — Hostinger provides it.

5. **Deploy**, then open **Runtime logs**. You want to see:
   - `connected to database successfully`
   - `The server is running at port …`

6. **Smoke test:** open `https://api.eiretech360.com/api/health` →
   `{"status":"ok", ...}`.

---

## Phase 2 — Frontend (static build on the main domain)

1. **Point the build at the new backend.** In `frontend/.env`:
   ```
   REACT_APP_BACKEND_URL=https://api.eiretech360.com
   GENERATE_SOURCEMAP=false
   ```

2. **Build:**
   ```
   cd frontend
   CI=false npm run build
   ```

3. **Upload** everything inside `frontend/build/` into the **document root of the
   `inventory.eiretech360.com` subdomain** (in Hostinger's File Manager this is
   usually a folder like `public_html/inventory/` — check the subdomain's
   "document root" in Domains → Subdomains). Make sure the hidden **`.htaccess`**
   goes up too — it handles React-Router routing, HTTPS, and security headers.

4. **Test:** `https://inventory.eiretech360.com` loads, and you can log in.

---

## Phase 3 — Verify end-to-end

- **Login / roles** work.
- **Image upload** (add a product with an image) — confirms Cloudinary env.
- **Reports** download.
- **Real-time** (notifications/stock updates) — Socket.IO. If websockets are
  restricted on shared hosting it falls back to polling automatically, so it
  still works, just a touch less instant.
- **Email (the whole reason for the move):** sell a product down to its
  threshold → a reorder appears and the shop gets the reminder email → approve
  it → the supplier gets the order email. This is where you confirm SMTP is
  actually sending from Hostinger.

---

## Environment variables

Set these on the **backend** Node app in Hostinger.

**Required**
```
MONGODB_URL         = <your Atlas connection string>
SecretKey           = <your JWT secret>          # exact casing: SecretKey
CORS_ORIGIN         = https://inventory.eiretech360.com
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

## Notes / gotchas

- **`SecretKey` casing matters** — it's read as `process.env.SecretKey`, not
  `SECRETKEY`. Set it exactly.
- **Database stays on Atlas.** Nothing about the data moves; only where the
  server runs changes. Keep the same `MONGODB_URL`.
- **Cross-subdomain auth is fine.** The frontend calls the API with a Bearer
  token (from localStorage) and `withCredentials`; `CORS_ORIGIN` must list the
  frontend domain, which it does above.
- **Email deliverability:** sending will work once SMTP env is set. To keep
  supplier emails out of spam, later add the **SPF/DKIM** records Hostinger
  provides for the mail domain — at GoDaddy, since that's where DNS lives.
- **Keep Render/Vercel up until Hostinger is verified**, then switch off. Rolling
  back is just pointing `REACT_APP_BACKEND_URL` back and redeploying.
