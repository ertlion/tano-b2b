"use client";

import { useEffect, useState, useCallback } from "react";

interface Tenant {
  id: number;
  name: string;
  company: string;
}

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
  tenantId: number;
  tenantName: string;
  tenantCompany: string;
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
  parasutInvoiceId: string | null;
  createdAt: string;
  payments?: Payment[];
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

export default function AdminInvoicesPage() {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [tenantList, setTenantList] = useState<Tenant[]>([]);
  const limit = 50;

  // Expanded invoice (show payments)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedPayments, setExpandedPayments] = useState<Payment[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);

  // Create invoice modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    tenantId: "",
    invoiceNumber: "",
    periodStart: "",
    periodEnd: "",
    totalAmount: "",
    dueDate: "",
    notes: "",
    fileUrl: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Payment modal
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "bank_transfer",
    reference: "",
    notes: "",
  });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // File upload state
  const [fileUploading, setFileUploading] = useState(false);

  // Parasut send state
  const [parasutSending, setParasutSending] = useState<number | null>(null);

  // Load tenants
  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => r.json())
      .then((json) => setTenantList(json.data || []))
      .catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (statusFilter) params.set("status", statusFilter);
      if (tenantFilter) params.set("tenantId", tenantFilter);
      const res = await fetch(`/api/admin/invoices?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, tenantFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, tenantFilter]);

  async function handleExpand(invoice: Invoice) {
    if (expandedId === invoice.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(invoice.id);
    setExpandLoading(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`);
      if (res.ok) {
        const json = await res.json();
        setExpandedPayments(json.data.payments || []);
      }
    } catch {
      setExpandedPayments([]);
    } finally {
      setExpandLoading(false);
    }
  }

  async function handleCreateInvoice() {
    const { tenantId, invoiceNumber, periodStart, periodEnd, totalAmount } = createForm;
    if (!tenantId || !invoiceNumber || !periodStart || !periodEnd || !totalAmount) {
      setCreateError("Tum zorunlu alanlari doldurun");
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          tenantId: parseInt(createForm.tenantId),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ tenantId: "", invoiceNumber: "", periodStart: "", periodEnd: "", totalAmount: "", dueDate: "", notes: "", fileUrl: "" });
        fetchInvoices();
      } else {
        const json = await res.json();
        setCreateError(json.error || "Bir hata olustu");
      }
    } catch {
      setCreateError("Baglanti hatasi");
    } finally {
      setCreateLoading(false);
    }
  }

  function openPaymentModal(invoice: Invoice) {
    setPaymentInvoice(invoice);
    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    setPaymentForm({
      amount: remaining > 0 ? String(remaining) : "",
      method: "bank_transfer",
      reference: "",
      notes: "",
    });
    setPaymentError("");
  }

  async function handleRecordPayment() {
    if (!paymentInvoice) return;
    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("Gecerli bir tutar girin");
      return;
    }
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: paymentInvoice.tenantId,
          invoiceId: paymentInvoice.id,
          amount,
          type: "payment",
          method: paymentForm.method,
          reference: paymentForm.reference,
          notes: paymentForm.notes,
        }),
      });
      if (res.ok) {
        setPaymentInvoice(null);
        fetchInvoices();
        // Refresh expanded if same invoice
        if (expandedId === paymentInvoice.id) {
          setExpandedId(null);
        }
      } else {
        const json = await res.json();
        setPaymentError(json.error || "Bir hata olustu");
      }
    } catch {
      setPaymentError("Baglanti hatasi");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleDeleteInvoice(id: number) {
    if (!confirm("Bu faturayi silmek istediginize emin misiniz?")) return;
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchInvoices();
        if (expandedId === id) setExpandedId(null);
      } else {
        const json = await res.json();
        alert(json.error || "Silinemedi");
      }
    } catch {
      alert("Baglanti hatasi");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setCreateError("Sadece PDF dosyasi yukleyebilirsiniz");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCreateError("Dosya boyutu 5MB'dan kucuk olmali");
      return;
    }
    setFileUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setCreateForm((prev) => ({ ...prev, fileUrl: base64 }));
        setFileUploading(false);
      };
      reader.onerror = () => {
        setCreateError("Dosya okunamadi");
        setFileUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setCreateError("Dosya yuklenemedi");
      setFileUploading(false);
    }
  }

  async function handleSendToParasut(inv: Invoice) {
    if (!confirm(`"${inv.invoiceNumber}" faturasini Parasut'e gondermek istediginize emin misiniz?`)) return;
    setParasutSending(inv.id);
    try {
      const res = await fetch("/api/admin/parasut/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gonderilemedi");
      }
      alert(`Parasut'e gonderildi! ID: ${data.data.parasutInvoiceId}`);
      fetchInvoices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setParasutSending(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  // Summary stats
  const totalDebt = data.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalPaid = data.reduce((s, i) => s + Number(i.paidAmount), 0);
  const totalRemaining = totalDebt - totalPaid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Faturalar</h1>
        <button
          onClick={() => { setShowCreate(true); setCreateError(""); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Yeni Fatura
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Toplam Fatura Tutari</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(totalDebt)} TL</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Toplam Odenen</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatMoney(totalPaid)} TL</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Kalan Borc</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatMoney(totalRemaining)} TL</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Tum Durumlar</option>
          <option value="unpaid">Odenmedi</option>
          <option value="partial">Kismi Odendi</option>
          <option value="paid">Odendi</option>
        </select>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Tum Musteriler</option>
          {tenantList.map((t) => (
            <option key={t.id} value={t.id}>{t.company} ({t.name})</option>
          ))}
        </select>
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
            <p className="text-gray-500 text-sm">Fatura bulunamadi.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Musteri</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fatura No</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Donem</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tutar</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Odenen</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Kalan</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Vade</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Islem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((inv) => {
                    const remaining = Number(inv.totalAmount) - Number(inv.paidAmount);
                    const isExpanded = expandedId === inv.id;
                    return (
                      <tr key={inv.id} className="group">
                        <td colSpan={9} className="p-0">
                          <div>
                            <div
                              className="flex items-center cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => handleExpand(inv)}
                            >
                              <td className="px-6 py-3 w-[160px]">
                                <p className="text-gray-900 font-medium text-xs">{inv.tenantCompany}</p>
                                <p className="text-gray-400 text-xs">{inv.tenantName}</p>
                              </td>
                              <td className="px-6 py-3 w-[120px] text-gray-900">{inv.invoiceNumber}</td>
                              <td className="px-6 py-3 w-[160px] text-gray-500 text-xs">
                                {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                              </td>
                              <td className="px-6 py-3 w-[100px] text-right text-gray-900 font-medium">{formatMoney(inv.totalAmount)}</td>
                              <td className="px-6 py-3 w-[100px] text-right text-green-600">{formatMoney(inv.paidAmount)}</td>
                              <td className="px-6 py-3 w-[100px] text-right text-red-600 font-medium">{formatMoney(remaining)}</td>
                              <td className="px-6 py-3 w-[110px]">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[inv.status] || "bg-gray-100 text-gray-700"}`}>
                                  {STATUS_LABEL[inv.status] || inv.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 w-[90px] text-gray-500 text-xs">{formatDate(inv.dueDate)}</td>
                              <td className="px-6 py-3 w-[140px] text-center">
                                <div className="flex items-center gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                                  {inv.status !== "paid" && (
                                    <button
                                      onClick={() => openPaymentModal(inv)}
                                      className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                    >
                                      Odeme
                                    </button>
                                  )}
                                  {inv.fileUrl && (
                                    <a
                                      href={inv.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download={`fatura-${inv.invoiceNumber}.pdf`}
                                      className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                    >
                                      PDF
                                    </a>
                                  )}
                                  {!inv.parasutInvoiceId && (
                                    <button
                                      onClick={() => handleSendToParasut(inv)}
                                      disabled={parasutSending === inv.id}
                                      className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 disabled:opacity-50 transition-colors"
                                    >
                                      {parasutSending === inv.id ? "..." : "Parasut"}
                                    </button>
                                  )}
                                  {inv.parasutInvoiceId && (
                                    <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded">
                                      PST
                                    </span>
                                  )}
                                  {inv.status === "unpaid" && (
                                    <button
                                      onClick={() => handleDeleteInvoice(inv.id)}
                                      className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                                    >
                                      Sil
                                    </button>
                                  )}
                                </div>
                              </td>
                            </div>

                            {/* Expanded payment details */}
                            {isExpanded && (
                              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                                {inv.notes && (
                                  <p className="text-xs text-gray-500 mb-3">Not: {inv.notes}</p>
                                )}
                                <h4 className="text-xs font-medium text-gray-700 mb-2">Odeme Gecmisi</h4>
                                {expandLoading ? (
                                  <div className="h-8 bg-gray-200 rounded animate-pulse" />
                                ) : expandedPayments.length === 0 ? (
                                  <p className="text-xs text-gray-400">Henuz odeme yapilmamis.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {expandedPayments.map((p) => (
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
                                )}
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">Toplam {total} fatura</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Onceki
                  </button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">Yeni Fatura</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Musteri *</label>
                <select
                  value={createForm.tenantId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, tenantId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Musteri secin...</option>
                  {tenantList.map((t) => (
                    <option key={t.id} value={t.id}>{t.company} ({t.name})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fatura No *</label>
                <input
                  type="text"
                  value={createForm.invoiceNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder="FTR-2026-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Donem Baslangic *</label>
                  <input
                    type="date"
                    value={createForm.periodStart}
                    onChange={(e) => setCreateForm((f) => ({ ...f, periodStart: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Donem Bitis *</label>
                  <input
                    type="date"
                    value={createForm.periodEnd}
                    onChange={(e) => setCreateForm((f) => ({ ...f, periodEnd: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Toplam Tutar (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={createForm.totalAmount}
                    onChange={(e) => setCreateForm((f) => ({ ...f, totalAmount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vade Tarihi</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF Yukle</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {fileUploading && <p className="text-xs text-blue-600 mt-1">Yukleniyor...</p>}
                {createForm.fileUrl && !fileUploading && <p className="text-xs text-green-600 mt-1">PDF yuklendi</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Opsiyonel not..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{createError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Iptal
                </button>
                <button
                  onClick={handleCreateInvoice}
                  disabled={createLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createLoading ? "Kaydediliyor..." : "Fatura Olustur"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setPaymentInvoice(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Odeme Kaydet</h2>
              <p className="text-xs text-gray-500 mt-1">
                {paymentInvoice.tenantCompany} - {paymentInvoice.invoiceNumber}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Fatura Tutari:</span>
                  <span className="font-medium">{formatMoney(paymentInvoice.totalAmount)} TL</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Odenen:</span>
                  <span className="text-green-600">{formatMoney(paymentInvoice.paidAmount)} TL</span>
                </div>
                <div className="flex justify-between mt-1 border-t border-gray-200 pt-1">
                  <span className="text-gray-500 font-medium">Kalan:</span>
                  <span className="text-red-600 font-medium">
                    {formatMoney(Number(paymentInvoice.totalAmount) - Number(paymentInvoice.paidAmount))} TL
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Odeme Tutari (TL) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Odeme Yontemi</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="bank_transfer">Havale/EFT</option>
                  <option value="cash">Nakit</option>
                  <option value="credit_card">Kredi Karti</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referans / Dekont No</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Opsiyonel..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Opsiyonel..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{paymentError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setPaymentInvoice(null)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Iptal
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={paymentLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {paymentLoading ? "Kaydediliyor..." : "Odeme Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
