// Protects /admin and /api/admin/* with HTTP Basic Auth. This is
// deliberately simple — no user accounts, no sessions — because this app
// has exactly one operator (you). It's enough security as long as:
//   1. It's only ever accessed over HTTPS (Render gives you this by default),
//   2. ADMIN_PASSWORD is a real password, not left blank or default.
// If this ever needs multiple staff logins or granular permissions, this
// middleware is the seam to replace with a real auth system.

const REALM = "CR-Frames Admin";

function requireAdminAuth(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "";

  if (!expectedPass) {
    return res
      .status(503)
      .send("Admin dashboard is not configured yet. Set ADMIN_PASSWORD in your environment and restart the server.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const sepIdx = decoded.indexOf(":");
    const suppliedUser = sepIdx === -1 ? decoded : decoded.slice(0, sepIdx);
    const suppliedPass = sepIdx === -1 ? "" : decoded.slice(sepIdx + 1);

    // Constant-time comparison so response timing can't leak the password.
    if (safeEqual(suppliedUser, expectedUser) && safeEqual(suppliedPass, expectedPass)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", `Basic realm="${REALM}"`);
  return res.status(401).send("Authentication required.");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  const crypto = require("crypto");
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { requireAdminAuth };
