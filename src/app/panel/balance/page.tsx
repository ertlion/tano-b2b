"use client";

import { useEffect, useState } from "react";

interface Tx {
  id: number;
  type: string;
  amount: string;
  balanceAfter: string;
  reason: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
}
interface BalanceData {
  balances: { product: number; image: number };
  transactions: Tx[];
}

const REASON_LABEL: Record<string, string> = {
  admin_add: "Admin yükleme",
  order: "Sipariş",
  image_gen: "Görsel üretimi",
  paytr_load: "PayTR yükleme",
  transfer: "Transfer",
  refund: "İade",
};

function tl(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BalancePage() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Bakiye yükleme modalı
  const [modalOpen, setModalOpen] = useState(false);
  const [loadType, setLoadType] = useState<"product" | "image">("product");
  const [loadAmount, setLoadAmount] = useState("");
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [topupMsg, setTopupMsg] = useState("");

  function loadData() {
    fetch("/api/panel/balance")
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
    const q = new URLSearchParams(window.location.search).get("topup");
    if (q === "ok") setTopupMsg("Ödeme alındı, bakiyeniz güncellenecek.");
    else if (q === "fail") setTopupMsg("Ödeme tamamlanamadı.");
  }, []);

  async function startTopup() {
    setLoadBusy(true);
    setLoadErr("");
    try {
      const res = await fetch("/api/panel/balance/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: loadType, amount: Number(loadAmount) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Başlatılamadı");
      setIframeUrl(json.data.iframeUrl);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoadBusy(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setIframeUrl("");
    setLoadAmount("");
    setLoadErr("");
    loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bakiyem</h1>
          <p className="text-sm text-gray-500">Ürün ve AI görsel bakiyeniz ile son hareketler.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm"
        >
          + Bakiye Yükle
        </button>
      </div>

      {topupMsg && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{topupMsg}</div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Bakiye Yükle</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              {!iframeUrl ? (
                <div className="space-y-4">
                  {loadErr && <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{loadErr}</div>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bakiye Tipi</label>
                    <select value={loadType} onChange={(e) => setLoadType(e.target.value as "product" | "image")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="product">Ürün Bakiyesi</option>
                      <option value="image">AI Görsel Bakiyesi</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺)</label>
                    <input type="number" step="1" min="1" value={loadAmount} onChange={(e) => setLoadAmount(e.target.value)} placeholder="500" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <button onClick={startTopup} disabled={loadBusy || !loadAmount} className="w-full px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
                    {loadBusy ? "Hazırlanıyor..." : "Ödemeye Geç"}
                  </button>
                </div>
              ) : (
                <iframe src={iframeUrl} title="PayTR" className="w-full" style={{ height: "60vh", border: "none" }} />
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-500">Ürün Bakiyesi</p>
              <p className={`text-3xl font-bold mt-1 ${(data?.balances.product ?? 0) < 0 ? "text-red-600" : "text-gray-900"}`}>
                {tl(data?.balances.product ?? 0)} ₺
              </p>
              {(data?.balances.product ?? 0) < 0 && (
                <p className="text-xs text-red-500 mt-1">Borçtasınız — fatura/etiket yüklemek için bakiye yükleyin.</p>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-sm text-gray-500">AI Görsel Bakiyesi</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">{tl(data?.balances.image ?? 0)} ₺</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Hareketler</h2>
            </div>
            {(data?.transactions ?? []).length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">Henüz hareket yok.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left px-6 py-2">Tarih</th>
                      <th className="text-left px-3 py-2">Tip</th>
                      <th className="text-left px-3 py-2">Sebep</th>
                      <th className="text-right px-3 py-2">Tutar</th>
                      <th className="text-right px-6 py-2">Sonraki Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data!.transactions.map((t) => {
                      const amt = Number(t.amount);
                      return (
                        <tr key={t.id}>
                          <td className="px-6 py-2 text-gray-500">{new Date(t.createdAt).toLocaleString("tr-TR")}</td>
                          <td className="px-3 py-2 text-gray-600">{t.type === "product" ? "Ürün" : "Görsel"}</td>
                          <td className="px-3 py-2 text-gray-600">{REASON_LABEL[t.reason] || t.reason}{t.reference ? ` (${t.reference})` : ""}</td>
                          <td className={`px-3 py-2 text-right font-medium ${amt < 0 ? "text-red-600" : "text-green-600"}`}>
                            {amt > 0 ? "+" : ""}{tl(amt)} ₺
                          </td>
                          <td className="px-6 py-2 text-right text-gray-900">{tl(Number(t.balanceAfter))} ₺</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
