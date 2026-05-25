"use client";

import { useEffect, useState } from "react";

interface Report {
  id: number;
  orderNumber: string | null;
  description: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  images: string[];
  tenantName: string | null;
  tenantCompany: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Beklemede", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Onaylandı", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Reddedildi", cls: "bg-red-100 text-red-700" },
};

export default function AdminDefectsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/defects").then((r) => r.json()).then((j) => setReports(j.data || [])).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function respond(id: number, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/defects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: notes[id] || "" }),
      });
      if (res.ok) load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Defolu Ürün Talepleri</h1>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">Talep yok.</div>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-gray-900">{r.tenantCompany || r.tenantName || "Üye"}</span>
                  <span className="ml-2 text-sm text-gray-500">Sipariş {r.orderNumber || "-"}</span>
                  <span className="ml-2 text-xs text-gray-400">{new Date(r.createdAt).toLocaleString("tr-TR")}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS[r.status]?.cls || "bg-gray-100 text-gray-700"}`}>{STATUS[r.status]?.label || r.status}</span>
              </div>
              <p className="text-sm text-gray-700 mb-3">{r.description}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(r.images || []).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={i} href={img} target="_blank" rel="noopener noreferrer"><img src={img} alt="" className="w-24 h-24 object-cover rounded-lg border" /></a>
                ))}
              </div>
              {r.adminNote && <p className="text-xs text-gray-500 mb-2">Önceki not: {r.adminNote}</p>}
              {r.status === "pending" && (
                <div className="flex items-center gap-2">
                  <input
                    value={notes[r.id] || ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Not (opsiyonel)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button onClick={() => respond(r.id, "approved")} disabled={busy === r.id} className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg">Onayla</button>
                  <button onClick={() => respond(r.id, "rejected")} disabled={busy === r.id} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg">Reddet</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
