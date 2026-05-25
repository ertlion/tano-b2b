"use client";

import { useEffect, useState } from "react";

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  password: string;
}

interface ParasutSettings {
  parasut_client_id: string;
  parasut_client_secret: string;
  parasut_email: string;
  parasut_password: string;
  parasut_company_id: string;
}

interface Tenant {
  id: number;
  name: string;
  company: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<SmtpSettings>({
    host: "",
    port: "587",
    user: "",
    password: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // USD→TL kuru (app_config)
  const [usdRate, setUsdRate] = useState("");
  const [rateSaving, setRateSaving] = useState(false);
  const [rateMsg, setRateMsg] = useState("");

  // Parasut state
  const [parasut, setParasut] = useState<ParasutSettings>({
    parasut_client_id: "",
    parasut_client_secret: "",
    parasut_email: "",
    parasut_password: "",
    parasut_company_id: "",
  });
  const [parasutSaving, setParasutSaving] = useState(false);
  const [parasutTesting, setParasutTesting] = useState(false);
  const [parasutError, setParasutError] = useState("");
  const [parasutSuccess, setParasutSuccess] = useState("");

  // Parasut invoice creation
  const [tenantList, setTenantList] = useState<Tenant[]>([]);
  const [invoiceTenantId, setInvoiceTenantId] = useState("");
  const [invoicePeriodStart, setInvoicePeriodStart] = useState("");
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState("");
  const [invoiceCreating, setInvoiceCreating] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceSuccess, setInvoiceSuccess] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const data = json.data || {};
        if (data.smtp_host || data.smtp_port || data.smtp_user || data.smtp_password) {
          setForm({
            host: data.smtp_host || "",
            port: data.smtp_port || "587",
            user: data.smtp_user || "",
            password: data.smtp_password || "",
          });
        }
      } catch {
        // No saved settings - use defaults
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Load Parasut settings
  useEffect(() => {
    async function loadParasut() {
      try {
        const res = await fetch("/api/admin/parasut/settings");
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data || {};
        setParasut((prev) => ({
          ...prev,
          parasut_client_id: data.parasut_client_id || "",
          parasut_client_secret: data.parasut_client_secret || "",
          parasut_email: data.parasut_email || "",
          parasut_password: data.parasut_password || "",
          parasut_company_id: data.parasut_company_id || "",
        }));
      } catch {
        // ignore
      }
    }
    loadParasut();
  }, []);

  // Load tenants for invoice creation
  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => r.json())
      .then((json) => setTenantList(json.data || []))
      .catch(() => {});
  }, []);

  // Load USD rate
  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((json) => setUsdRate(json.data?.usd_try_rate || ""))
      .catch(() => {});
  }, []);

  async function handleRateSave() {
    setRateSaving(true);
    setRateMsg("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usd_try_rate: usdRate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kaydedilemedi");
      setRateMsg("Kur kaydedildi");
    } catch (e) {
      setRateMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setRateSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp_host: form.host,
          smtp_port: form.port,
          smtp_user: form.user,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kayıt başarısız");
      }

      setSuccess("Ayarlar başarıyla kaydedildi");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTesting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp: form }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Test e-posta gonderilemedi");
      }

      setSuccess("Test e-posta başarıyla gönderildi");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setTesting(false);
    }
  }

  // Parasut save
  async function handleParasutSave() {
    setParasutSaving(true);
    setParasutError("");
    setParasutSuccess("");
    try {
      const res = await fetch("/api/admin/parasut/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parasut),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kayit basarisiz");
      }
      setParasutSuccess("Parasut ayarlari kaydedildi");
      setTimeout(() => setParasutSuccess(""), 3000);
    } catch (err) {
      setParasutError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setParasutSaving(false);
    }
  }

  // Parasut test connection
  async function handleParasutTest() {
    setParasutTesting(true);
    setParasutError("");
    setParasutSuccess("");
    try {
      const res = await fetch("/api/admin/parasut/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Test basarisiz");
      }
      setParasutSuccess(data.message || "Baglanti basarili!");
      setTimeout(() => setParasutSuccess(""), 3000);
    } catch (err) {
      setParasutError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setParasutTesting(false);
    }
  }

  // Parasut create invoice
  async function handleCreateParasutInvoice() {
    if (!invoiceTenantId || !invoicePeriodStart || !invoicePeriodEnd) {
      setInvoiceError("Tum alanlari doldurun");
      return;
    }
    setInvoiceCreating(true);
    setInvoiceError("");
    setInvoiceSuccess("");
    try {
      const res = await fetch("/api/admin/parasut/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: parseInt(invoiceTenantId),
          periodStart: invoicePeriodStart,
          periodEnd: invoicePeriodEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fatura olusturulamadi");
      }
      setInvoiceSuccess(
        `Fatura olusturuldu! Parasut ID: ${data.data.parasutInvoiceId}, ${data.data.orderCount} siparis, ${data.data.itemCount} kalem`
      );
      setTimeout(() => setInvoiceSuccess(""), 8000);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setInvoiceCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      {/* Dolar Kuru (USD B2B fiyatlandırma temeli) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Dolar Kuru (USD → TL)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Ürün fiyatları ikas &quot;Dolar B2B&quot; (USD) listesinden gelir. Bu kur ile TL&apos;ye çevrilir; üyeler kendi kar marjını uygular.
        </p>
        {rateMsg && (
          <div className="mb-3 p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{rateMsg}</div>
        )}
        <div className="flex items-end gap-3">
          <div className="w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">1 USD kaç TL?</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={usdRate}
              onChange={(e) => setUsdRate(e.target.value)}
              placeholder="45.50"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleRateSave}
            disabled={rateSaving || !usdRate}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm"
          >
            {rateSaving ? "Kaydediliyor..." : "Kuru Kaydet"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">SMTP Ayarlari</h2>
        <p className="text-sm text-gray-500 mb-6">
          E-posta bildirimleri gonderebilmek icin SMTP sunucu ayarlarini yapilandirin.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input
              type="text"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              placeholder="587"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kullanici Adi</label>
            <input
              type="text"
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value })}
              placeholder="user@domain.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="SMTP sifresi"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={handleTestEmail}
            disabled={testing || !form.host || !form.user}
            className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium rounded-lg text-sm transition-colors"
          >
            {testing ? "Gonderiliyor..." : "Test E-posta Gonder"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
      {/* Parasut Integration */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Parasut Entegrasyonu</h2>
        <p className="text-sm text-gray-500 mb-6">
          Parasut e-fatura entegrasyonu icin API bilgilerini girin. parasut.com hesabinizdan alinabilir.
        </p>

        {parasutError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{parasutError}</div>
        )}
        {parasutSuccess && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-4">{parasutSuccess}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
            <input
              type="text"
              value={parasut.parasut_client_id}
              onChange={(e) => setParasut({ ...parasut, parasut_client_id: e.target.value })}
              placeholder="Parasut Client ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
            <input
              type="password"
              value={parasut.parasut_client_secret}
              onChange={(e) => setParasut({ ...parasut, parasut_client_secret: e.target.value })}
              placeholder="Parasut Client Secret"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
            <input
              type="text"
              value={parasut.parasut_email}
              onChange={(e) => setParasut({ ...parasut, parasut_email: e.target.value })}
              placeholder="Parasut hesap e-postasi"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sifre</label>
            <input
              type="password"
              value={parasut.parasut_password}
              onChange={(e) => setParasut({ ...parasut, parasut_password: e.target.value })}
              placeholder="Parasut hesap sifresi"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sirket ID</label>
            <input
              type="text"
              value={parasut.parasut_company_id}
              onChange={(e) => setParasut({ ...parasut, parasut_company_id: e.target.value })}
              placeholder="Parasut sirket ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={handleParasutTest}
            disabled={parasutTesting || !parasut.parasut_client_id}
            className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium rounded-lg text-sm transition-colors"
          >
            {parasutTesting ? "Test ediliyor..." : "Baglantiyi Test Et"}
          </button>
          <button
            onClick={handleParasutSave}
            disabled={parasutSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {parasutSaving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>

      {/* Parasut Invoice Creation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Haftalik Fatura Olustur</h2>
        <p className="text-sm text-gray-500 mb-6">
          Secilen musteri ve donem icin Parasut uzerinde satis faturasi olusturur.
        </p>

        {invoiceError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{invoiceError}</div>
        )}
        {invoiceSuccess && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-4">{invoiceSuccess}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Musteri</label>
            <select
              value={invoiceTenantId}
              onChange={(e) => setInvoiceTenantId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Musteri secin...</option>
              {tenantList.map((t) => (
                <option key={t.id} value={t.id}>{t.company} ({t.name})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Donem Baslangic</label>
            <input
              type="date"
              value={invoicePeriodStart}
              onChange={(e) => setInvoicePeriodStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Donem Bitis</label>
            <input
              type="date"
              value={invoicePeriodEnd}
              onChange={(e) => setInvoicePeriodEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleCreateParasutInvoice}
            disabled={invoiceCreating || !invoiceTenantId || !invoicePeriodStart || !invoicePeriodEnd}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {invoiceCreating ? "Olusturuluyor..." : "Parasut Faturasi Olustur"}
          </button>
        </div>
      </div>
    </div>
  );
}
