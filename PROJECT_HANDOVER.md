# Eire Tech 360 Inventory System Handover Notes

Last updated: 2026-07-11

This file is a quick reference for the current live setup, deployment flow, domain/DNS configuration, and important project notes.

## Live Setup

Inventory system frontend:

```txt
https://inventory.eiretech360.com
```

Backend API:

```txt
https://inventory-system-tq63.onrender.com
```

Old/default Vercel app URL:

```txt
https://inventory-system-iota-eosin.vercel.app
```

Main domain:

```txt
https://eiretech360.com
https://www.eiretech360.com
```

The main domain is intended for another website. The inventory system should stay on the subdomain:

```txt
inventory.eiretech360.com
```

## Hosting

Frontend:

```txt
Vercel project: inventory-system
Production domain: inventory.eiretech360.com
```

Backend:

```txt
Render service
API base URL: https://inventory-system-tq63.onrender.com
```

Database:

```txt
MongoDB via backend MONGODB_URL / MONGO_URI
```

Images:

```txt
Cloudinary
```

## GoDaddy DNS

Keep this DNS record for the inventory system:

```txt
Type: CNAME
Name: inventory
Value: 23c0fa9bfa36fb1a.vercel-dns-017.com
TTL: 1 Hour
```

Important:

```txt
Do not delete the inventory CNAME when moving eiretech360.com to another website.
```

The root and www records can point to the new main website:

```txt
@   -> new main website target
www -> new main website target
```

If the new main website is also on Vercel, the root/www records may remain Vercel records, but the domains must be removed from the inventory Vercel project and added to the new Vercel project.

## Render Environment Variables

Final clean CORS setup for inventory only:

```env
CORS_ORIGIN=https://inventory.eiretech360.com
```
This is correct even though the frontend is on Vercel and backend is on Render. CORS allows the frontend origin, not the backend URL.

Backend URL used by frontend:

```env
REACT_APP_BACKEND_URL=https://inventory-system-tq63.onrender.com
```

Other backend env vars expected by the app include:

```env
MONGODB_URL=...
SecretKey=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
NODE_ENV=production
```

Some code also supports alternate Cloudinary names:

```env
CLOUD_NAME=...
API_KEY=...
API_SECRET=...
```

## Frontend Environment Variables

In Vercel frontend project:

```env
REACT_APP_BACKEND_URL=https://inventory-system-tq63.onrender.com
```

After changing this value, redeploy the frontend. React env vars are baked into the build.

## Git Repository

Main working repository:

```txt
https://github.com/rehman22222/Inventory-system.git
```

Remote name in local repo:

```txt
rehman
```

Push command:

```bash
git push rehman main
```

If Vercel blocks a deployment because of commit author identity, set the Git author to the GitHub/Vercel user and amend:

```bash
git config user.name "rehman22222"
git config user.email "rana.69648@iqra.edu.pk"
git commit --amend --reset-author --no-edit
git push rehman main --force-with-lease
```

Reason: Vercel Hobby plan can block deployments from private repos if the commit author is not recognized as a project contributor.

## Important Deployment Notes

After pushing frontend/backend changes:

```txt
Vercel should auto-deploy frontend.
Render should auto-deploy backend if Auto Deploy is enabled.
```

If the live site does not update:

```txt
Vercel -> inventory-system -> Deployments
Render -> backend service -> Events / Logs
```

Hard refresh browser after frontend deploy:

```txt
Ctrl + Shift + R
```

## Data Status

Business/demo data was cleared before client use:

```txt
Products
Categories
Suppliers
Orders
Sales
Stock transactions
Notifications
Activity logs
Inventory records
```

Login users were kept so the app remains accessible.

Local backup before clearing data:

```txt
backend/data/backups/before-client-clear-2026-07-09T16-51-22-693Z.json
```

Do not commit real client data or production secrets.

## Team Users

The dashboard "Team users" count means app users in MongoDB, not Vercel team members.

Known users previously found:

```txt
Administrator   admin@e360.app      admin
Store Manager   manager@e360.app    manager
Store Staff     staff@e360.app      staff
Demo Admin      admin@example.com   admin
Demo Manager    manager@example.com manager
Demo Staff      staff@example.com   staff
```

For a cleaner client demo, keep only the intended accounts and remove old demo users if needed.

## Key App Features

Roles:

```txt
admin
manager
staff
```

Main modules:

```txt
Dashboard
Products
Categories
Suppliers
Sales
Orders
Stock transactions
POS
Notifications
Activity logs
Reports
Profile
Users
```

Staff can update order status from:

```txt
Staff Dashboard -> Orders -> Edit -> Status
```

Order statuses:

```txt
pending
shipped
delivered
```

"Open Orders" means orders still in progress, such as pending or shipped orders that are not fully delivered/closed.

## Important Code Paths

Backend entry:

```txt
backend/server.js
```

Frontend router:

```txt
frontend/src/App.jsx
```

Axios API base:

```txt
frontend/src/lib/axios.js
```

Redux store:

```txt
frontend/src/store/store.js
```

Product backend:

```txt
backend/controller/productController.js
backend/Routers/ProductRouter.js
backend/models/Productmodel.js
```

Category backend:

```txt
backend/controller/categorycontroller.js
backend/Routers/categoryRouter.js
backend/models/ Categorymodel.js
```

Order backend:

```txt
backend/controller/orderController.js
backend/Routers/orderRouter.js
backend/models/Ordermodel.js
```

Auth backend:

```txt
backend/controller/authcontroller.js
backend/middleware/Authmiddleware.js
backend/libs/Tokengenerator.js
```

Local demo storage mode:

```txt
backend/localStorageRouter.js
backend/data/local-store.json
```

## Naming Gotchas

Some names are misspelled but used as existing contracts. Do not rename casually:

```txt
Desciption
StockTranscationmodel
authRouther
FormattedTime .js
backend/models/ Categorymodel.js
```

Changing these without a full refactor may break the app.

## Recent Fixes

Commit:

```txt
6da0992 fix empty inventory create flows
```

Why it was needed:

```txt
After clearing data, empty product/category/order APIs returned 404.
Frontend sometimes showed "Category add unsuccessful" even when the backend saved the category.
```

Fix included:

```txt
Products/categories/orders return empty arrays instead of 404 when empty.
Product/category Redux state starts as [] instead of null.
Blank barcode is ignored instead of saved as a duplicate value.
Removed noisy "Products fetched successfully" toast.
Fixed product search field from Description to Desciption.
```

## Barcode Behavior

Barcode is unique when provided.

If a product already has:

```txt
barcode: 12346789
```

Then another product with the same barcode will correctly fail:

```txt
A product with this barcode already exists
```

Blank barcode should not be saved after the recent fix.

## Client Testing Checklist

After any deployment or domain change, test:

```txt
Open https://inventory.eiretech360.com
Login as admin/manager/staff
Dashboard loads
Create category
Create product
Search product
Edit product
Create order
Update order status
Create sale or POS checkout
Check low stock/notifications
Download report if needed
Logout and login again
```

If login or API calls fail, check:

```txt
Render CORS_ORIGIN
Vercel REACT_APP_BACKEND_URL
Render backend logs
Vercel latest deployment
Browser console network tab
```

## Domain Migration Checklist

When moving the main website to eiretech360.com:

1. Confirm inventory works:

```txt
https://inventory.eiretech360.com
```

2. Keep GoDaddy DNS:

```txt
CNAME inventory -> 23c0fa9bfa36fb1a.vercel-dns-017.com
```

3. Remove these domains from inventory Vercel project:

```txt
eiretech360.com
www.eiretech360.com
```

4. Add these domains to the new main website project:

```txt
eiretech360.com
www.eiretech360.com
```

5. Point root/www DNS to the new main website provider.

6. Keep Render CORS clean:

```env
CORS_ORIGIN=https://inventory.eiretech360.com
```
