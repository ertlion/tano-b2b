"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  stats: {
    totalProducts: number;
    totalStock: number;
    activeCustomers: number;
    pendingApproval: number;
    totalOrders: number;
    pendingOrders: number;
  };
  recentOrders: Array<{
    id: number;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
    status: string;
    createdAt: string;
    tenantCompany: string;
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
  processing: "Isleniyor",
  preparing: "Hazirlaniyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "Iptal",
};

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("Veri alinamadi");
        const json = await res.json();
        const d = json.data || json;
        setData({
          stats: {
            totalProducts: d.totalProducts ?? d.stats?.totalProducts ?? 0,
            totalStock: d.totalStock ?? d.stats?.totalStock ?? 0,
            activeCustomers: d.activeTenants ?? d.stats?.activeCustomers ?? 0,
            pendingApproval: d.pendingTenants ?? d.stats?.pendingApproval ?? 0,
            totalOrders: d.totalOrders ?? d.stats?.totalOrders ?? 0,
            pendingOrders: d.pendingOrders ?? d.stats?.pendingOrders ?? 0,
          },
          recentOrders: d.recentOrders ?? [],
        });
      } catch {
        setError("Dashboard verileri yuklenemedi");
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, recentOrders } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Toplam Urun" value={stats.totalProducts} color="text-gray-900" />
        <StatCard label="Toplam Stok" value={stats.totalStock} color="text-gray-900" />
        <StatCard label="Aktif Musteri" value={stats.activeCustomers} color="text-green-600" />
        <StatCard label="Onay Bekleyen" value={stats.pendingApproval} color="text-yellow-600" />
        <StatCard label="Toplam Siparis" value={stats.totalOrders} color="text-gray-900" />
        <StatCard label="Bekleyen Siparis" value={stats.pendingOrders} color="text-blue-600" />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Son Siparisler</h2>
          <Link href="/admin/orders" className="text-sm text-blue-600 hover:text-blue-700">
            Tumunu Gor
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">
            Henuz siparis bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Siparis No</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Magaza</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Musteri</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="text-blue-600 hover:text-blue-700 font-medium">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{order.tenantCompany}</td>
                    <td className="px-6 py-3 text-gray-900">{order.customerName}</td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
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
