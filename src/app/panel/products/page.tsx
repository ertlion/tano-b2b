"use client";

import { useEffect, useState, useCallback } from "react";

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

export default function PanelProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

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

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
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
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setPage(1);
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Temizle
          </button>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm text-gray-500">
              {search ? "Aramanızla eşleşen ürün bulunamadı." : "Katalogda henüz ürün bulunmuyor."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Renk</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bedenler</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tano Fiyatı</th>
                  {meta && meta.discountRate > 0 && (
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">İskontolu Fiyat</th>
                  )}
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => {
                  const totalStock = product.masterVariants.reduce(
                    (sum, v) => sum + (v.stockQuantity || 0),
                    0
                  );
                  // Use first variant's salePrice as representative price
                  const firstVariant = product.masterVariants[0];
                  const salePrice = firstVariant ? firstVariant.salePrice : "0";
                  const customerPrice = firstVariant ? firstVariant.customerPrice : "0";
                  const sizes = product.masterVariants.map((v) => v.size);

                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-gray-900 font-medium">{product.name}</p>
                        {product.category && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {product.category}
                            {product.subcategory ? ` / ${product.subcategory}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500 font-mono text-xs">{product.sku}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{product.color || "-"}</td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sizes.map((size) => (
                            <span
                              key={size}
                              className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                            >
                              {size}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                        {formatPrice(salePrice)} &#8378;
                      </td>
                      {meta && meta.discountRate > 0 && (
                        <td className="px-6 py-3 text-right text-green-700 font-semibold whitespace-nowrap">
                          {formatPrice(customerPrice)} &#8378;
                        </td>
                      )}
                      <td className="px-6 py-3 text-center">
                        <span className={`font-medium ${totalStock > 0 ? "text-gray-900" : "text-red-500"}`}>
                          {totalStock}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
