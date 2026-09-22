const express = require("express");
const crypto = require("crypto");
const { getOrderByReference, updateOrderByReference } = require("../db");
const { notifyAdmin } = require("../notify");
const { formatOrderText } = require("../order-format");

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:4000";
// Defaults to the backend's own address: the backend now serves the
// frontend directly (see server.js), so in local dev they're the same origin.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4000";
const PAYSTACK_API = "https://api.paystack.co";

function isLiveMode() {
  return Boolean(PAYSTACK_SECRET_KEY);
}

// POST /api/payments/initialize — start a payment for an order
// Live mode (PAYSTACK_SECRET_KEY set): calls Paystack, returns a hosted
// checkout URL to redirect the browser to.
// Dev/mock mode (no key set): tells the frontend to run the local mock
// flow via POST /api/payments/mock-confirm instead.
router.post("/initialize", async (req, res) => {
  const { reference } = req.body || {};
  if (!reference) return res.status(400).json({ error: "missing_reference" });

  const order = getOrderByReference(reference);
  if (!order) return res.status(404).json({ error: "order_not_found" });
  if (order.status === "paid") return res.status(409).json({ error: "already_paid" });

  if (!isLiveMode()) {
    return res.json({ mock: true, reference: order.reference });
  }

  try {
    const resp = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: order.customer.email || `${order.customer.phone.replace(/\D/g, "")}@crframes.ng`,
        amount: order.totalAmount * 100, // Paystack expects kobo
        reference: order.reference,
        callback_url: `${PUBLIC_BASE_URL}/api/payments/callback`,
        metadata: {
          fullName: order.customer.fullName,
          itemCount: order.items.length,
        },
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.status) {
      return res.status(502).json({ error: "paystack_init_failed", details: data });
    }
    res.json({
      mock: false,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: order.reference,
    });
  } catch (err) {
    res.status(502).json({ error: "paystack_unreachable", message: err.message });
  }
});

// POST /api/payments/mock-confirm — dev-only helper that marks an order paid
// without a real gateway, so the app is fully testable before Paystack keys exist.
router.post("/mock-confirm", (req, res) => {
  if (isLiveMode()) {
    return res.status(403).json({ error: "mock_disabled_in_live_mode" });
  }
  const { reference } = req.body || {};
  const order = getOrderByReference(reference);
  if (!order) return res.status(404).json({ error: "order_not_found" });

  const updated = updateOrderByReference(reference, {
    status: "paid",
    paidAt: new Date().toISOString(),
    paymentMethod: "mock",
  });
  notifyAdmin(`Payment received (test mode) — ${reference}`, formatOrderText(updated)).catch(() => {});
  res.json({ order: updated });
});

// GET /api/payments/callback — Paystack redirects the customer's browser here
// after checkout. We verify server-side, then bounce back to the frontend.
router.get("/callback", async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.redirect(`${FRONTEND_URL}/?status=error`);

  try {
    const verified = await verifyTransaction(reference);
    const status = verified && verified.status === "success" ? "paid" : "failed";
    const updated = updateOrderByReference(reference, {
      status,
      paidAt: status === "paid" ? new Date().toISOString() : null,
      paymentMethod: "paystack",
    });
    if (status === "paid" && updated) {
      notifyAdmin(`Payment received — ${reference}`, formatOrderText(updated)).catch(() => {});
    }
    res.redirect(`${FRONTEND_URL}/?reference=${encodeURIComponent(reference)}&status=${status}`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/?reference=${encodeURIComponent(reference)}&status=error`);
  }
});

// POST /api/payments/webhook — Paystack's server-to-server event notification.
// This is the source of truth for payment status in production (more reliable
// than depending on the customer's browser making it back to /callback).
// Mounted in server.js with express.raw() so we can verify the HMAC signature
// against the exact bytes Paystack sent.
router.post("/webhook", async (req, res) => {
  if (!isLiveMode()) return res.status(200).end(); // nothing to verify in dev mode

  const signature = req.headers["x-paystack-signature"];
  const expected = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(req.body) // raw Buffer, set by express.raw() in server.js
    .digest("hex");

  if (signature !== expected) {
    return res.status(401).send("invalid signature");
  }

  const event = JSON.parse(req.body.toString("utf-8"));
  if (event.event === "charge.success") {
    const reference = event.data.reference;
    const updated = updateOrderByReference(reference, {
      status: "paid",
      paidAt: new Date().toISOString(),
      paymentMethod: "paystack",
    });
    if (updated) {
      notifyAdmin(`Payment received — ${reference}`, formatOrderText(updated)).catch(() => {});
    }
  }
  res.status(200).end();
});

async function verifyTransaction(reference) {
  const resp = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await resp.json();
  if (!resp.ok || !data.status) throw new Error("verification_failed");
  return data.data; // { status: 'success' | 'failed' | ..., ... }
}

module.exports = router;
