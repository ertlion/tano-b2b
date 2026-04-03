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
  discountRate: string;
  notes: string | null;
  createdAt: string;
  tenantProductsCount: number;
  ordersCount: number;
}

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
  const [discountRate, setDiscountRate] = useState("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountMsg, setDiscountMsg] = useState("");

  async function loadTenant() {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTenant(json.data);
      setDiscountRate(json.data.discountRate ?? "0");
    } catch {
      setError("Müşteri bilgileri yüklenemedi");
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

  async function handleSaveDiscount() {
    const rate = parseFloat(discountRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setDiscountMsg("0-100 arası bir değer girin");
      return;
    }
    setDiscountSaving(true);
    setDiscountMsg("");
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountRate: String(rate) }),
      });
      if (res.ok) {
        setDiscountMsg("Kaydedildi");
        await loadTenant();
      } else {
        const json = await res.json();
        setDiscountMsg(json.error || "Hata oluştu");
      }
    } catch {
      setDiscountMsg("Bağlantı hatası");
    } finally {
      setDiscountSaving(false);
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
          &larr; Müşterilere Don
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
                <p className="text-xs text-gray-500">Kayıt Tarihi</p>
                <p className="text-sm text-gray-900">{new Date(tenant.createdAt).toLocaleDateString("tr-TR")}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Aktif Ürün</p>
                <p className="text-sm text-gray-900">{tenant.tenantProductsCount}</p>
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

      {/* Discount Rate */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">İskonto Oranı</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs text-gray-500 mb-1">İskonto (%)</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountRate}
                onChange={(e) => {
                  setDiscountRate(e.target.value);
                  setDiscountMsg("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Tano fiyatı üzerinden uygulanacak iskonto oranı
            </p>
          </div>
          <button
            onClick={handleSaveDiscount}
            disabled={discountSaving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
          >
            {discountSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
        {discountMsg && (
          <p className={`text-xs mt-2 ${discountMsg === "Kaydedildi" ? "text-green-600" : "text-red-600"}`}>
            {discountMsg}
          </p>
        )}
      </div>

      {/* Orders Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Siparişler</h2>
        </div>

        <div className="px-6 py-8 text-center">
          <p className="text-3xl font-bold text-gray-900">{tenant.ordersCount}</p>
          <p className="text-sm text-gray-500 mt-1">Toplam Sipariş</p>
          {tenant.ordersCount > 0 && (
            <Link
              href={`/admin/orders?tenantId=${tenant.id}`}
              className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-700"
            >
              Siparişleri Gor
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
