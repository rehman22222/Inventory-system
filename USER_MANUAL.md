# E360 Inventory Suite — User Manual

A complete guide to running your shop on the E360 Inventory Suite: stock, point of sale, suppliers, reports, and day‑to‑day operations.

> **Who this is for:** shop owners, managers, and till staff. No technical knowledge is assumed. Where a step is limited to a particular role, it is marked like this: **(Owner only)**.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Roles & What Each Can Do](#2-roles--what-each-can-do)
3. [Signing In](#3-signing-in)
4. [The Dashboard](#4-the-dashboard)
5. [Products](#5-products)
6. [Categories](#6-categories)
7. [Suppliers](#7-suppliers)
8. [Stock Transactions](#8-stock-transactions)
9. [Point of Sale (POS Terminal)](#9-point-of-sale-pos-terminal)
10. [Sales](#10-sales)
11. [Orders](#11-orders)
12. [Vouchers](#12-vouchers)
13. [Day Closings](#13-day-closings)
14. [Reports](#14-reports)
15. [Store Settings](#15-store-settings)
16. [Approvals](#16-approvals)
17. [Activity Log](#17-activity-log)
18. [Ghost Mode](#18-ghost-mode-owner-only)
19. [User Management](#19-user-management)
20. [Notifications](#20-notifications)
21. [Support Tickets](#21-support-tickets)
22. [Language & Region](#22-language--region)
23. [Security & Privacy](#23-security--privacy)
24. [Troubleshooting & FAQ](#24-troubleshooting--faq)

---

## 1. Overview

E360 Inventory Suite is a single system that combines:

- **Live stock control** — every sale, refund, transfer, and delivery updates your counts instantly.
- **A built‑in Point of Sale (POS)** — scan, charge (cash / card / wallet / split), print a receipt, and stock drops automatically.
- **Role‑based access** — the owner, managers, and staff each see exactly their own scope and nothing more.
- **Reports** — sales, inventory valuation, activity, and day‑closing figures exported as Excel, PDF, or CSV.
- **A full audit trail** — who changed what, when, and from which device.

Each installation runs **one shop**. All money figures use the currency you set, and all dates are handled in your shop's timezone (see [Store Settings](#15-store-settings) and [Language & Region](#22-language--region)).

---

## 2. Roles & What Each Can Do

There are four roles, in order of authority:

| Role | Purpose | Typical user |
|---|---|---|
| **Superadmin (Owner)** | Full control of the whole system, plus owner‑only tools (Ghost Mode, Store settings, Approvals, direct user management). | Business owner |
| **Admin** | Runs day‑to‑day operations; some sensitive actions require the owner's approval. | Shop manager / senior staff |
| **Manager** | Inventory, sales, suppliers, orders, and the till. | Floor manager |
| **Staff** | Works the till only. | Cashier |

**Navigation available to each role:**

- **Superadmin:** Dashboard, Ghost Mode, POS, Products, Categories, Suppliers, Sales, Day Closings, Orders, Vouchers, Stock, Notifications, Approvals, Users, Tickets, Activity Log, Store.
- **Admin:** Dashboard, POS, Products, Categories, Suppliers, Sales, Day Closings, Orders, Vouchers, Stock, Notifications, Users, My Requests, Activity Log, Support.
- **Manager:** Dashboard, POS, Products, Categories, Suppliers, Sales, Orders, Vouchers, Stock, Notifications.
- **Staff:** Dashboard, POS.

> **Server‑enforced:** access is enforced on the server for every action, not just hidden in the menu. A user cannot reach a restricted feature by guessing a link.

---

## 3. Signing In

1. Open the application URL in your browser.
2. Enter your **email** and **password**.
3. Select **Sign in**.

You land on the **Dashboard** for your role. To sign out, use **Logout** at the bottom of the left sidebar.

> **Forgot access / locked out:** for security, the login page limits repeated failed attempts. If you are blocked, wait a few minutes and try again, or ask the owner to reset your account.

---

## 4. The Dashboard

The Dashboard is your home screen. Depending on your role it shows headline figures such as **Total Products**, **Total Store Value**, sales graphs, and recent activity. Use the left sidebar to move between sections.

---

## 5. Products

**Where:** Sidebar → **Products**. **Roles:** Superadmin, Admin, Manager.

### 5.1 Add a product

1. Select **+ Add** (top right).
2. A panel slides in from the right. Everything fits on one screen — no scrolling needed to reach the button.
3. Fill in the fields:
   - **Name** *(required)*
   - **Category**, **Shelf label** (e.g. `A12`)
   - **Selling Price** *(required)*, **Cost Price** (used for profit tracking)
   - **Quantity** (opening stock), **Low‑stock threshold** (default 10)
   - **Barcode** (scan or type), **Expiry Date**
   - **Description**, and an optional **product image**
4. Select **Add Product**. The item appears in the list and its stock value is included immediately.

### 5.2 Edit a product

Select **Edit** on any row, change the fields in the same panel, and select **Update Product**.

### 5.3 Search

Use the **Search products…** box to find items by name or barcode.

### 5.4 Random Products (generic items with no barcode)

For loose or generic items that have no manufacturer barcode, you can generate a batch of price‑point products under the permanent **Random** category.

1. Select **Random** (Random Products).
2. Enter:
   - **How many?** — the number of items to create (1–500).
   - **Stock qty (each)** — the opening stock for **every** generated item (0–1,000,000). *This lets you control exactly how much stock enters inventory — it is not unlimited.*
   - **Price tiers** — comma‑separated prices (e.g. `5, 10, 15`); the count is split evenly across them.
3. Select **Generate**. You can then **Print** the barcode labels on an A4 sheet.

> Scanning a printed price‑point label at the till rings up that price.

---

## 6. Categories

**Where:** Sidebar → **Categories**. **Roles:** Superadmin, Admin, Manager.

1. Select **+ Add**.
2. Enter a **Name** *(required)* and optional **Description**.
3. Select **Add Category** (or **Update Category** when editing).

Categories organise your catalogue and appear as tiles on the POS.

---

## 7. Suppliers

**Where:** Sidebar → **Suppliers**. **Roles:** Superadmin, Admin, Manager.

### 7.1 Add a supplier

1. Select **+ Add**.
2. Fill in **Name**, **Phone**, **Email**, **Address**.
3. Under **Products supplied**, use the **search box** to find products and **tick** everything this supplier provides. You can select **multiple** products, and the badge shows how many are selected.
   - A product has exactly one supplier, so ticking a product here moves it from any other supplier.
4. Select **Add Supplier**.

> **Approval note:** only the owner can add a supplier outright. When a manager or admin adds one, the request is **sent to the owner for approval** (you will see this stated in the form and it appears in [Approvals](#16-approvals) / **My Requests**).

### 7.2 Edit a supplier

Select **Edit** on a row; the form pre‑ticks the products already assigned to that supplier so you can adjust the list.

---

## 8. Stock Transactions

**Where:** Sidebar → **Stock**. **Roles:** Superadmin, Admin, Manager.

Record stock movements that are not sales — for example, receiving a delivery or writing off damaged goods.

1. Select **+ Add**.
2. Choose the **Product**, the **Type** (**Stock‑in** or **Stock‑out**), the **Quantity**, and the **Supplier** (for stock‑in).
3. Select **Add Stock**. The product's on‑hand count updates and the movement is logged.

---

## 9. Point of Sale (POS Terminal)

**Where:** Sidebar → **POS** (opens as a full‑screen terminal). **Roles:** all roles.

The POS is a three‑column terminal designed for a touch screen:

- **Left rail** — action buttons (Refund, Void Sale, Suspend, Resume, Product Search, Discount, Vouchers, Sale History, Enter Code).
- **Middle** — the current sale (line items, quantities, running totals).
- **Right** — category tiles, the product grid for the selected category, and an on‑screen numeric keypad.

### 9.1 Ring up a sale

1. **Scan** a barcode, **tap** a product tile, or use **Product Search**.
2. Adjust quantities with the **+ / −** controls on each line (or use the keypad).
3. Review **Subtotal**, any **Discount**, **Voucher**, **Tax**, and **Total**.
4. Select **Close Order** to take payment.

### 9.2 Take payment

Choose a payment method — **Cash**, **Card**, **Wallet** (digital tenders), or **Split** (more than one method on one receipt). For cash, enter the amount tendered and the change due is calculated. A receipt is produced and stock is decremented automatically.

### 9.3 Discounts and vouchers

- **Discount** — apply a fixed amount or a percentage to the sale.
- **Vouchers** — enter a voucher code; the system validates it (active, not expired, minimum spend met) and applies the value. See [Vouchers](#12-vouchers).

### 9.4 Suspend & resume

- **Suspend** parks the current basket so you can serve another customer. Suspended sales are stored on the server, so a sale parked on one till can be **resumed on another**.
- **Resume** brings a parked sale back.

### 9.5 Refunds & voids

- **Refund** — look up a receipt, choose full or per‑line/partial quantities, add a reason, and confirm. Stock is returned and the refund is recorded.
- **Void Sale** — reverses a whole receipt (with a reason).

### 9.6 Unknown barcode ("learn on scan")

If you scan a barcode the system doesn't recognise, a prompt lets you resolve it on the spot:

- **Link to existing product** — search for the item and attach the scanned code to it. The next scan of that code goes straight into the basket.
- **Create new product** — enter name, price, category, and opening stock; the item is created with that barcode.

This is how missing barcodes get filled in during normal trading. Available to all till roles.

### 9.7 Closing your till (Day Closing)

At the end of a shift, close your day to hand over takings. This produces a **Day Closing** batch (see [Day Closings](#13-day-closings)) summarising your sales, discounts, tax, refunds, and the breakdown by payment method. Once closed, those sales move to the owner's side.

---

## 10. Sales

**Where:** Sidebar → **Sales**. **Roles:** Superadmin, Admin, Manager, Staff (staff see their own).

Browse and search past sales. You can filter by a **From / To** date range and **download a Sales Report** (see [Reports](#14-reports)). Managers can also record a manual sale via **+ Add Sales** (customer name, product, price, quantity, payment method and status).

---

## 11. Orders

**Where:** Sidebar → **Orders**. **Roles:** Superadmin, Admin, Manager.

Create purchase/customer orders as a basket of lines:

1. Select **+ Add**.
2. Add a **Description**, then add products to the order (pick a product, set quantity, **Add product to order**). The order total updates as you add lines.
3. Set a **Status** (pending / shipped / delivered) and select **Add Order**.

---

## 12. Vouchers

**Where:** Sidebar → **Vouchers**. **Roles:** Superadmin, Admin, Manager (create/manage); the till validates and redeems them.

Create discount codes for customers:

- **Code**, **Type** (fixed amount or percent), **Value**.
- Optional **minimum spend**, **expiry date**, and **usage limit**.

At the till, a code is checked in real time and redeemed as part of the sale, so it cannot be double‑spent by two tills at once. You can **disable** a voucher at any time.

---

## 13. Day Closings

**Where:** Sidebar → **Day Closings**. **Roles:** Superadmin, Admin.

Each till close produces a batch record you can review and print. A batch shows:

- Reference, cashier, opened/closed times.
- Sales count, gross, discounts, tax, refunded, and **net handed over**.
- The **breakdown by payment method** — the figure you reconcile the drawer against.

Download any batch as a report (see below).

---

## 14. Reports

**Where:** most reports are reached from a **Download Report** button on the relevant page (e.g. Sales), or the Reports area.

Available report types and who can run them:

| Report | Superadmin | Admin | Manager | Staff |
|---|:--:|:--:|:--:|:--:|
| **Sales** (with profit/loss) | ✅ | ✅ | ✅ | ✅ (own) |
| **Inventory & Valuation** | ✅ | ✅ | ✅ | — |
| **Activity Log** | ✅ | ✅* | — | — |
| **Day Closing** | ✅ | ✅ | — | — |
| **Adjusted Net Sales** (Ghost) | ✅ | — | — | — |

\* Admin access to the Activity Log report requires a live, owner‑granted window (see [Activity Log](#17-activity-log)).

**How to download:**

1. Choose a **From / To** date range where offered (leave blank for all time).
2. Select **Download Report** and pick a format — **Excel (.xlsx)**, **PDF**, or **CSV**.

Every report carries your shop's letterhead (name, address, phone), states the **currency** and **timezone** it was generated in, and stamps who ran it and when. Date filters use **whole days in your shop's timezone**, so figures line up with your trading days regardless of where the server is.

---

## 15. Store Settings

**Where:** Sidebar → **Store**. **(Owner only)**

Set the details that appear on receipts and reports, and how time is handled:

- **Store name**, **address**, **phone**.
- **Currency** — printed beside every amount on your reports and receipts.
- **Timezone** — reports and date filters use whole days in this timezone (so a 1 a.m. local sale lands on the correct local day).
- **Footer** message and **QR template** for receipts.

A live receipt preview shows your changes before you save. **Save** applies everywhere — every till and receipt picks it up on its next load.

---

## 16. Approvals

**Where:** Sidebar → **Approvals** (owner) / **My Requests** (admin).

Some actions are sensitive enough that only the owner may complete them. When an admin or manager attempts one, a **request** is raised for the owner to approve or reject. Request types include:

- Create a user (manager/staff)
- Delete a user
- Create a supplier
- Create a deal
- View the activity log for a date range

The owner sees all pending requests in **Approvals**; the requester tracks the outcome in **My Requests**. Approving runs the action with the owner as the authoriser.

---

## 17. Activity Log

**Where:** Sidebar → **Activity Log**.

A complete audit trail: who did what, when, from which device (IP), with a timestamp in your shop's timezone.

- **Superadmin (Owner):** full, unrestricted access, and can print.
- **Admin:** access is **granted for a specific date range**. Request access by choosing a **From / To** window; once the owner approves, you see only that window and can print it. The grant is time‑boxed and expires, after which you request again.

---

## 18. Ghost Mode **(Owner only)**

**Where:** Sidebar → **Ghost Mode**.

A private, owner‑only view of every sale in the shop — all cashiers, all days, including batches already handed over. Use it to review totals across the whole business and to run the owner‑only **Adjusted Net Sales** report. Filter by cashier, date range, and status.

---

## 19. User Management

**Where:** Sidebar → **Users**. **Roles:** Superadmin (direct), Admin (via approval).

- **Superadmin** creates and removes users directly and assigns roles.
- **Admin** can request new manager/staff accounts, which the owner approves.

Give each person the **lowest role** that lets them do their job.

---

## 20. Notifications

**Where:** Sidebar → **Notifications**.

The system raises notifications for events such as **low stock**, so you can reorder before you run out. Notifications appear in real time across open sessions.

---

## 21. Support Tickets

**Where:** Sidebar → **Support** (admin) / **Tickets** (owner inbox).

Raise a support request and track its status. The owner sees incoming tickets in the **Tickets** inbox.

---

## 22. Language & Region

- **Languages:** the interface is available in **English, Urdu, Hindi, Bengali, Arabic, and Irish**. Use the language switcher (top of the screen). Arabic and Urdu display right‑to‑left automatically.
- **On‑screen times** are shown in your browser's local time.
- **Reports and date filters** use your shop's configured **timezone** (see [Store Settings](#15-store-settings)), so the same system serves shops in different countries correctly.

---

## 23. Security & Privacy

- Access is enforced on the **server** for every action — menus are not the only guard.
- Sign‑in has **rate‑limiting** to slow password‑guessing.
- The application sends standard **security headers** and does not expose its source code in browser developer tools.
- The full **activity log** records changes with user, time, and IP, and cannot be altered after the fact.
- **Best practice:** each person has their own account; never share logins; sign out on shared tills.

---

## 24. Troubleshooting & FAQ

**The product list is empty when adding a supplier.**
The catalogue loads automatically when you open the page. If it looks empty, refresh once; the search matches by product **name or barcode**.

**A report says "You do not have access to this report."**
That report is not available to your role. Check the table in [Reports](#14-reports); ask the owner if you need access.

**Admin can't download the Activity Log.**
Admins need a live, owner‑granted date window. Request access from the Activity Log page and wait for approval; the grant expires after its window, so you may need to request again.

**A scanned barcode isn't recognised.**
Use the on‑screen prompt to **link** the code to an existing product or **create** a new one — the code is remembered for next time.

**Report dates seem off by a day.**
Confirm the **timezone** in **Store Settings** matches your shop's location. Reports use whole days in that timezone.

**Too many requests / temporarily blocked at login.**
This is the rate‑limit protecting your account. Wait a few minutes and try again.

**The add/edit panel used to require scrolling.**
Add and edit panels now fit on one screen with the action button always visible. If a panel still feels cramped, maximise the browser window.

---

*E360 Inventory Suite · built by Eiretech. This manual describes standard behaviour; exact menus depend on your role.*
