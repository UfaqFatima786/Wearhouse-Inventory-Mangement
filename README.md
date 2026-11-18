# Stockroom — Inventory & Warehouse Management

A MERN inventory application with a separately installable React frontend and Express/MongoDB backend. The implementation covers the hackathon's required workflows and all seven bonus challenges.

## Project layout

```text
backend/   Express API, Mongoose models, authentication, inventory workflows
frontend/  React + Vite dashboard
```

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- MongoDB Atlas or a local MongoDB **replica set** (inventory and order updates use MongoDB transactions)
- An ImageKit account for profile/product image uploads
- SMTP credentials to send low-stock notification emails (optional)

## Run locally (Windows PowerShell)

1. Start a MongoDB replica-set deployment and create the database user/database.
2. Configure the API:

   ```powershell
   cd backend
   Copy-Item .env.example .env
   # Edit .env: set MONGODB_URI and a long random JWT_SECRET.
   # Add ImageKit credentials for image upload; add SMTP credentials for email alerts.
   npm install
   npm run seed:admin
   npm run dev
   ```

   The API listens at `http://localhost:5000`. The initial administrator uses the values in `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. Change the example password before seeding.

3. In a separate PowerShell window, configure and start the frontend:

   ```powershell
   cd frontend
   Copy-Item .env.example .env
   # Set VITE_API_URL if the API is not at http://localhost:5000/api.
   npm install
   npm run dev
   ```

   Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

## Roles

- **Admin:** manage accounts and roles, warehouses, products, orders, stock, supply approvals, and the activity log.
- **Warehouse manager:** work only with assigned warehouses; receive, remove, and transfer stock; process orders and review supplier requests for assigned locations.
- **Supplier:** manage their profile, see their own products and requests, and submit supply requests. Approving a request adds stock and creates a stock-in transaction.
- **Sales representative:** search/filter products and stock, create orders, view only their orders, and cancel only pending orders.

Public registration creates a sales-representative account. Admin accounts and other roles are provisioned by an administrator or the bootstrap script.

## Included workflows and bonus features

- JWT authentication, bcrypt password hashing, server-side role checks, and protected APIs.
- Product and warehouse CRUD, supplier association, manager assignment, and ImageKit uploads for product images and profile photos.
- Warehouse-specific inventory, atomic stock-in/stock-out, low-stock alerts, and a transaction history.
- Sales orders priced from server-side product records, server-side stock validation, one-time stock deduction at `Pending → Processing`, completion and pending-order cancellation.
- Supplier profiles, supply requests, review states, and receiving stock on approval.
- **Stock transfers** record matching outgoing/incoming transactions in one database transaction.
- **Downloadable PDF invoices** for completed orders.
- **Advanced product filters** for category, supplier, warehouse, availability, plus free-text name/category/SKU search.
- **Charts** for monthly sales, stock movement, and top-selling products.
- **Barcode/SKU lookup:** type or scan supported camera barcodes to search a product SKU. Camera access requires HTTPS or localhost and user permission.
- **Activity log** showing who performed audited operations.
- **Admin low-stock email notifications** with an optional SMTP configuration; alerts are sent once on entering the low-stock state and re-armed after replenishment above the limit.

## Environment configuration

Copy the example files and provide secrets locally:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.example` → `frontend/.env`

ImageKit's private key is used only by the API. The browser requests short-lived upload authentication from `/api/upload/auth`; the API verifies uploaded file IDs before saving images to records. SMTP settings are optional; without SMTP, the API logs that an alert could not be emailed.

## API overview

All endpoints are under `/api`; protected calls use `Authorization: Bearer <token>`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Users | `GET/POST /users`, `PUT/DELETE /users/:id`, `GET /users/activity` |
| Products | `GET/POST /products`, `GET/PUT/DELETE /products/:id` |
| Warehouses | `GET/POST /warehouses`, `PUT/DELETE /warehouses/:id` |
| Stock | `GET /stock`, `GET /stock/low`, `POST /stock/in`, `POST /stock/out`, `POST /stock/transfer` |
| Transactions | `GET /transactions` |
| Orders | `GET/POST /orders`, `GET /orders/:id`, `PUT /orders/:id/status`, `PUT /orders/:id/cancel` |
| Supplier | `GET/POST /supply-requests`, `PUT /supply-requests/:id/status` |
| Upload | `GET /upload/auth` |
| Analytics | `GET /analytics/dashboard` |
| Health | `GET /health` |

## Security and data notes

- Never commit `.env` files, API keys, database credentials, or `node_modules`.
- The API does not accept a public registration role or client-supplied order prices.
- Managers are restricted to assigned warehouses; supplier products/requests and sales-representative orders are scoped on the server.
- Stock changes, transfers, and order processing are protected by conditional stock updates and MongoDB transactions. Use a replica set (including MongoDB Atlas) for local and deployed environments.
- The initial admin seeder is idempotent and does not reset an existing account's password.
