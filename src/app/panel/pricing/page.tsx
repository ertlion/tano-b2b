"use client";

import { useEffect, useState, useCallback } from "react";

interface Variant {
  variantId: number;
  color: string | null;
  size: string;
  sku: string;
  usdPrice: number;
  mode: string | null;
  percent: number | null;
  manualPriceTry: number | null;
  priceTry: number;
  baseTry: number;
}
interface Product {
  id: number;
  name: string;
  sku: string;
  variants: Variant[];
}
interface PricingData {
  defaultMarkupPercent: number;
  usdRate: number;
  products: Product[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

type Edit = { mode: string; value: string };

function tl(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PricingPage() {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [markup, setMarkup] = useState("");
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [msg, setMsg] = useState("");
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [savingProduct, setSavingProduct] = useState<number | null>(null);

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/panel/pricing?page=${p}&search=${encodeURIComponent(q)}`);
      const json = await res.json();
      setData(json.data);
      setMarkup(String(json.data?.defaultMarkupPercent ?? 0));
      setEdits({});
    } catch {
      setMsg("Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1, "");
  }, [load]);

  async function saveMarkup() {
    setSavingMarkup(true);
    setMsg("");
    try {
      const res = await fetch("/api/panel/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultMarkupPercent: Number(markup) }),
      });
      if (!res.ok) throw new Error();
      setMsg("Varsayılan kar marjı kaydedildi");
      load(page, search);
    } catch {
      setMsg("Kaydedilemedi");
    } finally {
      setSavingMarkup(false);
    }
  }

  function currentMode(v: Variant): string {
    return edits[v.variantId]?.mode ?? v.mode ?? "default";
  }
  function currentValue(v: Variant): string {
    if (edits[v.variantId]) return edits[v.variantId].value;
    if (v.mode === "percent") return String(v.percent ?? "");
    if (v.mode === "manual") return String(v.manualPriceTry ?? "");
    return "";
  }
  function setEdit(variantId: number, patch: Partial<Edit>) {
    setEdits((prev) => {
      const cur = prev[variantId] ?? { mode: "default", value: "" };
      return { ...prev, [variantId]: { ...cur, ...patch } };
    });
  }

  // Canlı önizleme TL
  function preview(v: Variant): number {
    const rate = data?.usdRate ?? 0;
    const mode = currentMode(v);
    const val = Number(currentValue(v));
    const base = v.usdPrice * rate;
    if (mode === "manual") return Number.isFinite(val) ? val : 0;
    if (mode === "percent") return base * (1 + (Number.isFinite(val) ? val : 0) / 100);
    return base * (1 + (data?.defaultMarkupPercent ?? 0) / 100);
  }

  async function saveProduct(p: Product) {
    setSavingProduct(p.id);
    setMsg("");
    const overrides = p.variants
      .filter((v) => edits[v.variantId])
      .map((v) => {
        const mode = currentMode(v);
        if (mode === "default") return { variantId: v.variantId, mode: "clear" as const };
        if (mode === "percent")
          return { variantId: v.variantId, mode: "percent" as const, percent: Number(currentValue(v)) };
        return { variantId: v.variantId, mode: "manual" as const, manualPriceTry: Number(currentValue(v)) };
      });
    if (overrides.length === 0) {
      setSavingProduct(null);
      return;
    }
    try {
      const res = await fetch("/api/panel/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) throw new Error();
      setMsg(`${p.name} fiyatları kaydedildi`);
      load(page, search);
    } catch {
      setMsg("Kaydedilemedi");
    } finally {
      setSavingProduct(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fiyatlandırma</h1>
        <p className="text-sm text-gray-500">
          Fiyatlar ikas Dolar B2B (USD) üzerinden gelir. Kur: <b>1 USD = {tl(data?.usdRate ?? 0)} TL</b>.
          Kendi kar marjını belirle veya varyanta manuel TL fiyat gir.
        </p>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>
      )}

      {/* Varsayılan kar marjı */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Varsayılan Kar Marjı</h2>
        <p className="text-xs text-gray-500 mb-4">
          Özel fiyat girmediğin tüm ürünlere uygulanır. TL = USD × kur × (1 + marj%).
        </p>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kar Marjı %</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={saveMarkup}
            disabled={savingMarkup}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm"
          >
            {savingMarkup ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Arama */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); load(1, search); } }}
          placeholder="Ürün adı veya SKU ara..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => { setPage(1); load(1, search); }} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Ara</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(data?.products ?? []).map((p) => {
            const hasEdits = p.variants.some((v) => edits[v.variantId]);
            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{p.sku}</span>
                  </div>
                  <button
                    onClick={() => saveProduct(p)}
                    disabled={!hasEdits || savingProduct === p.id}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {savingProduct === p.id ? "..." : "Kaydet"}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left px-5 py-2">Renk / Beden</th>
                        <th className="text-right px-3 py-2">USD</th>
                        <th className="text-right px-3 py-2">Taban TL</th>
                        <th className="text-left px-3 py-2">Fiyatlandırma</th>
                        <th className="text-right px-5 py-2">Satış TL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {p.variants.map((v) => {
                        const mode = currentMode(v);
                        return (
                          <tr key={v.variantId}>
                            <td className="px-5 py-2 text-gray-700">
                              {[v.color, v.size !== "STD" ? v.size : null].filter(Boolean).join(" / ") || "-"}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500">${tl(v.usdPrice)}</td>
                            <td className="px-3 py-2 text-right text-gray-400">{tl(v.usdPrice * (data?.usdRate ?? 0))}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  value={mode}
                                  onChange={(e) => setEdit(v.variantId, { mode: e.target.value })}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                                >
                                  <option value="default">Varsayılan marj</option>
                                  <option value="percent">Yüzde %</option>
                                  <option value="manual">Manuel TL</option>
                                </select>
                                {mode !== "default" && (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={currentValue(v)}
                                    onChange={(e) => setEdit(v.variantId, { value: e.target.value })}
                                    placeholder={mode === "percent" ? "%" : "₺"}
                                    className="w-24 px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-2 text-right font-semibold text-gray-900">{tl(preview(v))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page <= 1}
                onClick={() => { const np = page - 1; setPage(np); load(np, search); }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
              >
                Önceki
              </button>
              <span className="text-sm text-gray-500">{page} / {data.meta.totalPages}</span>
              <button
                disabled={page >= data.meta.totalPages}
                onClick={() => { const np = page + 1; setPage(np); load(np, search); }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
