"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface VariantRow {
  key: string;
  id?: number;
  size: string;
  barcode: string;
  color: string;
  costPrice: string;
  salePrice: string;
  stock: string;
  _delete?: boolean;
}

function createEmptyVariant(): VariantRow {
  return {
    key: Math.random().toString(36).slice(2),
    size: "",
    barcode: "",
    color: "",
    costPrice: "",
    salePrice: "",
    stock: "",
  };
}

interface ApiVariant {
  id: number;
  size: string;
  barcode: string;
  sku: string;
  color: string | null;
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
  masterVariants: ApiVariant[];
}

export default function EditProductPage() {
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    category: "",
    subcategory: "",
    color: "",
    material: "",
    description: "",
    status: "active",
  });

  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/products/${productId}`);
        if (!res.ok) throw new Error("Urun bulunamadi");
        const json = await res.json();
        const data = json.data as Product;

        setForm({
          name: data.name || "",
          sku: data.sku || "",
          barcode: data.barcode || "",
          category: data.category || "",
          subcategory: data.subcategory || "",
          color: data.color || "",
          material: data.material || "",
          description: data.description || "",
          status: data.status || "active",
        });

        setImages(data.images || []);

        setVariants(
          data.masterVariants.map((v) => ({
            key: String(v.id),
            id: v.id,
            size: v.size,
            barcode: v.barcode,
            color: v.color || "",
            costPrice: String(Number(v.costPrice)),
            salePrice: String(Number(v.salePrice)),
            stock: String(v.stockQuantity),
          }))
        );
      } catch {
        setError("Urun yuklenemedi");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  function updateVariant(index: number, field: keyof VariantRow, value: string) {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeVariant(index: number) {
    setVariants((prev) => {
      const v = prev[index];
      if (v.id) {
        // Mark existing variant for deletion
        const next = [...prev];
        next[index] = { ...next[index], _delete: true };
        return next;
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function addVariant() {
    setVariants((prev) => [...prev, createEmptyVariant()]);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/admin/products/${productId}/images`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gorsel yuklenemedi");

      setImages(json.data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gorsel yuklenirken hata olustu");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleImageDelete(index: number) {
    if (!window.confirm("Bu gorseli silmek istediginize emin misiniz?")) return;
    setError("");

    try {
      const res = await fetch(`/api/admin/products/${productId}/images?index=${index}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gorsel silinemedi");

      setImages(json.data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gorsel silinirken hata olustu");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name,
        description: form.description,
        category: form.category,
        subcategory: form.subcategory,
        color: form.color,
        material: form.material,
        status: form.status,
        variants: variants.map((v) => ({
          id: v.id,
          size: v.size.trim(),
          barcode: v.barcode.trim(),
          color: v.color.trim() || null,
          costPrice: parseFloat(v.costPrice) || 0,
          salePrice: parseFloat(v.salePrice) || 0,
          stock: parseInt(v.stock) || 0,
          _delete: v._delete || false,
        })),
      };

      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Kayit basarisiz");
      }

      window.location.href = `/admin/products/${productId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata olustu");
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

  if (error && !form.name) {
    return (
      <div className="space-y-6">
        <Link href="/admin/products" className="text-blue-600 hover:text-blue-700 text-sm">
          &larr; Urunlere Don
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const visibleVariants = variants.filter((v) => !v._delete);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/products/${productId}`} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Urun Duzenle</h1>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Product Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Urun Bilgileri</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Urun Adi *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input
                type="text"
                value={form.sku}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barkod</label>
              <input
                type="text"
                value={form.barcode}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Renk</label>
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Malzeme</label>
              <input
                type="text"
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Gorseller ({images.length}/5)
            </h2>
            {images.length < 5 && (
              <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {uploading ? "Yukleniyor..." : "Gorsel Ekle"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {images.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              Henuz gorsel eklenmemis.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  <img
                    src={img}
                    alt={`Gorsel ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleImageDelete(i)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                    title="Gorseli sil"
                  >
                    X
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded">
                      Ana
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variants */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Varyantlar ({visibleVariants.length})
            </h2>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Varyant Ekle
            </button>
          </div>

          {visibleVariants.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500 text-sm">
              Henuz varyant bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Beden</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Renk</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Barkod</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Maliyet</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Satis Fiyati</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stok</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {variants.map((v, i) =>
                    v._delete ? null : (
                      <tr key={v.key}>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={v.size}
                            onChange={(e) => updateVariant(i, "size", e.target.value)}
                            placeholder="S, M, L..."
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={v.color}
                            onChange={(e) => updateVariant(i, "color", e.target.value)}
                            placeholder="Renk"
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={v.barcode}
                            onChange={(e) => updateVariant(i, "barcode", e.target.value)}
                            placeholder="Barkod"
                            className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.costPrice}
                            onChange={(e) => updateVariant(i, "costPrice", e.target.value)}
                            placeholder="0.00"
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.salePrice}
                            onChange={(e) => updateVariant(i, "salePrice", e.target.value)}
                            placeholder="0.00"
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            value={v.stock}
                            onChange={(e) => updateVariant(i, "stock", e.target.value)}
                            placeholder="0"
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removeVariant(i)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Varyanti sil"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end gap-3">
          <Link
            href={`/admin/products/${productId}`}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Iptal
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
