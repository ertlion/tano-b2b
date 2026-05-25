"use client";

import { useEffect, useState } from "react";

interface TenantSync {
  id: number;
  name: string;
  company: string;
  marketplace: string;
  totalProducts: number;
  activeProducts: number;
  lastSyncAt: string | null;
}

interface PushRecord {
  id: number;
  tenantName: string;
  productName: string;
  productSku: string;
  externalProductId: string | null;
  status: string;
  syncedAt: string | null;
  createdAt: string;
}

interface StockMovement {
  id: number;
  productName: string;
  productSku: string;
  color: string | null;
  size: string;
  barcode: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference: string | null;
  createdAt: string;
}

interface SyncLog {
  id: number;
  tenantName: string;
  type: string;
  status: string;
  details: unknown;
  createdAt: string;
}

interface SyncData {
  tenants: TenantSync[];
  recentPushes: PushRecord[];
  recentMovements: StockMovement[];
  recentLogs: SyncLog[];
}

const TYPE_LABELS: Record<string, string> = {
  excel_import: "Excel Import",
  order: "Sipariş",
  manual: "Manuel",
  sync: "Senkronizasyon",
  stock_sync: "Stok Sync",
  product_push: "Ürün Aktarımı",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  success: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

type Tab = "tenants" | "pushes" | "stock" | "logs";

export default function AdminSyncPage() {
  const [data, setData] = useState<SyncData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tenants");
  const [ikasBusy, setIkasBusy] = useState<"sync" | "purge" | null>(null);
  const [ikasMsg, setIkasMsg] = useState("");

  async function runIkas(action: "sync" | "purge") {
    if (action === "purge" && !confirm("ikas-dışı (eski) tüm ürünler ve bağlı kayıtları silinecek. Emin misiniz?")) return;
    setIkasBusy(action);
    setIkasMsg("");
    try {
      const url = action === "sync" ? "/api/admin/ikas-sync" : "/api/admin/purge-non-ikas";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem başarısız");
      if (action === "sync") setIkasMsg(`Senkron tamam: ${json.data?.productsUpserted ?? 0} ürün, ${json.data?.variantsUpserted ?? 0} varyant`);
      else setIkasMsg(`${json.data?.deletedProducts ?? 0} eski ürün silindi`);
    } catch (e) {
      setIkasMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setIkasBusy(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/sync");
        if (!res.ok) throw new Error();
        const json = await res.json();
        setData(json.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Mağaza Sync</h1>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Mağaza Sync</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">Veri yüklenemedi</div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "tenants", label: "Mağazalar", count: data.tenants.length },
    { key: "pushes", label: "Aktarımlar", count: data.recentPushes.length },
    { key: "stock", label: "Stok Hareketleri", count: data.recentMovements.length },
    { key: "logs", label: "Sync Logları", count: data.recentLogs.length },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mağaza Sync</h1>

      {/* ikas Master kontrolleri */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">ikas Master Katalog</h2>
        <p className="text-xs text-gray-500 mb-3">Otomatik senkron her 3 dakikada bir çalışır. Aşağıdan elle de tetikleyebilirsiniz.</p>
        {ikasMsg && <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-700 text-sm">{ikasMsg}</div>}
        <div className="flex gap-2">
          <button onClick={() => runIkas("sync")} disabled={ikasBusy !== null} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg">
            {ikasBusy === "sync" ? "Senkronize ediliyor..." : "Şimdi Senkronize Et"}
          </button>
          <button onClick={() => runIkas("purge")} disabled={ikasBusy !== null} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg">
            {ikasBusy === "purge" ? "Temizleniyor..." : "Eski (ikas-dışı) Ürünleri Temizle"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Mağazalar */}
      {tab === "tenants" && (
        <div className="space-y-3">
          {data.tenants.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
              Henüz aktif müşteri yok
            </div>
          ) : (
            data.tenants.map((t) => (
              <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{t.company}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">{t.name}</span>
                      <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-medium">
                        {t.marketplace}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Son sync</p>
                    <p className="text-sm text-gray-900">{formatDate(t.lastSyncAt)}</p>
                  </div>
                </div>
                <div className="flex gap-6 mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Toplam Aktarılan</p>
                    <p className="text-lg font-bold text-gray-900">{t.totalProducts}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Aktif</p>
                    <p className="text-lg font-bold text-green-600">{t.activeProducts}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Aktarımlar */}
      {tab === "pushes" && (
        <div className="bg-white rounded-lg border border-gray-200">
          {data.recentPushes.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Henüz ürün aktarımı yapılmamış</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Mağaza</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">External ID</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recentPushes.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{p.tenantName}</td>
                      <td className="px-5 py-3 text-gray-700">{p.productName}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{p.productSku}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{p.externalProductId || "-"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(p.syncedAt || p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stok Hareketleri */}
      {tab === "stock" && (
        <div className="bg-white rounded-lg border border-gray-200">
          {data.recentMovements.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Henüz stok hareketi yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Renk / Beden</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Kaynak</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Eski</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Yeni</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Değişim</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recentMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{m.productName}</p>
                        <p className="text-xs text-gray-400 font-mono">{m.productSku}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 text-xs">
                        {[m.color, m.size !== "STD" ? m.size : null].filter(Boolean).join(" / ") || m.barcode}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {TYPE_LABELS[m.type] || m.type}
                        </span>
                        {m.reference && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate">{m.reference}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-gray-500">{m.previousStock}</td>
                      <td className="px-5 py-3 text-center font-medium text-gray-900">{m.newStock}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`font-semibold ${m.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sync Logları */}
      {tab === "logs" && (
        <div className="bg-white rounded-lg border border-gray-200">
          {data.recentLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Henüz sync logu yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Mağaza</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tür</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recentLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{l.tenantName}</td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {TYPE_LABELS[l.type] || l.type}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-700"}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
