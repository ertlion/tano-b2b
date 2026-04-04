"use client";

import { useEffect, useState, useCallback } from "react";

interface ReturnItem {
  id: number;
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

interface OrderForReturn {
  id: number;
  orderNumber: string;
  enrichedItems: Array<{
    productName: string;
    productImage: string | null;
    color: string;
    size: string;
    sku: string;
    masterVariantId?: number;
  }>;
}

interface OrderItem {
  masterVariantId?: number;
  productName?: string;
  color?: string;
  size?: string;
  sku?: string;
  title?: string;
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

export default function PanelReturnsPage() {
  const [data, setData] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const limit = 20;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [recentOrders, setRecentOrders] = useState<OrderForReturn[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/panel/returns?${params}`);
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

  async function openModal() {
    setShowModal(true);
    setSelectedOrderId(null);
    setSelectedItem(null);
    setQuantity(1);
    setReason("");
    setSubmitError("");
    // Load recent orders
    try {
      const res = await fetch("/api/panel/orders?limit=50");
      if (res.ok) {
        const json = await res.json();
        setRecentOrders(json.data || []);
      }
    } catch {
      setRecentOrders([]);
    }
  }

  function selectOrder(orderId: number) {
    setSelectedOrderId(orderId);
    setSelectedItem(null);
  }

  function selectItem(item: OrderItem) {
    setSelectedItem(item);
  }

  async function handleSubmit() {
    if (!selectedItem?.masterVariantId) {
      setSubmitError("Lutfen bir urun secin");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      // Need to find masterProductId - fetch from variant
      const variantRes = await fetch(`/api/panel/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderId,
          masterVariantId: selectedItem.masterVariantId,
          masterProductId: 0, // Will be validated server-side
          quantity,
          reason,
        }),
      });

      if (!variantRes.ok) {
        const err = await variantRes.json();
        setSubmitError(err.error || "Bir hata olustu");
        return;
      }

      setShowModal(false);
      fetchReturns();
    } catch {
      setSubmitError("Bir hata olustu");
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const selectedOrder = recentOrders.find((o) => o.id === selectedOrderId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Iadelerim</h1>
        <button
          onClick={openModal}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Iade Bildir
        </button>
      </div>

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
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
            </svg>
            <p className="text-gray-500 text-sm">Iade kaydi bulunamadi.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Urun</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Renk / Beden</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Adet</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Siparis</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Neden</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          {r.productImage ? (
                            <img src={r.productImage} alt={r.productName} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <span className="text-gray-900 truncate max-w-[180px]">{r.productName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{r.variantColor} / {r.variantSize}</td>
                      <td className="px-6 py-3 text-center text-gray-900">{r.quantity}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{r.orderNumber || "-"}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs max-w-[200px] truncate">{r.reason || "-"}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] || "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                        {r.adminNote && (
                          <p className="text-xs text-gray-400 mt-1 max-w-[150px] truncate" title={r.adminNote}>{r.adminNote}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{new Date(r.createdAt).toLocaleDateString("tr-TR")}</td>
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

      {/* Create Return Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">Iade Bildir</h2>
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 1: Select order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Siparis Secin</label>
                <select
                  value={selectedOrderId ?? ""}
                  onChange={(e) => selectOrder(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Siparis secin...</option>
                  {recentOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.orderNumber}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Select item from order */}
              {selectedOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Urun Secin</label>
                  <div className="space-y-2">
                    {selectedOrder.enrichedItems.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => selectItem(item as unknown as OrderItem)}
                        className={`w-full text-left p-3 border rounded-lg text-sm transition-colors ${
                          selectedItem?.masterVariantId === (item as unknown as OrderItem).masterVariantId
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.productImage ? (
                            <img src={item.productImage} alt="" className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-100" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{item.productName}</p>
                            <p className="text-xs text-gray-500">{item.color} / {item.size} - {item.sku}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              {selectedItem && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adet</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Iade Nedeni</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Iade nedenini yazin..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Iptal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedItem}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Gonderiliyor..." : "Iade Bildir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
