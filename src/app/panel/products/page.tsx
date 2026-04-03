"use client";

import { useEffect, useState, useCallback } from "react";
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
}

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  subcategory: string | null;
  color: string | null;
  brand: string;
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

function getUniqueColors(variants: Variant[]): string[] {
  const colors = new Set<string>();
  for (const v of variants) {
    if (v.color) colors.add(v.color);
  }
  return Array.from(colors);
}

function getUniqueSizes(variants: Variant[]): string[] {
  const sizes = new Set<string>();
  for (const v of variants) {
    if (v.size && v.size !== "STD") sizes.add(v.size);
  }
  return Array.from(sizes);
}

export default function PanelProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [hideOutOfStock, setHideOutOfStock] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/panel/products?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setProducts(json.data || []);
      setMeta(json.meta || null);
    } catch {
      setProducts([]);
      setMeta(null);
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

  const filteredProducts = hideOutOfStock
    ? products.filter((p) => p.masterVariants.some((v) => v.stockQuantity > 0))
    : products;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ürün Kataloğu</h1>
          {meta && meta.discountRate > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              İskonto oranınız: <span className="font-medium text-blue-600">%{meta.discountRate}</span>
            </p>
          )}
        </div>
        {meta && (
          <p className="text-sm text-gray-500">{meta.total} ürün</p>
        )}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Ürün adı veya SKU ara..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Ara
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Temizle
            </button>
          )}
        </form>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideOutOfStock}
            onChange={(e) => setHideOutOfStock(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Stoksuzları gizle
        </label>
      </div>

      {/* Product Cards */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm text-gray-500">
              {search ? "Aramanızla eşleşen ürün bulunamadı." : "Katalogda henüz ürün bulunmuyor."}
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const totalStock = product.masterVariants.reduce((s, v) => s + v.stockQuantity, 0);
            const colors = getUniqueColors(product.masterVariants);
            const sizes = getUniqueSizes(product.masterVariants);
            const firstVariant = product.masterVariants[0];
            const isOutOfStock = totalStock === 0;

            return (
              <Link
                key={product.id}
                href={`/panel/products/${product.id}`}
                className={`block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all ${
                  isOutOfStock ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Image + Info */}
                  <div className="flex gap-3 flex-1 min-w-0">
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover border border-gray-200 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{product.name}</h3>
                      {isOutOfStock && (
                        <span className="shrink-0 px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">
                          Tükendi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {product.sku}
                      {product.category ? ` · ${product.category}` : ""}
                    </p>

                    {/* Colors */}
                    {colors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {colors.map((color) => (
                          <span
                            key={color}
                            className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs"
                          >
                            {color}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Sizes */}
                    {sizes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {sizes.map((size) => (
                          <span
                            key={size}
                            className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {size}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Right: Price + Stock */}
                  <div className="text-right shrink-0">
                    {firstVariant && (
                      <>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(firstVariant.salePrice)} ₺
                        </p>
                        {meta && meta.discountRate > 0 && (
                          <p className="text-sm font-bold text-green-600">
                            {formatPrice(firstVariant.customerPrice)} ₺
                          </p>
                        )}
                      </>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Stok: <span className={`font-medium ${totalStock > 0 ? "text-gray-900" : "text-red-500"}`}>{totalStock}</span>
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Sayfa {meta.page} / {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
