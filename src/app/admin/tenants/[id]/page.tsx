"use client";

import { useEffect, useState, useCallback } from "react";
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

interface PermissionProduct {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  image: string | null;
  allowed: boolean;
}

interface PermissionMeta {
  mode: "all" | "restricted";
  totalProducts: number;
  allowedCount: number;
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

  // Permission states
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permProducts, setPermProducts] = useState<PermissionProduct[]>([]);
  const [permMeta, setPermMeta] = useState<PermissionMeta | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permSearch, setPermSearch] = useState("");
  const [permChecked, setPermChecked] = useState<Record<number, boolean>>({});

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

  const loadPermissions = useCallback(async () => {
    setPermLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/permissions`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setPermProducts(json.data);
      setPermMeta(json.meta);
      const checked: Record<number, boolean> = {};
      for (const p of json.data as PermissionProduct[]) {
        checked[p.id] = p.allowed;
      }
      setPermChecked(checked);
    } catch {
      // silent
    } finally {
      setPermLoading(false);
    }
  }, [tenantId]);

  async function handleOpenPermModal() {
    setPermModalOpen(true);
    setPermSearch("");
    await loadPermissions();
  }

  async function handleSavePermissions() {
    setPermSaving(true);
    try {
      // First delete all existing records
      await fetch(`/api/admin/tenants/${tenantId}/permissions`, { method: "DELETE" });

      // Collect allowed and denied product ids
      const allowedIds: number[] = [];
      const deniedIds: number[] = [];
      for (const [idStr, val] of Object.entries(permChecked)) {
        if (val) allowedIds.push(Number(idStr));
        else deniedIds.push(Number(idStr));
      }

      // Check if all are checked → no restriction needed
      const allChecked = permProducts.every((p) => permChecked[p.id]);
      if (allChecked) {
        // Already deleted all records above → mode = "all"
        setPermMeta({ mode: "all", totalProducts: permProducts.length, allowedCount: permProducts.length });
        setPermModalOpen(false);
        setPermSaving(false);
        return;
      }

      // Insert allowed records
      if (allowedIds.length > 0) {
        await fetch(`/api/admin/tenants/${tenantId}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: allowedIds, allowed: true }),
        });
      }

      // Insert denied records
      if (deniedIds.length > 0) {
        await fetch(`/api/admin/tenants/${tenantId}/permissions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: deniedIds, allowed: false }),
        });
      }

      await loadPermissions();
      setPermModalOpen(false);
    } catch {
      // silent
    } finally {
      setPermSaving(false);
    }
  }

  async function handleResetPermissions() {
    setPermSaving(true);
    try {
      await fetch(`/api/admin/tenants/${tenantId}/permissions`, { method: "DELETE" });
      await loadPermissions();
      setPermModalOpen(false);
    } catch {
      // silent
    } finally {
      setPermSaving(false);
    }
  }

  function handleSelectAll() {
    const newChecked: Record<number, boolean> = {};
    for (const p of permProducts) {
      newChecked[p.id] = true;
    }
    setPermChecked(newChecked);
  }

  function handleDeselectAll() {
    const newChecked: Record<number, boolean> = {};
    for (const p of permProducts) {
      newChecked[p.id] = false;
    }
    setPermChecked(newChecked);
  }

  const filteredPermProducts = permProducts.filter((p) => {
    if (!permSearch) return true;
    const s = permSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.sku.toLowerCase().includes(s) ||
      (p.category?.toLowerCase().includes(s) ?? false)
    );
  });

  // Load permission meta on mount
  useEffect(() => {
    if (tenantId) {
      fetch(`/api/admin/tenants/${tenantId}/permissions`)
        .then((r) => r.json())
        .then((json) => setPermMeta(json.meta))
        .catch(() => {});
    }
  }, [tenantId]);

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

      {/* Product Permissions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{"Urun Izinleri"}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {permMeta?.mode === "restricted"
                ? `Kisitli erisim (${permMeta.allowedCount} / ${permMeta.totalProducts} urun izinli)`
                : "Tum urunleri gorebilir"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {permMeta?.mode === "restricted" && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                Kisitli
              </span>
            )}
            {permMeta?.mode === "all" && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Tam Erisim
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleOpenPermModal}
          className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {"Urun Izinlerini Yonet"}
        </button>
      </div>

      {/* Permission Modal */}
      {permModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{"Urun Izinlerini Yonet"}</h3>
              <button
                onClick={() => setPermModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Urun ara..."
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
              >
                {"Tumunu Ac"}
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                {"Tumunu Kapat"}
              </button>
              <button
                onClick={handleResetPermissions}
                disabled={permSaving}
                className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {"Kisitlamayi Kaldir"}
              </button>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {permLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredPermProducts.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        permChecked[p.id]
                          ? "bg-blue-50 hover:bg-blue-100"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={permChecked[p.id] ?? false}
                        onChange={(e) =>
                          setPermChecked((prev) => ({
                            ...prev,
                            [p.id]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {p.image && (
                        <img
                          src={p.image}
                          alt=""
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {p.sku}
                          {p.category ? ` - ${p.category}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                  {filteredPermProducts.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-8">
                      {permSearch ? "Sonuc bulunamadi" : "Urun bulunamadi"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {Object.values(permChecked).filter(Boolean).length} / {permProducts.length} urun izinli
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPermModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Iptal
                </button>
                <button
                  onClick={handleSavePermissions}
                  disabled={permSaving}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {permSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
