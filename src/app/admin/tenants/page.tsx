"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Tenant {
  id: number;
  name: string;
  company: string;
  email: string;
  marketplace: string;
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
}

const STATUS_FILTERS = [
  { value: "", label: "Tumu" },
  { value: "pending", label: "Onay Bekleyen" },
  { value: "active", label: "Aktif" },
];

const MARKETPLACE_LABEL: Record<string, string> = {
  shopify: "Shopify",
  ikas: "ikas",
  tsoft: "TSoft",
  ideasoft: "IdeaSoft",
};

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/tenants${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  async function handleAction(tenantId: number, action: "approve" | "reject") {
    setActionLoading(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/${action}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchTenants();
      }
    } catch {
      // Silent fail - will show stale data
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusBadge(tenant: Tenant) {
    if (!tenant.isActive) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Pasif</span>;
    }
    if (!tenant.isApproved) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Onay Bekliyor</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Aktif</span>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Musteriler</h1>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === f.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500 text-sm">
              {filter === "pending" ? "Onay bekleyen musteri yok." : "Musteri bulunamadi."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ad</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sirket</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kayit</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Islem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                  >
                    <td className="px-6 py-3 text-gray-900 font-medium">{tenant.name}</td>
                    <td className="px-6 py-3 text-gray-600">{tenant.company}</td>
                    <td className="px-6 py-3 text-gray-500">{tenant.email}</td>
                    <td className="px-6 py-3 text-gray-600">{MARKETPLACE_LABEL[tenant.marketplace] || tenant.marketplace}</td>
                    <td className="px-6 py-3">{getStatusBadge(tenant)}</td>
                    <td className="px-6 py-3 text-gray-500">{new Date(tenant.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-6 py-3 text-right">
                      {!tenant.isApproved && tenant.isActive && (
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAction(tenant.id, "approve")}
                            disabled={actionLoading === tenant.id}
                            className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md transition-colors"
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => handleAction(tenant.id, "reject")}
                            disabled={actionLoading === tenant.id}
                            className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-md transition-colors"
                          >
                            Reddet
                          </button>
                        </div>
                      )}
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
