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
  notes: string | null;
  shippingAddress: ShippingAddress | null;
  items: unknown[];
  enrichedItems: EnrichedItem[];
  orderStatusHistory: StatusHistoryEntry[];
  tenant: { company: string } | null;
  createdAt: string;
  updatedAt: string;
}

const ALL_STATUSES = ["new", "processing", "preparing", "shipped", "delivered", "cancelled"];

const CARGO_COMPANIES = [
  { value: "yurtici", label: "Yurtici Kargo" },
  { value: "aras", label: "Aras Kargo" },
  { value: "mng", label: "MNG Kargo" },
  { value: "surat", label: "Surat Kargo" },
  { value: "ptt", label: "PTT Kargo" },
  { value: "diger", label: "Diger" },
];

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  preparing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Yeni",
  processing: "İşleniyor",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
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

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [newStatus, setNewStatus] = useState("");
  const [cargoCompany, setCargoCompany] = useState("");
  const [cargoTracking, setCargoTracking] = useState("");
  const [cargoUrl, setCargoUrl] = useState("");

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function loadOrder() {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const data = json.data;
      setOrder(data);
      setNewStatus(data.status);
      setCargoCompany(data.cargoCompany || "");
      setCargoTracking(data.cargoTrackingNumber || "");
      setCargoUrl(data.cargoTrackingUrl || "");
    } catch {
      setError("Sipariş yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleStatusUpdate() {
    if (!order || newStatus === order.status) return;
    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const body: Record<string, string> = { status: newStatus };
      if (newStatus === "shipped") {
        body.cargoCompany = cargoCompany;
        body.cargoTrackingNumber = cargoTracking;
        body.cargoTrackingUrl = cargoUrl;
      }

      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Güncelleme başarısız");
      }

      setSuccess("Sipariş durumu güncellendi");
      await loadOrder();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", note: cancelReason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "İptal işlemi başarısız");
        return;
      }
      setShowCancelModal(false);
      setCancelReason("");
      setSuccess("Sipariş iptal edildi");
      await loadOrder();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Bir hata oluştu");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
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
        <Link href="/admin/orders" className="text-blue-600 hover:text-blue-700 text-sm">
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
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h1>
          <p className="text-sm text-gray-500">{order.tenant?.company}</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                <p className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleString("tr-TR")}</p>
              </div>
            </div>

            {order.cargoTrackingNumber && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Kargo Bilgileri</p>
                <p className="text-sm text-gray-900">
                  {CARGO_COMPANIES.find((c) => c.value === order.cargoCompany)?.label || order.cargoCompany} - {order.cargoTrackingNumber}
                </p>
                {order.cargoTrackingUrl && (
                  <a
                    href={order.cargoTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Kargo Takip
                  </a>
                )}
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Ürünler</h2>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">Ürün bilgisi bulunamadı.</div>
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Cargo & Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">İşlemler</h2>
            <div className="space-y-2">
              <button
                onClick={() => window.print()}
                className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 text-center transition-colors"
              >
                Kargo Etiketi Yazdır
              </button>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 text-center transition-colors"
              >
                Kargo Etiketi Görüntüle
              </button>
              {order.status !== "cancelled" && order.status !== "delivered" && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-center transition-colors"
                >
                  Siparişi İptal Et
                </button>
              )}
            </div>
          </div>

          {/* Status Update */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Durum Güncelle</h2>
            <div className="space-y-3">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>

              {newStatus === "shipped" && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Kargo Firmasi</label>
                    <select
                      value={cargoCompany}
                      onChange={(e) => setCargoCompany(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">Seciniz</option>
                      {CARGO_COMPANIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Takip Numarası</label>
                    <input
                      type="text"
                      value={cargoTracking}
                      onChange={(e) => setCargoTracking(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Takip URL</label>
                    <input
                      type="text"
                      value={cargoUrl}
                      onChange={(e) => setCargoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleStatusUpdate}
                disabled={updating || newStatus === order.status}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
              >
                {updating ? "Güncelleniyor..." : "Durumu Güncelle"}
              </button>
            </div>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                        {entry.note && <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>}
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

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowCancelModal(false); setCancelReason(""); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Siparişi İptal Et</h3>
            <p className="text-sm text-gray-600 mb-3">
              Bu siparişi iptal etmek istediğinize emin misiniz? Lütfen iptal nedenini yazın.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="İptal nedeni..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(""); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {cancelling ? "İptal Ediliyor..." : "İptal Et"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
