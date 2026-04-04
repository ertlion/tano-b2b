"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SalesPeriod {
  revenue: number;
  cost: number;
  profit: number;
  orders?: number;
}

interface DashboardData {
  catalogProducts: number;
  pushedProducts: number;
  discountRate: number;
  totalOrders: number;
  pendingOrders: number;
  sales: {
    today: SalesPeriod;
    month: SalesPeriod;
    total: SalesPeriod;
  };
  recentOrders: Array<{
    id: number;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
  }>;
}

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  preparing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Yeni",
  processing: "İşleniyor",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
};

function formatMoney(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PanelDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/panel/dashboard");
        if (!res.ok) throw new Error();
        const json = await res.json();
        setData(json.data);
      } catch {
        setError("Dashboard verileri yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Aktarılan Ürün</p>
          <p className="text-2xl font-bold text-gray-900">{data.pushedProducts}</p>
          <p className="text-xs text-gray-400 mt-1">/ {data.catalogProducts} katalog</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">İskonto Oranı</p>
          <p className="text-2xl font-bold text-blue-600">{data.discountRate > 0 ? `%${data.discountRate}` : "-"}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Toplam Sipariş</p>
          <p className="text-2xl font-bold text-gray-900">{data.totalOrders}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Bekleyen Sipariş</p>
          <p className="text-2xl font-bold text-yellow-600">{data.pendingOrders}</p>
        </div>
      </div>

      {/* Sales Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Bugün</h3>
            {data.sales.today.orders !== undefined && (
              <span className="text-xs text-gray-400">{data.sales.today.orders} sipariş</span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Satış</span>
              <span className="text-sm font-semibold text-gray-900">{formatMoney(data.sales.today.revenue)} ₺</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Maliyet</span>
              <span className="text-sm font-medium text-red-600">{formatMoney(data.sales.today.cost)} ₺</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Kâr</span>
              <span className={`text-sm font-bold ${data.sales.today.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatMoney(data.sales.today.profit)} ₺
              </span>
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Bu Ay</h3>
            {data.sales.month.orders !== undefined && (
              <span className="text-xs text-gray-400">{data.sales.month.orders} sipariş</span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Satış</span>
              <span className="text-sm font-semibold text-gray-900">{formatMoney(data.sales.month.revenue)} ₺</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Maliyet</span>
              <span className="text-sm font-medium text-red-600">{formatMoney(data.sales.month.cost)} ₺</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Kâr</span>
              <span className={`text-sm font-bold ${data.sales.month.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatMoney(data.sales.month.profit)} ₺
              </span>
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Toplam</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Satış</span>
              <span className="text-sm font-semibold text-gray-900">{formatMoney(data.sales.total.revenue)} ₺</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Maliyet</span>
              <span className="text-sm font-medium text-red-600">{formatMoney(data.sales.total.cost)} ₺</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Kâr</span>
              <span className={`text-sm font-bold ${data.sales.total.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatMoney(data.sales.total.profit)} ₺
              </span>
            </div>
            {data.sales.total.revenue > 0 && (
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-gray-400">Kâr Marjı</span>
                <span className="text-xs font-medium text-gray-500">
                  %{((data.sales.total.profit / data.sales.total.revenue) * 100).toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Son Siparişler</h2>
          <Link href="/panel/orders" className="text-sm text-blue-600 hover:text-blue-700">
            Tümünü Gör
          </Link>
        </div>

        {data.recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">Henüz sipariş bulunmuyor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sipariş No</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Müşteri</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/panel/orders/${order.id}`} className="text-blue-600 hover:text-blue-700 font-medium">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                    <td className="px-6 py-3 text-right text-gray-900 font-medium">
                      {formatMoney(Number(order.totalAmount))} ₺
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
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
