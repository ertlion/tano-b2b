"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  totalAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  tenantCompany: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "Tum Durumlar" },
  { value: "new", label: "Yeni" },
  { value: "processing", label: "Isleniyor" },
  { value: "preparing", label: "Hazirlaniyor" },
  { value: "shipped", label: "Kargoda" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "cancelled", label: "Iptal" },
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
  processing: "Isleniyor",
  preparing: "Hazirlaniyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "Iptal",
};

export default function OrdersPage() {
  const router = useRouter();
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

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

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Siparisler</h1>

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
            placeholder="Magaza filtrele..."
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
            <p className="text-gray-500 text-sm">Siparis bulunamadi.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Siparis No</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Magaza</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Musteri</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3 text-blue-600 font-medium">{order.orderNumber}</td>
                      <td className="px-6 py-3 text-gray-600">{order.tenantCompany}</td>
                      <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                      <td className="px-6 py-3 text-right text-gray-900 font-medium">
                        {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currency}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">Toplam {data.total} siparis</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Onceki
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
