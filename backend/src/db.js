// Minimal file-backed store for orders.
//
// This keeps the demo dependency-free (no database server required).
// For real production use, swap readDB/writeDB for calls to Postgres,
// MySQL, or MongoDB — every function below is a natural seam to do that,
// since nothing outside this file touches the storage format directly.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function ensureDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ orders: [] }, null, 2));
  }
}

function readDB() {
  ensureDB();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { orders: [] };
  }
}

function writeDB(data) {
  ensureDB();
  // write to a temp file then rename, so a crash mid-write can't corrupt db.json
  const tmpPath = DB_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

function saveOrder(order) {
  const data = readDB();
  data.orders.push(order);
  writeDB(data);
  return order;
}

function getOrderByReference(reference) {
  const data = readDB();
  return data.orders.find((o) => o.reference === reference) || null;
}

function getOrderById(id) {
  const data = readDB();
  return data.orders.find((o) => o.id === id) || null;
}

function getAllOrders() {
  const data = readDB();
  return data.orders.slice().reverse(); // most recent first
}

function updateOrderByReference(reference, patch) {
  const data = readDB();
  const idx = data.orders.findIndex((o) => o.reference === reference);
  if (idx === -1) return null;
  data.orders[idx] = { ...data.orders[idx], ...patch, updatedAt: new Date().toISOString() };
  writeDB(data);
  return data.orders[idx];
}

module.exports = {
  saveOrder,
  getOrderByReference,
  getOrderById,
  getAllOrders,
  updateOrderByReference,
};
