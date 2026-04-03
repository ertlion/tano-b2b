"use client";

import { useEffect, useState, useCallback } from "react";

interface Variant {
  id: number;
  size: string;
  color: string | null;
  barcode: string;
  stockQuantity: number;
  salePrice: string;
  customerPrice: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  color: string | null;
  images: string[];
  masterVariants: Variant[];
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  discountRate: number;
}

function formatPrice(value: string | number): string {
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ColorGroup = {
  color: string;
  variants: Variant[];
  totalStock: number;
};

function groupByColor(variants: Variant[]): ColorGroup[] {
  const map = new Map<string, Variant[]>();
  for (const v of variants) {
    const color = v.color || "Tek Renk";
    const arr = map.get(color);
    if (arr) arr.push(v);
    else map.set(color, [v]);
  }
  return Array.from(map.entries()).map(([color, variants]) => ({
    color,
    variants,
    totalStock: variants.reduce((s, v) => s + v.stockQuantity, 0),
  }));
}

export default function NewProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  // Expanded product & selected variants
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedColors, setExpandedColors] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Set<number>>(new Set());

  // Push state
  const [pushing, setPushing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/panel/products?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setProducts(json.data || []);
      setMeta(json.meta || null);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function toggleProduct(productId: number) {
    if (expandedId === productId) {
      setExpandedId(null);
      setExpandedColors(new Set());
      setSelectedVariants(new Set());
    } else {
      setExpandedId(productId);
      setExpandedColors(new Set());
      setSelectedVariants(new Set());
    }
  }

  function toggleColor(color: string) {
    setExpandedColors((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  function selectAllColor(variants: Variant[]) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      const inStock = variants.filter((v) => v.stockQuantity > 0);
      const allSelected = inStock.every((v) => next.has(v.id));
      if (allSelected) {
        for (const v of inStock) next.delete(v.id);
      } else {
        for (const v of inStock) next.add(v.id);
      }
      return next;
    });
  }

  function toggleVariant(variantId: number) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  function selectAllProduct(product: Product) {
    const inStock = product.masterVariants.filter((v) => v.stockQuantity > 0);
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      const allSelected = inStock.every((v) => next.has(v.id));
      if (allSelected) {
        for (const v of inStock) next.delete(v.id);
      } else {
        for (const v of inStock) next.add(v.id);
      }
      return next;
    });
    // Expand all colors
    const colors = groupByColor(product.masterVariants);
    setExpandedColors(new Set(colors.map((c) => c.color)));
  }

  async function handlePush() {
    if (selectedVariants.size === 0 || !expandedId) return;
    setPushing(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/panel/products/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: [expandedId],
          variantIds: Array.from(selectedVariants),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Aktarım başarısız");
      }

      setFeedback({ type: "success", msg: `${selectedVariants.size} varyant başarıyla aktarıldı` });
      setExpandedId(null);
      setSelectedVariants(new Set());
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Bir hata oluştu" });
    } finally {
      setPushing(false);
    }
  }

  // Filter out products with zero total stock
  const availableProducts = products.filter(
    (p) => p.masterVariants.some((v) => v.stockQuantity > 0)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Yeni Ürünler</h1>
        <p className="text-sm text-gray-500 mt-1">
          Katalogdan ürün seçin, renk ve beden varyantlarını belirleyip sitenize aktarın.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Ürün adı veya SKU ara..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg">
          Ara
        </button>
        {search && (
          <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }} className="px-3 py-2 text-sm text-gray-500">
            Temizle
          </button>
        )}
      </form>

      {/* Feedback */}
      {feedback && (
        <div className={`p-3 rounded-lg border text-sm ${
          feedback.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Product List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : availableProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-16 text-center">
          <p className="text-sm text-gray-500">
            {search ? "Aramanızla eşleşen stoklu ürün bulunamadı." : "Aktarılacak stoklu ürün bulunmuyor."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {availableProducts.map((product) => {
            const isExpanded = expandedId === product.id;
            const colorGroups = groupByColor(product.masterVariants);
            const totalStock = product.masterVariants.reduce((s, v) => s + v.stockQuantity, 0);
            const colorCount = colorGroups.length;
            const sizeCount = new Set(product.masterVariants.map((v) => v.size).filter((s) => s !== "STD")).size;

            return (
              <div key={product.id} className={`bg-white rounded-lg border transition-all ${isExpanded ? "border-blue-300 shadow-md" : "border-gray-200"}`}>
                {/* Product Header */}
                <button
                  onClick={() => toggleProduct(product.id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left"
                >
                  <div className="flex gap-3 min-w-0 flex-1">
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">{product.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 font-mono">{product.sku}</span>
                      {product.category && (
                        <span className="text-xs text-gray-400">· {product.category}</span>
                      )}
                      <span className="text-xs text-gray-500">{colorCount} renk</span>
                      {sizeCount > 0 && <span className="text-xs text-gray-500">{sizeCount} beden</span>}
                      <span className="text-xs text-green-600 font-medium">Stok: {totalStock}</span>
                    </div>
                  </div>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded: Color Groups */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 pb-5">
                    {/* Select All + Push Button */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <button
                        onClick={() => selectAllProduct(product)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {product.masterVariants.filter((v) => v.stockQuantity > 0).every((v) => selectedVariants.has(v.id))
                          ? "Tümünü Kaldır"
                          : "Tüm Stokluları Seç"}
                      </button>
                      {selectedVariants.size > 0 && (
                        <button
                          onClick={handlePush}
                          disabled={pushing}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {pushing ? "Aktarılıyor..." : `${selectedVariants.size} Varyant Aktar`}
                        </button>
                      )}
                    </div>

                    {/* Color Groups */}
                    <div className="space-y-1 mt-3">
                      {colorGroups.map((group) => {
                        const isColorExpanded = expandedColors.has(group.color);
                        const inStockVariants = group.variants.filter((v) => v.stockQuantity > 0);
                        const selectedInGroup = inStockVariants.filter((v) => selectedVariants.has(v.id)).length;

                        return (
                          <div key={group.color} className="border border-gray-100 rounded-lg overflow-hidden">
                            {/* Color Header */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer" onClick={() => toggleColor(group.color)}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllColor(group.variants);
                                }}
                                className={`w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors ${
                                  selectedInGroup === inStockVariants.length && inStockVariants.length > 0
                                    ? "bg-blue-600 border-blue-600 text-white"
                                    : selectedInGroup > 0
                                    ? "bg-blue-100 border-blue-300 text-blue-600"
                                    : "border-gray-300 text-transparent hover:border-gray-400"
                                }`}
                              >
                                ✓
                              </button>
                              <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs font-medium">
                                {group.color}
                              </span>
                              <span className="text-xs text-gray-500">
                                {group.variants.length} varyant · Stok: {group.totalStock}
                              </span>
                              {selectedInGroup > 0 && (
                                <span className="text-xs text-blue-600 font-medium">
                                  {selectedInGroup} seçili
                                </span>
                              )}
                              <svg className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${isColorExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>

                            {/* Variants Table */}
                            {isColorExpanded && (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-t border-gray-100 bg-white">
                                    <th className="w-10 px-4 py-2"></th>
                                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Beden</th>
                                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Barkod</th>
                                    <th className="text-right px-3 py-2 text-gray-500 font-medium">Fiyat</th>
                                    {meta && meta.discountRate > 0 && (
                                      <th className="text-right px-3 py-2 text-gray-500 font-medium">İsk. Fiyat</th>
                                    )}
                                    <th className="text-center px-3 py-2 text-gray-500 font-medium">Stok</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.variants.map((v) => {
                                    const outOfStock = v.stockQuantity === 0;
                                    return (
                                      <tr
                                        key={v.id}
                                        className={`border-t border-gray-50 ${outOfStock ? "opacity-30" : "hover:bg-blue-50/50"}`}
                                      >
                                        <td className="px-4 py-2 text-center">
                                          <input
                                            type="checkbox"
                                            disabled={outOfStock}
                                            checked={selectedVariants.has(v.id)}
                                            onChange={() => toggleVariant(v.id)}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-30"
                                          />
                                        </td>
                                        <td className="px-3 py-2 font-medium text-gray-900">{v.size}</td>
                                        <td className="px-3 py-2 text-gray-500 font-mono">{v.barcode}</td>
                                        <td className="px-3 py-2 text-right text-gray-900">{formatPrice(v.salePrice)} ₺</td>
                                        {meta && meta.discountRate > 0 && (
                                          <td className="px-3 py-2 text-right text-green-700 font-semibold">{formatPrice(v.customerPrice)} ₺</td>
                                        )}
                                        <td className="px-3 py-2 text-center">
                                          {outOfStock ? (
                                            <span className="text-red-400">Tükendi</span>
                                          ) : (
                                            <span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">{v.stockQuantity}</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Sayfa {meta.page} / {meta.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">
              Önceki
            </button>
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
