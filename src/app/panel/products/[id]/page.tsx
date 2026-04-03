"use client";

import { useEffect, useState } from "react";
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

function formatPrice(value: string | number): string {
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PanelProductDetailPage() {
  const params = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [discountRate, setDiscountRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/panel/products/${params.id}`);
        if (!res.ok) throw new Error("Ürün bulunamadı");
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
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded w-64 animate-pulse" />
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Link href="/panel/products" className="text-sm text-blue-600 hover:text-blue-700">
          ← Kataloğa Dön
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  // Group variants by color
  const colorGroups = new Map<string, Variant[]>();
  for (const v of product.masterVariants) {
    const color = v.color || "Tek Renk";
    const existing = colorGroups.get(color);
    if (existing) {
      existing.push(v);
    } else {
      colorGroups.set(color, [v]);
    }
  }

  const totalStock = product.masterVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const inStockVariants = product.masterVariants.filter((v) => v.stockQuantity > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/panel/products" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            SKU: {product.sku}
            {product.brand && ` · ${product.brand}`}
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Kategori</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {product.category || "-"}
            {product.subcategory ? ` / ${product.subcategory}` : ""}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Renk Sayısı</p>
          <p className="text-sm font-medium text-gray-900 mt-1">{colorGroups.size}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Toplam Stok</p>
          <p className={`text-sm font-medium mt-1 ${totalStock > 0 ? "text-green-600" : "text-red-500"}`}>
            {totalStock} adet
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Stoklu Varyant</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {inStockVariants.length} / {product.masterVariants.length}
          </p>
        </div>
      </div>

      {product.material && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Kumaş / Malzeme</p>
          <p className="text-sm text-gray-900">{product.material}</p>
        </div>
      )}

      {/* Variants by Color */}
      {Array.from(colorGroups.entries()).map(([color, variants]) => {
        const groupStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
        return (
          <div key={color} className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{color}</h2>
                <span className="text-xs text-gray-500">({variants.length} beden)</span>
              </div>
              <span className={`text-sm font-medium ${groupStock > 0 ? "text-green-600" : "text-red-500"}`}>
                Stok: {groupStock}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-2.5 text-xs font-medium text-gray-500">Beden</th>
                    <th className="text-left px-6 py-2.5 text-xs font-medium text-gray-500">Barkod</th>
                    <th className="text-right px-6 py-2.5 text-xs font-medium text-gray-500">Tano Fiyatı</th>
                    {discountRate > 0 && (
                      <th className="text-right px-6 py-2.5 text-xs font-medium text-gray-500">
                        Fiyatınız (%{discountRate} isk.)
                      </th>
                    )}
                    <th className="text-center px-6 py-2.5 text-xs font-medium text-gray-500">Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map((v) => (
                    <tr
                      key={v.id}
                      className={v.stockQuantity === 0 ? "opacity-40" : "hover:bg-gray-50"}
                    >
                      <td className="px-6 py-2.5 font-medium text-gray-900">{v.size}</td>
                      <td className="px-6 py-2.5 text-gray-500 font-mono text-xs">{v.barcode}</td>
                      <td className="px-6 py-2.5 text-right text-gray-900">{formatPrice(v.salePrice)} ₺</td>
                      {discountRate > 0 && (
                        <td className="px-6 py-2.5 text-right text-green-700 font-semibold">
                          {formatPrice(v.customerPrice)} ₺
                        </td>
                      )}
                      <td className="px-6 py-2.5 text-center">
                        {v.stockQuantity > 0 ? (
                          <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                            {v.stockQuantity}
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 bg-red-100 text-red-500 rounded text-xs font-medium">
                            Tükendi
                          </span>
                        )}
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
