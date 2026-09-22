require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const namesRouter = require("./src/routes/names");
const ordersRouter = require("./src/routes/orders");
const paymentsRouter = require("./src/routes/payments");
const adminRouter = require("./src/routes/admin");
const { requireAdminAuth } = require("./src/admin-auth");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));

// The Paystack webhook needs the exact raw request bytes to verify its
// signature, so it must be mounted with express.raw() BEFORE express.json()
// touches the body. Every other route gets normal JSON parsing.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, service: "cr-frames-backend" }));

app.use("/api/names", namesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/payments", paymentsRouter);

// Admin dashboard + its API — protected by HTTP Basic Auth (see admin-auth.js).
// Set ADMIN_USERNAME/ADMIN_PASSWORD in your environment to enable it.
app.use("/api/admin", requireAdminAuth, adminRouter);
app.use("/admin", requireAdminAuth, express.static(path.join(__dirname, "admin")));

// Serve the storefront directly from this same server, so visiting
// http://localhost:4000 shows the actual app instead of a 404.
// The frontend lives in a sibling folder (../frontend) — this serves
// index.html at "/" and any other static assets placed in that folder.
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// Anything under /api that didn't match a route above -> JSON 404.
// Anything else that isn't a static file -> also JSON 404 (this app has
// a single page, so there's no client-side routing to fall back for).
app.use((req, res) => res.status(404).json({ error: "not_found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, () => {
  console.log(`CR-Frames backend running on http://localhost:${PORT}`);
  console.log(
    process.env.PAYSTACK_SECRET_KEY
      ? "Payments: LIVE mode (Paystack key detected)"
      : "Payments: DEV/MOCK mode (no PAYSTACK_SECRET_KEY set — orders auto-confirm)"
  );
  console.log(
    process.env.ADMIN_PASSWORD
      ? `Admin dashboard: enabled at /admin`
      : "Admin dashboard: disabled (set ADMIN_PASSWORD to enable)"
  );
  console.log(
    process.env.SMTP_HOST && process.env.ADMIN_NOTIFY_EMAIL
      ? "Order notifications: emailing " + process.env.ADMIN_NOTIFY_EMAIL
      : "Order notifications: DEV mode (logged to console — set SMTP_HOST + ADMIN_NOTIFY_EMAIL to enable email)"
  );
});
