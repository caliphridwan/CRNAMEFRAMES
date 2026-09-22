const express = require("express");
const { getAllOrders, updateOrderByReference } = require("../db");

const router = express.Router();

// Full lifecycle an admin can move an order through by hand, beyond the
// payment-driven pending_payment/paid/failed states.
const ALLOWED_STATUSES = ["pending_payment", "paid", "in_production", "shipped", "completed", "failed"];

// GET /api/admin/orders — every order, most recent first
router.get("/orders", (req, res) => {
  res.json({ orders: getAllOrders() });
});

// PATCH /api/admin/orders/:reference — update fulfillment status
router.patch("/orders/:reference", (req, res) => {
  const { status } = req.body || {};
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: "invalid_status", allowed: ALLOWED_STATUSES });
  }
  const updated = updateOrderByReference(req.params.reference, { status });
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json({ order: updated });
});

module.exports = router;
