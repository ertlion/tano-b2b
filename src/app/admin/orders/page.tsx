"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

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

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  totalAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  tenantCompany: string;
  enrichedItems: EnrichedItem[];
}

interface OrdersResponse {
  orders: Order[];
  total: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "Tum Durumlar" },
  { value: "new", label: "Yeni" },
  { value: "processing", label: "İşleniyor" },
  { value: "preparing", label: "Hazırlanıyor" },
  { value: "shipped", label: "Kargoda" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "cancelled", label: "İptal" },
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
    <img
      src={src}
      alt={alt}
      className="w-10 h-10 rounded object-cover flex-shrink-0"
    />
  );
}

export default function OrdersPage() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // All orders expanded by default
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);
      if (tenantFilter) params.set("tenantId", tenantFilter);

      const res = await fetch(`/api/admin/orders?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData({
        orders: json.data || [],
        total: json.meta?.total ?? 0,
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, tenantFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, tenantFilter]);

  // Close three-dot menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId !== null) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpenId]);

  async function handleCancel() {
    if (!cancelOrderId || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${cancelOrderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", note: cancelReason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "İptal işlemi başarısız");
        return;
      }
      setCancelOrderId(null);
      setCancelReason("");
      await fetchOrders();
    } catch {
      alert("Bir hata oluştu");
    } finally {
      setCancelling(false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Siparişler</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Mağaza filtrele..."
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data || data.orders.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-sm">Sipariş bulunamadı.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sipariş No</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Mağaza</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.orders.map((order) => {
                    const isExpanded = true;
                    const items = order.enrichedItems || [];
                    const firstItem = items[0];
                    const itemCount = items.length;

                    return (
                      <Fragment key={order.id}>
                        <tr
                          className="hover:bg-gray-50 transition-colors bg-gray-50"
                        >
                          <td className="px-6 py-3 text-blue-600 font-medium">{order.orderNumber}</td>
                          <td className="px-6 py-3 text-gray-600">{order.tenantCompany}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <ProductThumb
                                src={firstItem?.productImage || null}
                                alt={firstItem?.productName || ""}
                              />
                              <div className="min-w-0">
                                <p className="text-gray-900 truncate max-w-[200px]">
                                  {firstItem?.productName || "-"}
                                </p>
                                {itemCount > 1 && (
                                  <p className="text-xs text-gray-400">{itemCount} ürün</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right text-gray-900 font-medium">
                            {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currency}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                              {STATUS_LABEL[order.status] || order.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-500">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</td>
                          <td className="px-6 py-3"></td>
                        </tr>

                        {/* Expanded row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0">
                              <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                                <div className="flex gap-6">
                                  {/* Items table */}
                                  <div className="flex-1 overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-gray-200">
                                          <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500">Ürün</th>
                                          <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500">Renk / Beden</th>
                                          <th className="text-center py-2 pr-4 text-xs font-medium text-gray-500">Adet</th>
                                          <th className="text-right py-2 pr-4 text-xs font-medium text-gray-500">Birim Fiyat</th>
                                          <th className="text-right py-2 text-xs font-medium text-gray-500">Toplam</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {items.map((item, idx) => (
                                          <tr key={idx}>
                                            <td className="py-2 pr-4">
                                              <div className="flex items-center gap-2">
                                                <ProductThumb src={item.productImage} alt={item.productName} />
                                                <span className="text-gray-900">{item.productName}</span>
                                              </div>
                                            </td>
                                            <td className="py-2 pr-4 text-gray-600">{item.color} / {item.size}</td>
                                            <td className="py-2 pr-4 text-center text-gray-900">{item.quantity}</td>
                                            <td className="py-2 pr-4 text-right text-gray-600">
                                              {Number(item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                                            </td>
                                            <td className="py-2 text-right text-gray-900 font-medium">
                                              {(item.quantity * item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Actions column */}
                                  <div className="flex flex-col gap-2 flex-shrink-0 w-48">
                                    <Link
                                      href={`/admin/orders/${order.id}`}
                                      className="px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 text-center transition-colors"
                                    >
                                      Detayına Git
                                    </Link>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.print();
                                      }}
                                      className="px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 text-center transition-colors"
                                    >
                                      Kargo Etiketi Yazdır
                                    </button>
                                    <Link
                                      href={`/admin/orders/${order.id}`}
                                      className="px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 text-center transition-colors"
                                    >
                                      Kargo Etiketi Görüntüle
                                    </Link>

                                    {/* Three-dot menu */}
                                    <div className="relative mt-1" ref={menuOpenId === order.id ? menuRef : undefined}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenId(menuOpenId === order.id ? null : order.id);
                                        }}
                                        className="w-full px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-1 transition-colors"
                                      >
                                        <span className="text-lg leading-none tracking-widest">&#8942;</span>
                                      </button>
                                      {menuOpenId === order.id && (
                                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-48">
                                          {order.status !== "cancelled" && order.status !== "delivered" && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuOpenId(null);
                                                setCancelOrderId(order.id);
                                              }}
                                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                            >
                                              Siparişi İptal Et
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">Toplam {data.total} sipariş</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Önceki
                  </button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel Modal */}
      {cancelOrderId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>
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
                onClick={() => { setCancelOrderId(null); setCancelReason(""); }}
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

