"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  status: string;
  variantCount: number;
  totalStock: number;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  inactive: "Pasif",
  draft: "Taslak",
};

export default function ProductsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const limit = 20;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (status) params.set("status", status);

      const res = await fetch(`/api/admin/products?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);

      if (json.categories) {
        setCategories(json.categories);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, category, status]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    setPage(1);
  }, [search, category, status]);

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Urunler</h1>
        <Link
          href="/admin/products/import"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Excel Import
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Urun ara (ad, SKU, barkod)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">Tum Kategoriler</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            <option value="">Tum Durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
            <option value="draft">Taslak</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data || data.products.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500 text-sm">Urun bulunamadi.</p>
            <p className="text-gray-400 text-xs mt-1">Excel dosyasi yukleyerek urun ekleyebilirsiniz.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Urun Adi</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kategori</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Varyant</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stok</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.products.map((product) => (
                    <tr
                      key={product.id}
                      onClick={() => router.push(`/admin/products/${product.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3 text-gray-900 font-medium">{product.name}</td>
                      <td className="px-6 py-3 text-gray-500 font-mono text-xs">{product.sku}</td>
                      <td className="px-6 py-3 text-gray-600">{product.category || "-"}</td>
                      <td className="px-6 py-3 text-center text-gray-600">{product.variantCount}</td>
                      <td className="px-6 py-3 text-center text-gray-600">{product.totalStock}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[product.status] || "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[product.status] || product.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Toplam {data.total} urun
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Onceki
                  </button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
