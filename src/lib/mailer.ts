import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

interface NewProductNotification {
  tenantEmail: string;
  tenantName: string;
  products: Array<{
    name: string;
    sku: string;
    variants: Array<{ size: string; salePrice: number }>;
    category?: string;
  }>;
}

export async function sendNewProductsEmail(data: NewProductNotification): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const productRows = data.products
    .map(
      (p) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;font-weight:500">${p.name}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${p.sku}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${p.category || "-"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${p.variants.map((v) => v.size).join(", ")}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">₺${p.variants[0]?.salePrice?.toFixed(2) || "0"}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
      <h2 style="color:#1f2937">Yeni Ürünler Eklendi!</h2>
      <p style="color:#6b7280">Merhaba <strong>${data.tenantName}</strong>,</p>
      <p style="color:#6b7280">Tano Atelier kataloğuna <strong>${data.products.length}</strong> yeni ürün eklendi. Hemen panelinizden inceleyip sitenize aktarabilirsiniz.</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Ürün</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">SKU</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Kategori</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Bedenler</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">Fiyat</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/panel/products/new"
         style="display:inline-block;background:#1f2937;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;margin-top:8px">
        Ürünleri İncele
      </a>

      <p style="color:#9ca3af;font-size:12px;margin-top:24px">
        Bu mail Tano Atelier B2B Panel tarafından otomatik gönderilmiştir.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: data.tenantEmail,
      subject: `Tano Atelier - ${data.products.length} Yeni Ürün Eklendi!`,
      html,
    });
  } catch (err) {
    console.error(`Failed to send new products email to ${data.tenantEmail}:`, err);
  }
}

interface OrderStatusNotification {
  tenantEmail: string;
  tenantName: string;
  orderNumber: string;
  newStatus: string;
  cargoCompany?: string;
  cargoTrackingNumber?: string;
  cargoTrackingUrl?: string;
  note?: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Yeni Sipariş",
  processing: "Hazırlanıyor",
  shipped: "Kargoya Verildi",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
  returned: "İade Edildi",
};

export async function sendOrderStatusEmail(data: OrderStatusNotification): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const statusLabel = STATUS_LABELS[data.newStatus] || data.newStatus;

  let cargoSection = "";
  if (data.newStatus === "shipped" && data.cargoTrackingNumber) {
    cargoSection = `
      <div style="margin:16px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
        <p style="margin:0;font-size:14px;color:#1e40af"><strong>Kargo Bilgileri</strong></p>
        <p style="margin:4px 0 0;color:#374151">${data.cargoCompany || "Kargo"}: <strong>${data.cargoTrackingNumber}</strong></p>
        ${data.cargoTrackingUrl ? `<a href="${data.cargoTrackingUrl}" style="color:#2563eb;font-size:14px">Kargo Takip</a>` : ""}
      </div>
    `;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1f2937">Sipariş Durum Güncellemesi</h2>
      <p style="color:#6b7280">Merhaba <strong>${data.tenantName}</strong>,</p>
      <p style="color:#6b7280">#${data.orderNumber} numaralı siparişinizin durumu güncellendi:</p>

      <div style="margin:16px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:18px;font-weight:bold;color:#166534">${statusLabel}</p>
      </div>

      ${cargoSection}
      ${data.note ? `<p style="color:#6b7280;font-size:14px"><em>Not: ${data.note}</em></p>` : ""}

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/panel/orders"
         style="display:inline-block;background:#1f2937;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;margin-top:8px">
        Siparişi Görüntüle
      </a>

      <p style="color:#9ca3af;font-size:12px;margin-top:24px">
        Bu mail Tano Atelier B2B Panel tarafından otomatik gönderilmiştir.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: data.tenantEmail,
      subject: `Sipariş #${data.orderNumber} - ${statusLabel}`,
      html,
    });
  } catch (err) {
    console.error(`Failed to send order status email to ${data.tenantEmail}:`, err);
  }
}

interface StockChangeNotification {
  tenantEmail: string;
  tenantName: string;
  changes: Array<{
    productName: string;
    size: string;
    oldQuantity: number;
    newQuantity: number;
  }>;
}

export async function sendStockChangeEmail(data: StockChangeNotification): Promise<void> {
  if (data.changes.length === 0) return;
  const transporter = getTransporter();
  if (!transporter) return;

  const rows = data.changes
    .map(
      (c) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">${c.productName}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${c.size}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${c.oldQuantity}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;font-weight:bold;${c.newQuantity === 0 ? "color:#dc2626" : "color:#16a34a"}">${c.newQuantity}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1f2937">Stok Değişiklik Raporu</h2>
      <p style="color:#6b7280">Mağaza: <strong>${data.tenantName}</strong></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Ürün</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Beden</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Eski</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Yeni</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">
        Bu mail Tano Atelier B2B Panel tarafından otomatik gönderilmiştir.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: data.tenantEmail,
      subject: `Tano Atelier - Stok Değişikliği (${data.changes.length} ürün)`,
      html,
    });
  } catch (err) {
    console.error(`Failed to send stock change email to ${data.tenantEmail}:`, err);
  }
}
