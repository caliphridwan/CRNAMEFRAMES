const express = require("express");
const crypto = require("crypto");
const { saveOrder, getOrderByReference } = require("../db");
const { notifyAdmin } = require("../notify");
const { formatOrderText } = require("../order-format");
const { PRICE_PER_NAME, computeSubtotal, computeTotal } = require("../pricing");

const router = express.Router();
const FRAME_COLORS = ["white", "gold", "black", "brown", "green"];

function generateReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CRF-${stamp}-${rand}`;
}

function normalizeColor(color) {
  return FRAME_COLORS.includes(color) ? color : "white";
}

function validateOrderPayload(body) {
  const errors = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("Order must include at least one name.");
  } else {
    // Arabic script and meaning are both optional — only the name itself
    // is required. A missing Arabic script is filled with a "✦" placeholder
    // below, which flags in the order record that it still needs sourcing
    // before this one goes to print.
    body.items.forEach((item, i) => {
      if (!item.name || !String(item.name).trim()) errors.push(`Item ${i + 1} is missing a name.`);
    });
  }
  const c = body.customer || {};
  if (!c.fullName || !c.fullName.trim()) errors.push("Full name is required.");
  if (!c.phone || !c.phone.trim()) errors.push("Phone number is required.");
  if (!c.address || !c.address.trim()) errors.push("Delivery address is required.");
  if (!c.city || !c.city.trim()) errors.push("City/state is required.");
  if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) errors.push("Email address looks invalid.");
  return errors;
}

// POST /api/orders — create a pending order from the cart
router.post("/", (req, res) => {
  const errors = validateOrderPayload(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: "invalid_order", messages: errors });
  }

  const items = req.body.items.map((item) => ({
    name: String(item.name).trim(),
    arabic: item.arabic ? String(item.arabic) : "✦",
    meaning: item.meaning ? String(item.meaning).trim() : "",
    style: item.style === "arabic_only" ? "arabic_only" : "arabic_and_meaning",
    color: normalizeColor(item.color),
    price: PRICE_PER_NAME,
  }));

  const subtotal = computeSubtotal(items.length);
  const totalAmount = computeTotal(items.length);

  const order = {
    id: crypto.randomUUID(),
    reference: generateReference(),
    items,
    subtotal,
    discount: subtotal - totalAmount,
    totalAmount,
    currency: "NGN",
    customer: {
      fullName: req.body.customer.fullName.trim(),
      phone: req.body.customer.phone.trim(),
      email: (req.body.customer.email || "").trim(),
      address: req.body.customer.address.trim(),
      city: req.body.customer.city.trim(),
    },
    status: "pending_payment", // pending_payment -> paid -> failed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveOrder(order);
  notifyAdmin(`New order placed — ${order.reference}`, formatOrderText(order)).catch(() => {});
  res.status(201).json({ order });
});

// GET /api/orders/:reference — fetch an order's current status
router.get("/:reference", (req, res) => {
  const order = getOrderByReference(req.params.reference);
  if (!order) return res.status(404).json({ error: "not_found" });
  res.json({ order });
});

module.exports = router;
