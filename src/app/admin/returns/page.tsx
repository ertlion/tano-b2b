"use client";

import { useEffect, useState, useCallback } from "react";

interface ReturnItem {
  id: number;
  tenantId: number;
  tenantName: string;
  tenantCompany: string;
  orderId: number | null;
  orderNumber: string | null;
  masterVariantId: number;
  masterProductId: number;
  quantity: number;
  reason: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  productName: string;
  productImage: string | null;
  variantColor: string;
  variantSize: string;
  variantSku: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Beklemede",
  approved: "Onaylandi",
  rejected: "Reddedildi",
};

export default function AdminReturnsPage() {
  const [data, setData] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const limit = 20;

  // Action modal
  const [actionReturn, setActionReturn] = useState<ReturnItem | null>(null);
  const [actionType, setActionType] = useState<"approved" | "rejected">("approved");
  const [adminNote, setAdminNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/returns?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  function openAction(item: ReturnItem, type: "approved" | "rejected") {
    setActionReturn(item);
    setActionType(type);
    setAdminNote("");
  }

  async function handleAction() {
    if (!actionReturn) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/returns/${actionReturn.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: actionType, adminNote }),
      });
      if (res.ok) {
        setActionReturn(null);
        fetchReturns();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Iadeler</h1>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Tum Durumlar</option>
          <option value="pending">Beklemede</option>
          <option value="approved">Onaylandi</option>
          <option value="rejected">Reddedildi</option>
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
        ) : data.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-gray-500 text-sm">Iade kaydi bulunamadi.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bayi</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Urun</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Renk / Beden</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Adet</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Siparis</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Neden</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Islem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <p className="text-gray-900 font-medium text-xs">{r.tenantCompany}</p>
                        <p className="text-gray-400 text-xs">{r.tenantName}</p>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {r.productImage ? (
                            <img src={r.productImage} alt={r.productName} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0" />
                          )}
                          <span className="text-gray-900 truncate max-w-[160px]">{r.productName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{r.variantColor} / {r.variantSize}</td>
                      <td className="px-6 py-3 text-center text-gray-900">{r.quantity}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{r.orderNumber || "-"}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs max-w-[180px] truncate">{r.reason || "-"}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                        {r.adminNote && (
                          <p className="text-xs text-gray-400 mt-1 truncate max-w-[120px]" title={r.adminNote}>{r.adminNote}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{new Date(r.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-6 py-3 text-center">
                        {r.status === "pending" ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => openAction(r, "approved")}
                              className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                            >
                              Onayla
                            </button>
                            <button
                              onClick={() => openAction(r, "rejected")}
                              className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                            >
                              Reddet
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">Toplam {total} iade</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Onceki
                  </button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Modal */}
      {actionReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setActionReturn(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {actionType === "approved" ? "Iadeyi Onayla" : "Iadeyi Reddet"}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-600">
                <p><strong>Urun:</strong> {actionReturn.productName}</p>
                <p><strong>Varyant:</strong> {actionReturn.variantColor} / {actionReturn.variantSize}</p>
                <p><strong>Adet:</strong> {actionReturn.quantity}</p>
                <p><strong>Bayi:</strong> {actionReturn.tenantCompany}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Admin Notu</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  placeholder="Not ekleyin (opsiyonel)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setActionReturn(null)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Iptal
                </button>
                <button
                  onClick={handleAction}
                  disabled={actionLoading}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                    actionType === "approved"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {actionLoading ? "Isleniyor..." : actionType === "approved" ? "Onayla" : "Reddet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
