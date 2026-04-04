"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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
  cargoCompany: string | null;
  cargoTrackingNumber: string | null;
  createdAt: string;
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
    <img src={src} alt={alt} className="w-10 h-10 rounded object-cover flex-shrink-0" />
  );
}

export default function PanelOrdersPage() {
  const router = useRouter();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/panel/orders?${params}`);
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
  }, [page, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Siparişlerim</h1>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-6 space-y-3">
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
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Müşteri</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kargo</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.orders.map((order) => {
                    const items = order.enrichedItems || [];
                    const firstItem = items[0];
                    const itemCount = items.length;

                    return (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/panel/orders/${order.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-3 text-blue-600 font-medium">{order.orderNumber}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <ProductThumb
                              src={firstItem?.productImage || null}
                              alt={firstItem?.productName || ""}
                            />
                            <div className="min-w-0">
                              <p className="text-gray-900 truncate max-w-[180px]">
                                {firstItem?.productName || "-"}
                              </p>
                              {itemCount > 1 && (
                                <p className="text-xs text-gray-400">{itemCount} ürün</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                        <td className="px-6 py-3 text-right text-gray-900 font-medium">
                          {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currency}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                            {STATUS_LABEL[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {order.cargoCompany ? (
                            <span>{order.cargoCompany}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                        </td>
                      </tr>
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
    </div>
  );
}
