"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface TenantDetail {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  marketplace: string;
  isApproved: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  activeProductsCount: number;
  orders: Array<{
    id: number;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
  }>;
}

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

const MARKETPLACE_LABEL: Record<string, string> = {
  shopify: "Shopify",
  ikas: "ikas",
  tsoft: "TSoft",
  ideasoft: "IdeaSoft",
};

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadTenant() {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTenant(data);
    } catch {
      setError("Musteri bilgileri yuklenemedi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleApprove() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/approve`, { method: "POST" });
      if (res.ok) await loadTenant();
    } catch {
      // keep current state
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleActive() {
    if (!tenant) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/toggle-active`, { method: "POST" });
      if (res.ok) await loadTenant();
    } catch {
      // keep current state
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="space-y-6">
        <Link href="/admin/tenants" className="text-blue-600 hover:text-blue-700 text-sm">
          &larr; Musterilere Don
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/tenants" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
          <p className="text-sm text-gray-500">{tenant.company}</p>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3">
              <div>
                <p className="text-xs text-gray-500">E-posta</p>
                <p className="text-sm text-gray-900">{tenant.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Telefon</p>
                <p className="text-sm text-gray-900">{tenant.phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Platform</p>
                <p className="text-sm text-gray-900">{MARKETPLACE_LABEL[tenant.marketplace] || tenant.marketplace}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Kayit Tarihi</p>
                <p className="text-sm text-gray-900">{new Date(tenant.createdAt).toLocaleDateString("tr-TR")}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Aktif Urun</p>
                <p className="text-sm text-gray-900">{tenant.activeProductsCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Durum</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {!tenant.isActive ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Pasif</span>
                  ) : !tenant.isApproved ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Onay Bekliyor</span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktif</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {!tenant.isApproved && tenant.isActive && (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
              >
                Onayla
              </button>
            )}
            <button
              onClick={handleToggleActive}
              disabled={actionLoading}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tenant.isActive
                  ? "bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
                  : "bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white"
              }`}
            >
              {tenant.isActive ? "Pasife Al" : "Aktif Et"}
            </button>
          </div>
        </div>
      </div>

      {/* Orders */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Siparisler</h2>
        </div>

        {tenant.orders.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            Bu musteriye ait siparis bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Siparis No</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Musteri</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenant.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="text-blue-600 hover:text-blue-700 font-medium">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
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
        )}
      </div>
    </div>
  );
}
