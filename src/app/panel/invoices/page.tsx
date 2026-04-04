"use client";

import { useEffect, useState } from "react";

interface Payment {
  id: number;
  amount: string;
  type: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  paidAmount: string;
  currency: string;
  status: string;
  notes: string | null;
  fileUrl: string | null;
  dueDate: string | null;
  createdAt: string;
  payments: Payment[];
}

const STATUS_BADGE: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<string, string> = {
  unpaid: "Odenmedi",
  partial: "Kismi Odendi",
  paid: "Odendi",
};

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Havale/EFT",
  cash: "Nakit",
  credit_card: "Kredi Karti",
};

function formatMoney(val: string | number): string {
  return Number(val).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(val: string | null): string {
  if (!val) return "-";
  return new Date(val).toLocaleDateString("tr-TR");
}

export default function PanelInvoicesPage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/panel/invoices");
        if (!res.ok) throw new Error();
        const json = await res.json();
        setData(json.data || []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalDebt = data.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalPaid = data.reduce((s, i) => s + Number(i.paidAmount), 0);
  const balance = totalDebt - totalPaid;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Faturalarim</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Toplam Borc</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(totalDebt)} TL</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Toplam Odenen</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatMoney(totalPaid)} TL</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Bakiye</p>
          <p className={`text-xl font-bold mt-1 ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
            {formatMoney(balance)} TL
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-sm">Henuz fatura bulunmuyor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fatura No</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Donem</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Odenen</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kalan</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Vade</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((inv) => {
                  const remaining = Number(inv.totalAmount) - Number(inv.paidAmount);
                  const isExpanded = expandedId === inv.id;
                  return (
                    <tr key={inv.id} className="group">
                      <td colSpan={8} className="p-0">
                        <div>
                          <div
                            className="flex items-center cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                          >
                            <td className="px-6 py-3 text-gray-900 font-medium">{inv.invoiceNumber}</td>
                            <td className="px-6 py-3 text-gray-500 text-xs w-[160px]">
                              {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                            </td>
                            <td className="px-6 py-3 text-right text-gray-900 font-medium w-[100px]">{formatMoney(inv.totalAmount)}</td>
                            <td className="px-6 py-3 text-right text-green-600 w-[100px]">{formatMoney(inv.paidAmount)}</td>
                            <td className="px-6 py-3 text-right text-red-600 font-medium w-[100px]">{formatMoney(remaining)}</td>
                            <td className="px-6 py-3 w-[110px]">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[inv.status] || "bg-gray-100 text-gray-700"}`}>
                                {STATUS_LABEL[inv.status] || inv.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs w-[90px]">{formatDate(inv.dueDate)}</td>
                            <td className="px-6 py-3 text-center w-[60px]" onClick={(e) => e.stopPropagation()}>
                              {inv.fileUrl ? (
                                <a
                                  href={inv.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={`fatura-${inv.invoiceNumber}.pdf`}
                                  className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                >
                                  Indir
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </div>

                          {isExpanded && inv.payments.length > 0 && (
                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                              <h4 className="text-xs font-medium text-gray-700 mb-2">Odeme Gecmisi</h4>
                              <div className="space-y-2">
                                {inv.payments.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-gray-200">
                                    <div>
                                      <span className={`text-sm font-medium ${p.type === "refund" ? "text-red-600" : "text-green-600"}`}>
                                        {p.type === "refund" ? "-" : "+"}{formatMoney(p.amount)} TL
                                      </span>
                                      <span className="text-xs text-gray-500 ml-2">
                                        {METHOD_LABEL[p.method || ""] || p.method || "-"}
                                      </span>
                                      {p.reference && (
                                        <span className="text-xs text-gray-400 ml-2">Ref: {p.reference}</span>
                                      )}
                                    </div>
                                    <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {isExpanded && inv.payments.length === 0 && (
                            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                              <p className="text-xs text-gray-400">Henuz odeme yapilmamis.</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
