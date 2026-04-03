"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Variant {
  id: number;
  size: string;
  barcode: string;
  sku: string;
  stockQuantity: number;
  costPrice: string;
  salePrice: string;
}

interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  material: string | null;
  status: string;
  images: string[];
  masterVariants: Variant[];
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    subcategory: "",
    status: "active",
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/products/${productId}`);
        if (!res.ok) throw new Error("Ürün bulunamadı");
        const json = await res.json();
        const data = json.data;
        setProduct(data);
        setForm({
          name: data.name || "",
          description: data.description || "",
          category: data.category || "",
          subcategory: data.subcategory || "",
          status: data.status || "active",
        });
      } catch {
        setError("Ürün yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kayıt başarısız");
      }

      setSuccess("Ürün başarıyla güncellendi");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="space-y-6">
        <Link href="/admin/products" className="text-blue-600 hover:text-blue-700 text-sm">
          &larr; Ürünlere Don
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/products" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-500">SKU: {product.sku}</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      {/* Product Info Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ürün Bilgileri</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Adı</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alt Kategori</label>
            <input
              type="text"
              value={form.subcategory}
              onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marka</label>
            <input
              type="text"
              value={product.brand}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="active">Aktif</option>
              <option value="inactive">Pasif</option>
              <option value="draft">Taslak</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Variants Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Varyantlar ({product.masterVariants.length})
          </h2>
        </div>

        {product.masterVariants.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            Bu ürüne ait varyant bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Beden</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Barkod</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stok</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Maliyet</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Satis Fiyati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {product.masterVariants.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">{v.size}</td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs">{v.barcode}</td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs">{v.sku}</td>
                    <td className={`px-6 py-3 text-center font-medium ${v.stockQuantity === 0 ? "text-red-600" : v.stockQuantity < 5 ? "text-yellow-600" : "text-gray-900"}`}>
                      {v.stockQuantity}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {Number(v.costPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900 font-medium">
                      {Number(v.salePrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                    </td>
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
