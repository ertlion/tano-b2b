"use client";

import { useEffect, useState, useCallback } from "react";

interface Product {
  id: number;
  masterProductId: number;
  name: string;
  sku: string;
  category: string | null;
  sizes: string[];
  totalStock: number;
  status: string;
  syncedAt: string | null;
}

interface ProductsResponse {
  products: Product[];
  total: number;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  synced: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  synced: "Senkronize",
  pending: "Bekliyor",
  error: "Hata",
};

type Tab = "active" | "all";

export default function PanelProductsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      const res = await fetch(`/api/panel/products?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Urunlerim</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "active"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Aktif Urunlerim
        </button>
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "all"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Tum Urunlerim
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data || data.products.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm text-gray-500 mb-1">Henuz urun bulunmuyor.</p>
            <p className="text-xs text-gray-400">
              Yeni urunler sayfasindan urunleri sitenize aktarabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Urun Adi</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Bedenler</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stok</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="text-gray-900 font-medium">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs">{product.sku}</td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {product.sizes.map((size) => (
                          <span
                            key={size}
                            className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            {size}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center text-gray-900">{product.totalStock}</td>
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
        )}
      </div>
    </div>
  );
}
