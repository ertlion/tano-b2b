"use client";

import { useEffect, useState, useCallback } from "react";

interface NewProduct {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  material: string | null;
  sizes: string[];
  priceRange: { min: number; max: number };
  totalStock: number;
}

interface Category {
  id: string;
  name: string;
  parentId?: string;
}

interface NewProductsResponse {
  products: NewProduct[];
  total: number;
}

export default function NewProductsPage() {
  const [data, setData] = useState<NewProductsResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Push modal state
  const [pushModalProduct, setPushModalProduct] = useState<NewProduct | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // Bulk push
  const [bulkPushing, setBulkPushing] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [showBulkModal, setShowBulkModal] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/panel/products?tab=new");
      if (!res.ok) throw new Error("Urunler yuklenemedi");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Yeni urunler yuklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/panel/categories");
      if (!res.ok) return;
      const json = await res.json();
      setCategories(json.categories || []);
    } catch {
      // Categories might not be available yet
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selectedIds.size === data.products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.products.map((p) => p.id)));
    }
  }

  async function handlePush(productId: number, categoryMapping: string) {
    setPushing(true);
    setPushError(null);
    setPushSuccess(null);

    try {
      const res = await fetch("/api/panel/products/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: [productId],
          categoryMapping,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Aktarim basarisiz");
      }

      setPushSuccess("Urun basariyla aktarildi");
      setPushModalProduct(null);
      setSelectedCategory("");

      // Remove from list
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          products: prev.products.filter((p) => p.id !== productId),
          total: prev.total - 1,
        };
      });

      setTimeout(() => setPushSuccess(null), 3000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setPushing(false);
    }
  }

  async function handleBulkPush() {
    if (selectedIds.size === 0) return;
    setBulkPushing(true);
    setPushError(null);
    setPushSuccess(null);

    try {
      const res = await fetch("/api/panel/products/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: Array.from(selectedIds),
          categoryMapping: bulkCategory,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Toplu aktarim basarisiz");
      }

      setPushSuccess(`${selectedIds.size} urun basariyla aktarildi`);
      setShowBulkModal(false);
      setBulkCategory("");

      // Remove from list
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          products: prev.products.filter((p) => !selectedIds.has(p.id)),
          total: prev.total - selectedIds.size,
        };
      });
      setSelectedIds(new Set());

      setTimeout(() => setPushSuccess(null), 3000);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setBulkPushing(false);
    }
  }

  function formatPrice(value: number) {
    return value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Yeni Urunler</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
              <div className="flex gap-2 mb-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-6 w-8 bg-gray-100 rounded" />
                ))}
              </div>
              <div className="h-10 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Yeni Urunler</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const products = data?.products || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yeni Urunler</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tano katalogundan sitenize aktarilmamis urunler
          </p>
        </div>
        {products.length > 0 && selectedIds.size > 0 && (
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Secilenleri Aktar ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-800">
          Urun gorselleri sitenize aktarilmaz. Gorselleri kendi panelinizden eklemeniz gerekir.
        </p>
      </div>

      {/* Feedback messages */}
      {pushSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
          {pushSuccess}
        </div>
      )}
      {pushError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {pushError}
        </div>
      )}

      {/* Select All */}
      {products.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === products.length && products.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              Tumunu Sec ({products.length} urun)
            </span>
          </label>
        </div>
      )}

      {/* Product Grid */}
      {products.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-16 text-center">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-gray-500 text-sm mb-1">Tum urunler aktarildi!</p>
          <p className="text-gray-400 text-xs">Yeni urunler eklendiginde burada gorunecektir.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className={`bg-white rounded-xl shadow-sm border transition-all ${
                selectedIds.has(product.id)
                  ? "border-blue-300 ring-1 ring-blue-200"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="p-5">
                {/* Checkbox + Name */}
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    className="w-4 h-4 mt-1 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{product.sku}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {(product.category || product.subcategory) && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span className="text-xs text-gray-500">
                        {[product.category, product.subcategory].filter(Boolean).join(" / ")}
                      </span>
                    </div>
                  )}

                  {product.color && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                      <span className="text-xs text-gray-500">{product.color}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-gray-500">
                      {product.priceRange.min === product.priceRange.max
                        ? `${formatPrice(product.priceRange.min)} TL`
                        : `${formatPrice(product.priceRange.min)} - ${formatPrice(product.priceRange.max)} TL`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span className="text-xs text-gray-500">
                      Stok: {product.totalStock}
                    </span>
                  </div>
                </div>

                {/* Sizes */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {product.sizes.map((size) => (
                    <span
                      key={size}
                      className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium"
                    >
                      {size}
                    </span>
                  ))}
                </div>

                {/* Action */}
                <button
                  onClick={() => {
                    setPushModalProduct(product);
                    setSelectedCategory("");
                    setPushError(null);
                  }}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Siteme Aktar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single Push Modal */}
      {pushModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setPushModalProduct(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Urunu Aktar</h3>
            <p className="text-sm text-gray-500 mb-4">{pushModalProduct.name}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Kategori Eslestirme
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Urunun sitenizde hangi kategoride gorunecegini secin.
                </p>
                {categories.length > 0 ? (
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">Kategori secin...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    placeholder="Kategori adi girin..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>

              {pushError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs">
                  {pushError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setPushModalProduct(null)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg text-sm transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={() => handlePush(pushModalProduct.id, selectedCategory)}
                disabled={pushing}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
              >
                {pushing ? "Aktariliyor..." : "Aktar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Push Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Toplu Aktarim
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {selectedIds.size} urun secildi. Tumu ayni kategoriye aktarilacak.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Kategori Eslestirme
                </label>
                {categories.length > 0 ? (
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">Kategori secin...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    placeholder="Kategori adi girin..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>

              {pushError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs">
                  {pushError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg text-sm transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={handleBulkPush}
                disabled={bulkPushing}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
              >
                {bulkPushing ? "Aktariliyor..." : `${selectedIds.size} Urun Aktar`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
