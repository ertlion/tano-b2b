"use client";

import { useEffect, useState } from "react";

interface OrderOpt { id: number; orderNumber: string; createdAt: string }
interface Report {
  id: number;
  orderNumber: string | null;
  description: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  images: string[];
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Beklemede", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Onaylandı", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Reddedildi", cls: "bg-red-100 text-red-700" },
};

export default function DefectsPage() {
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [orderId, setOrderId] = useState("");
  const [desc, setDesc] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function loadReports() {
    fetch("/api/panel/defects").then((r) => r.json()).then((j) => setReports(j.data || [])).catch(() => {});
  }
  useEffect(() => {
    fetch("/api/panel/orders?limit=100")
      .then((r) => r.json())
      .then((j) => {
        const list = j.orders || j.data?.orders || j.data || [];
        setOrders(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    loadReports();
  }, []);

  function onFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 5).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setImages((p) => [...p, String(reader.result)]);
      reader.readAsDataURL(f);
    });
  }

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/panel/defects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: Number(orderId), images, description: desc }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Gönderilemedi");
      setMsg("Defolu bildirim oluşturuldu, admin inceleyecek.");
      setOrderId(""); setDesc(""); setImages([]);
      loadReports();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Defolu Ürün Bildirimi</h1>
        <p className="text-sm text-gray-500">Siparişinizi seçin, ürün görselini ve açıklamayı ekleyin. Sipariş tarihinden 5 iş günü geçtiyse bildirim yapılamaz.</p>
      </div>

      {msg && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş</label>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Seçiniz</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Görselleri</label>
          <div className="flex flex-wrap gap-3">
            {images.map((s, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                <button onClick={() => setImages((p) => p.filter((_, k) => k !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer text-gray-400 hover:border-blue-400">
              +
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Sorunu açıklayın..." />
        </div>
        <button onClick={submit} disabled={busy || !orderId || images.length === 0 || !desc} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
          {busy ? "Gönderiliyor..." : "Bildirim Oluştur"}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold text-gray-900">Bildirimlerim</h2></div>
        {reports.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Henüz bildirim yok.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">Sipariş {r.orderNumber || "-"}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[r.status]?.cls || "bg-gray-100 text-gray-700"}`}>{STATUS[r.status]?.label || r.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{r.description}</p>
                {r.adminNote && <p className="text-xs text-gray-500 mt-1">Admin notu: {r.adminNote}</p>}
                <div className="flex gap-2 mt-2">
                  {(r.images || []).map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={img} alt="" className="w-12 h-12 object-cover rounded border" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
