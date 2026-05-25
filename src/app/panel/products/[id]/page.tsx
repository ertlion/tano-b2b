"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Variant {
  id: number;
  size: string;
  color: string | null;
  barcode: string;
  sku: string;
  stockQuantity: number;
  salePrice: string;
  customerPrice: string;
  costPrice: string;
  images: string[];
}

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  brand: string;
  material: string | null;
  description: string | null;
  images: string[];
  masterVariants: Variant[];
}

interface Opt { id: string; label: string }
interface Presets { scenes: Opt[]; models: Opt[]; angles: Opt[] }
interface Generated { id: number; url: string }

function formatPrice(value: string | number): string {
  return Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PanelProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [discountRate, setDiscountRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // AI görsel
  const [presets, setPresets] = useState<Presets | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sceneId, setSceneId] = useState("");
  const [modelId, setModelId] = useState("");
  const [angleId, setAngleId] = useState("");
  const [count, setCount] = useState("1");
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [generated, setGenerated] = useState<Generated[]>([]);

  const loadGenerated = useCallback(() => {
    fetch(`/api/panel/images?masterProductId=${productId}`)
      .then((r) => r.json()).then((j) => setGenerated(j.data || [])).catch(() => {});
  }, [productId]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/panel/products/${productId}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setProduct(json.data);
        setDiscountRate(json.meta?.discountRate ?? 0);
      } catch {
        setError("Ürün yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    load();
    fetch("/api/panel/images/presets").then((r) => r.json()).then((j) => {
      if (j.data) { setPresets(j.data); setSceneId(j.data.scenes[0]?.id || ""); setModelId(j.data.models[0]?.id || ""); setAngleId(j.data.angles[0]?.id || ""); }
    }).catch(() => {});
    loadGenerated();
  }, [productId, loadGenerated]);

  function toggle(url: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(url)) n.delete(url); else n.add(url);
      return n;
    });
  }

  async function generate() {
    if (selected.size === 0) return;
    setGenBusy(true); setGenMsg("");
    try {
      const res = await fetch("/api/panel/images/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterProductId: Number(productId),
          sourceImageUrls: Array.from(selected),
          sceneId, modelId, angleId, count: Number(count),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Üretilemedi");
      setGenMsg(`${j.data.produced} görsel üretildi, ürünlerinize kaydedildi.${j.data.failed ? ` ${j.data.failed} başarısız (iade edildi).` : ""}`);
      setSelected(new Set());
      loadGenerated();
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setGenBusy(false);
    }
  }

  async function delGenerated(id: number) {
    await fetch(`/api/panel/images/${id}`, { method: "DELETE" });
    setGenerated((g) => g.filter((x) => x.id !== id));
  }

  if (loading) {
    return <div className="space-y-4"><div className="h-8 bg-gray-200 rounded w-64 animate-pulse" /><div className="h-64 bg-gray-100 rounded animate-pulse" /></div>;
  }
  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link href="/panel/products" className="text-sm text-blue-600 hover:text-blue-700">← Kataloğa Dön</Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  // Görselleri renge göre grupla (varyant görselleri + ürün görselleri)
  const imageGroups = new Map<string, string[]>();
  for (const v of product.masterVariants) {
    const color = v.color || "Tek Renk";
    const arr = imageGroups.get(color) || [];
    for (const img of v.images || []) if (!arr.includes(img)) arr.push(img);
    imageGroups.set(color, arr);
  }
  // Hiç varyant görseli yoksa ürün görsellerini "Genel" altında göster
  const hasVariantImages = Array.from(imageGroups.values()).some((a) => a.length > 0);
  if (!hasVariantImages && product.images.length > 0) {
    imageGroups.clear();
    imageGroups.set("Ürün Görselleri", product.images);
  }
  const imageEntries = Array.from(imageGroups.entries()).filter(([, a]) => a.length > 0);

  // Variants by color (tablo)
  const colorGroups = new Map<string, Variant[]>();
  for (const v of product.masterVariants) {
    const color = v.color || "Tek Renk";
    const e = colorGroups.get(color);
    if (e) e.push(v); else colorGroups.set(color, [v]);
  }
  const totalStock = product.masterVariants.reduce((s, v) => s + v.stockQuantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/panel/products" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">SKU: {product.sku}{product.brand && ` · ${product.brand}`}</p>
        </div>
      </div>

      {/* Görseller + AI üretim */}
      {imageEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-gray-900">Görseller</h2>
            <span className="text-xs text-gray-500">{selected.size} seçili</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Görselleri seçin, aşağıdan mekan/manken/açı belirleyip <b>bu görsellerle yeni görsel üretin</b>. Üretilenler ürününüze kaydedilir ve mağazanıza gönderebilirsiniz.</p>

          {imageEntries.map(([color, imgs]) => (
            <div key={color} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-800">{color}</span>
                <span className="text-xs text-gray-400">{imgs.length} görsel</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {imgs.map((img, i) => {
                  const sel = selected.has(img);
                  return (
                    <button key={i} onClick={() => toggle(img)} className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 ${sel ? "border-blue-600" : "border-gray-200"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      {sel && <span className="absolute top-1 right-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Üretim paneli */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            {genMsg && <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-200 text-blue-700 text-sm">{genMsg}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mekan</label>
                <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">{presets?.scenes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Manken</label>
                <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">{presets?.models.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Açı</label>
                <select value={angleId} onChange={(e) => setAngleId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">{presets?.angles.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Adet</label>
                <input type="number" min="1" max="10" value={count} onChange={(e) => setCount(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <button onClick={generate} disabled={genBusy || selected.size === 0} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
              {genBusy ? "Üretiliyor..." : `Seçili ${selected.size} görselle üret`}
            </button>
          </div>
        </div>
      )}

      {/* Oluşturduğum görseller */}
      {generated.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Oluşturduğum Görseller</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {generated.map((g) => (
              <div key={g.id} className="relative aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => delGenerated(g.id)} className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Kategori</p><p className="text-sm font-medium text-gray-900 mt-1">{product.category || "-"}{product.subcategory ? ` / ${product.subcategory}` : ""}</p></div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Renk Sayısı</p><p className="text-sm font-medium text-gray-900 mt-1">{colorGroups.size}</p></div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Toplam Stok</p><p className={`text-sm font-medium mt-1 ${totalStock > 0 ? "text-green-600" : "text-red-500"}`}>{totalStock} adet</p></div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Varyant</p><p className="text-sm font-medium text-gray-900 mt-1">{product.masterVariants.length}</p></div>
      </div>

      {/* Variants by Color */}
      {Array.from(colorGroups.entries()).map(([color, variants]) => {
        const groupStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
        return (
          <div key={color} className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-gray-900">{color}</h2><span className="text-xs text-gray-500">({variants.length} beden)</span></div>
              <span className={`text-sm font-medium ${groupStock > 0 ? "text-green-600" : "text-red-500"}`}>Stok: {groupStock}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-2.5 text-xs font-medium text-gray-500">Beden</th>
                  <th className="text-left px-6 py-2.5 text-xs font-medium text-gray-500">Barkod</th>
                  <th className="text-right px-6 py-2.5 text-xs font-medium text-gray-500">Tano Fiyatı</th>
                  {discountRate > 0 && <th className="text-right px-6 py-2.5 text-xs font-medium text-gray-500">Fiyatınız (%{discountRate})</th>}
                  <th className="text-center px-6 py-2.5 text-xs font-medium text-gray-500">Stok</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map((v) => (
                    <tr key={v.id} className={v.stockQuantity === 0 ? "opacity-40" : "hover:bg-gray-50"}>
                      <td className="px-6 py-2.5 font-medium text-gray-900">{v.size}</td>
                      <td className="px-6 py-2.5 text-gray-500 font-mono text-xs">{v.barcode}</td>
                      <td className="px-6 py-2.5 text-right text-gray-900">{formatPrice(v.salePrice)} ₺</td>
                      {discountRate > 0 && <td className="px-6 py-2.5 text-right text-green-700 font-semibold">{formatPrice(v.customerPrice)} ₺</td>}
                      <td className="px-6 py-2.5 text-center">
                        {v.stockQuantity > 0 ? <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">{v.stockQuantity}</span> : <span className="inline-block px-2 py-0.5 bg-red-100 text-red-500 rounded text-xs font-medium">Tükendi</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
