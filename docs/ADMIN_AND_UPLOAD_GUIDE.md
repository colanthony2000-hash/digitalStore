# Jeneconk Digital Store — Administrator & Product Upload Guide

## 1. Accessing the Admin Dashboard
1. Click **Sign In** in the navigation bar (or visit `/account`).
2. Sign in with an authorised administrator Google account (such as `jeneconklms@gmail.com`).
3. Click **Admin** in the top navigation bar or open `/admin`.

## 2. Configuring Existing Selar Products (Life Reset & Christmas Planner)
1. Open **Admin → Products**.
2. Click **Edit** beside **Life Reset** or **Christmas Planner**.
3. Enter your verified **Selar External Checkout URL** (e.g., `https://selar.co/...`).
4. Enter exact **Price (NGN)** and **Price (USD)** values.
5. Click **Save Product**. The product's **Buy Now on Selar** button and pricing update immediately across the storefront without editing source code.

## 3. Adding New Digital Products & Uploading Files
1. Click **Add Digital Product**.
2. Complete product title, URL slug, department, short benefit statement, full description, contents list, key benefits, and intended audience.
3. Upload a vertical `3:4` cover image under **Cover Image URL or Upload** (stored in `storage/public_uploads/`).
4. Save the product, then click **Edit** to upload the protected downloadable master asset (PDF, XLSX, DOCX, PPTX, or ZIP) under **Protected Downloadable Asset** (stored securely in `storage/protected_products/`).

## 4. Managing Departments, Bundles, Discounts & Support
- **Departments**: Edit or add product departments and subtopics under **Admin → Departments**.
- **Bundles**: Group multiple products into bundles with custom NGN/USD pricing under **Admin → Bundles**.
- **Marketing & Support**: Create discount codes, review newsletter subscribers, and update customer support enquiry statuses (`open`, `in_progress`, `resolved`) under **Admin → Marketing & Support**.
