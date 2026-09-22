const STYLE_LABELS = { arabic_only: "Arabic only", arabic_and_meaning: "Arabic + meaning" };
const COLOR_LABELS = { white: "White", gold: "Royal Gold", black: "Black", brown: "Brown", green: "Green" };

function formatOrderText(order) {
  const itemLines = order.items
    .map((i) => {
      const style = STYLE_LABELS[i.style] || i.style;
      const color = COLOR_LABELS[i.color] || i.color || "White";
      return `  - ${i.name} (${style}, ${color} frame) — ₦${i.price.toLocaleString("en-NG")}`;
    })
    .join("\n");

  const lines = [
    `Reference: ${order.reference}`,
    `Status: ${order.status}`,
    `Customer: ${order.customer.fullName} (${order.customer.phone}${order.customer.email ? ", " + order.customer.email : ""})`,
    `Delivery: ${order.customer.address}, ${order.customer.city}`,
    `Items:`,
    itemLines,
  ];

  if (order.discount) {
    lines.push(`Subtotal: ₦${order.subtotal.toLocaleString("en-NG")}`);
    lines.push(`Bundle discount: -₦${order.discount.toLocaleString("en-NG")}`);
  }
  lines.push(`Total: ₦${order.totalAmount.toLocaleString("en-NG")}`);

  return lines.join("\n");
}

module.exports = { formatOrderText, STYLE_LABELS, COLOR_LABELS };
