"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface EnrichedItem {
  productName: string;
  productImage: string | null;
  color: string;
  size: string;
  sku: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
}

interface StatusHistoryEntry {
  id: number;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

interface ShippingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
}

interface OrderDetail {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  totalAmount: string;
  currency: string;
  status: string;
  cargoCompany: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingUrl: string | null;
  invoiceFileUrl: string | null;
  cargoLabelFileUrl: string | null;
  notes: string | null;
  shippingAddress: ShippingAddress | null;
  items: unknown[];
  enrichedItems: EnrichedItem[];
  orderStatusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  bekleniyor: "bg-gray-100 text-gray-700",
  hazirlanacak: "bg-yellow-100 text-yellow-700",
  paketlendi: "bg-blue-100 text-blue-700",
  gonderildi: "bg-green-100 text-green-700",
  // legacy
  new: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-red-100 text-red-700",
  pending_review: "bg-orange-100 text-orange-700",
};

const STATUS_LABEL: Record<string, string> = {
  bekleniyor: "Bekleniyor",
  hazirlanacak: "Hazırlanacak",
  paketlendi: "Paketlendi",
  gonderildi: "Gönderildi",
  // legacy
  new: "Yeni",
  processing: "İşleniyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
  returned: "İade",
  pending_review: "Onay Bekliyor",
};

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <img src={src} alt={alt} className="w-10 h-10 rounded object-cover flex-shrink-0" />
  );
}

function DocUpload({
  label,
  fileUrl,
  busy,
  disabled,
  onSelect,
}: {
  label: string;
  fileUrl: string | null;
  busy: boolean;
  disabled: boolean;
  onSelect: (file: File | null) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {fileUrl ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Yüklendi
          </span>
        ) : (
          <span className="text-xs text-gray-400">Bekleniyor</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label
          className={`flex-1 cursor-pointer text-center px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
            disabled
              ? "border-gray-100 text-gray-300 cursor-not-allowed"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {busy ? "Yükleniyor..." : fileUrl ? "Değiştir" : "Dosya Seç"}
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={disabled || busy}
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </label>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Görüntüle
          </a>
        )}
      </div>
    </div>
  );
}

export default function PanelOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [uploading, setUploading] = useState<"invoice" | "label" | null>(null);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/panel/orders/${orderId}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setOrder(json.data);
      } catch {
        setError("Sipariş yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    loadOrder();
  }, [orderId]);

  async function handleOrderAction(action: "confirm" | "reject") {
    if (!order) return;
    setConfirmLoading(true);
    try {
      const res = await fetch(`/api/panel/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const json = await res.json();
        setOrder({ ...order, status: json.status === "cancelled" ? "cancelled" : "processing" });
      }
    } catch {
      // ignore
    } finally {
      setConfirmLoading(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileUpload(kind: "invoice" | "label", file: File | null) {
    if (!order || !file) return;
    setUploadError("");
    // 10MB sınırı
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Dosya 10MB'den büyük olamaz");
      return;
    }
    setUploading(kind);
    try {
      const base64 = await fileToBase64(file);
      const body =
        kind === "invoice" ? { invoiceFile: base64 } : { cargoLabelFile: base64 };
      const res = await fetch(`/api/panel/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Yükleme başarısız");
      setOrder({
        ...order,
        status: json.data.status,
        invoiceFileUrl: kind === "invoice" ? base64 : order.invoiceFileUrl,
        cargoLabelFileUrl: kind === "label" ? base64 : order.cargoLabelFileUrl,
      });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Yükleme başarısız");
    } finally {
      setUploading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="space-y-6">
        <Link href="/panel/orders" className="text-blue-600 hover:text-blue-700 text-sm">
          &larr; Siparişlere Dön
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!order) return null;

  const items = order.enrichedItems || [];
  const address = order.shippingAddress;

  // Find cancellation reason from status history
  const cancelEntry = order.orderStatusHistory.find(
    (e) => e.toStatus === "cancelled" && e.note
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/panel/orders" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h1>
          <p className="text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleString("tr-TR")}
          </p>
        </div>
      </div>

      {/* Pending Review Warning */}
      {order.status === "pending_review" && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-orange-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-orange-800">Bu sipariste daha once iade aldiginiz urunler var. Lutfen kontrol edin.</h3>
              {order.notes && order.notes.includes("[REVIEW GEREKLI]") && (
                <p className="text-xs text-orange-700 mt-1">{order.notes.replace("[REVIEW GEREKLI] ", "")}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => handleOrderAction("confirm")}
                  disabled={confirmLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {confirmLoading ? "Isleniyor..." : "Onayla ve Stok Dus"}
                </button>
                <button
                  onClick={() => handleOrderAction("reject")}
                  disabled={confirmLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  Reddet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Müşteri</p>
                <p className="text-sm text-gray-900 font-medium">{order.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Durum</p>
                <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                  {STATUS_LABEL[order.status] || order.status}
                </span>
              </div>
              {order.customerEmail && (
                <div>
                  <p className="text-xs text-gray-500">E-posta</p>
                  <p className="text-sm text-gray-900">{order.customerEmail}</p>
                </div>
              )}
              {order.customerPhone && (
                <div>
                  <p className="text-xs text-gray-500">Telefon</p>
                  <p className="text-sm text-gray-900">{order.customerPhone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">Toplam Tutar</p>
                <p className="text-sm text-gray-900 font-bold">
                  {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currency}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Tarih</p>
                <p className="text-sm text-gray-900">
                  {new Date(order.createdAt).toLocaleString("tr-TR")}
                </p>
              </div>
            </div>

            {/* Cargo info */}
            {order.cargoTrackingNumber && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Kargo Bilgileri</p>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-purple-900">
                        {order.cargoCompany}
                      </p>
                      <p className="text-xs text-purple-700 font-mono">
                        {order.cargoTrackingNumber}
                      </p>
                    </div>
                  </div>
                  {order.cargoTrackingUrl && (
                    <a
                      href={order.cargoTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-purple-700 hover:text-purple-800 font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Kargoyu Takip Et
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Cancellation reason */}
            {order.status === "cancelled" && cancelEntry && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">İptal Nedeni</p>
                  <p className="text-sm text-red-600">{cancelEntry.note}</p>
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Ürünler</h2>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                Ürün bilgisi bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Renk / Beden</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Adet</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Birim Fiyat</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <ProductThumb src={item.productImage} alt={item.productName} />
                            <span className="text-gray-900">{item.productName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-gray-600">{item.color} / {item.size}</td>
                        <td className="px-6 py-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-6 py-3 text-center text-gray-900">{item.quantity}</td>
                        <td className="px-6 py-3 text-right text-gray-600">
                          {Number(item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                        </td>
                        <td className="px-6 py-3 text-right text-gray-900 font-medium">
                          {(item.quantity * item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Shipping Address */}
          {address && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Teslimat Adresi</h2>
              <div className="text-sm text-gray-700 space-y-1">
                {address.name && <p className="font-medium">{address.name}</p>}
                {address.address1 && <p>{address.address1}</p>}
                {address.address2 && <p>{address.address2}</p>}
                <p>
                  {[address.district, address.city, address.postalCode].filter(Boolean).join(", ")}
                </p>
                {address.country && <p>{address.country}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Status Timeline */}
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Durumu</h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                {STATUS_LABEL[order.status] || order.status}
              </span>
            </div>
            {order.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notlar</p>
                <p className="text-sm text-gray-700">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Fatura & Kargo Etiketi Yükleme (Epic D) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Fatura & Kargo Etiketi</h2>
            <p className="text-xs text-gray-500 mb-4">
              İkisini de yüklediğinizde sipariş <b>Hazırlanacak</b> durumuna geçer ve Tano işleme alır.
            </p>

            {uploadError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                {uploadError}
              </div>
            )}

            <div className="space-y-4">
              <DocUpload
                label="Fatura (PDF/Görsel)"
                fileUrl={order.invoiceFileUrl}
                busy={uploading === "invoice"}
                disabled={order.status === "paketlendi" || order.status === "gonderildi"}
                onSelect={(f) => handleFileUpload("invoice", f)}
              />
              <DocUpload
                label="Kargo Etiketi (PDF/Görsel)"
                fileUrl={order.cargoLabelFileUrl}
                busy={uploading === "label"}
                disabled={order.status === "paketlendi" || order.status === "gonderildi"}
                onSelect={(f) => handleFileUpload("label", f)}
              />
            </div>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Durum Geçmişi</h2>

            {order.orderStatusHistory.length === 0 ? (
              <p className="text-sm text-gray-500">Henüz durum değişikliği yok.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-4">
                  {order.orderStatusHistory.map((entry) => (
                    <div key={entry.id} className="relative pl-8">
                      <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[entry.toStatus] || "bg-gray-100 text-gray-700"}`}>
                            {STATUS_LABEL[entry.toStatus] || entry.toStatus}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {STATUS_LABEL[entry.fromStatus] || entry.fromStatus} &rarr; {STATUS_LABEL[entry.toStatus] || entry.toStatus}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
