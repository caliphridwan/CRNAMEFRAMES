// Notifies you (the shop owner) by email when something happens — a new
// order comes in, or one gets paid. If SMTP isn't configured yet, this
// quietly logs to the console instead of failing, so the rest of the app
// (order creation, payments) never breaks because a notification couldn't
// be sent. Fill in the SMTP_* vars in .env to turn on real emails.

let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (err) {
  nodemailer = null; // dependency not installed yet — falls back to console logging
}

let cachedTransporter = null;

function getTransporter() {
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/STARTTLS
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return cachedTransporter;
}

async function notifyAdmin(subject, text) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const transporter = getTransporter();

  if (!transporter || !to) {
    console.log(`\n[notify] (email not configured — set SMTP_HOST + ADMIN_NOTIFY_EMAIL)\nSubject: ${subject}\n${text}\n`);
    return { sent: false, reason: "not_configured" };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error("[notify] failed to send email:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { notifyAdmin };
