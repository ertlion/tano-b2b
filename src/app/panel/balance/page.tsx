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

  useEffect(() => {
    fetch("/api/panel/balance")
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bakiyem</h1>
        <p className="text-sm text-gray-500">Ürün ve AI görsel bakiyeniz ile son hareketler.</p>
      </div>

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
