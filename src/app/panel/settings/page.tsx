"use client";

import { useEffect, useState } from "react";

type Marketplace = "shopify" | "ikas" | "tsoft" | "ideasoft";

const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  shopify: "Shopify",
  ikas: "ikas",
  tsoft: "TSoft",
  ideasoft: "IdeaSoft",
};

const MARKETPLACE_FIELDS: Record<Marketplace, Array<{ key: string; label: string; type: string; placeholder: string }>> = {
  shopify: [
    { key: "storeUrl", label: "Store URL", type: "text", placeholder: "my-store.myshopify.com" },
    { key: "clientId", label: "Client ID", type: "text", placeholder: "Shopify Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "Shopify Client Secret" },
    { key: "locationId", label: "Location ID", type: "text", placeholder: "Location ID" },
  ],
  ikas: [
    { key: "storeUrl", label: "Store URL", type: "text", placeholder: "my-store.myikas.com" },
    { key: "apiKey", label: "API Key", type: "text", placeholder: "ikas API Key" },
    { key: "apiSecret", label: "API Secret", type: "password", placeholder: "ikas API Secret" },
  ],
  tsoft: [
    { key: "apiUrl", label: "API URL", type: "text", placeholder: "https://api.tsoft.com.tr/..." },
    { key: "username", label: "Kullanici Adi", type: "text", placeholder: "TSoft kullanici adi" },
    { key: "password", label: "Sifre", type: "password", placeholder: "TSoft sifresi" },
  ],
  ideasoft: [
    { key: "storeUrl", label: "Store URL", type: "text", placeholder: "my-store.myideasoft.com" },
    { key: "accessToken", label: "Access Token", type: "password", placeholder: "IdeaSoft Access Token" },
  ],
};

export default function PanelSettingsPage() {
  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/panel/settings");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const data = json.data;
        if (data?.marketplace) {
          setMarketplace(data.marketplace as Marketplace);
        }
        if (data?.settings) {
          setCredentials(data.settings);
        }
      } catch {
        // Default empty
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  function handleCredentialChange(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!marketplace) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kayit basarisiz");
      }

      setSuccess("Ayarlar basariyla kaydedildi");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!marketplace) return;
    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const res = await fetch("/api/panel/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace, credentials }),
      });

      const data = await res.json();

      if (!res.ok) {
        setTestResult({ ok: false, message: data.error || "Baglanti testi basarisiz" });
        return;
      }

      setTestResult({ ok: true, message: data.message || "Baglanti basarili" });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Baglanti testi sirasinda hata olustu",
      });
    } finally {
      setTesting(false);
    }
  }

  const fields = marketplace ? MARKETPLACE_FIELDS[marketplace] : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
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

      {/* Marketplace Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Pazaryeri Entegrasyonu</h2>
        <p className="text-sm text-gray-500 mb-6">
          Urunlerin ve siparislerin senkronize edildigi pazaryeri bilgileri.
        </p>

        {/* Marketplace display */}
        {marketplace && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                <span className="text-sm font-bold text-gray-700">
                  {MARKETPLACE_LABELS[marketplace].charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {MARKETPLACE_LABELS[marketplace]}
                </p>
                <p className="text-xs text-gray-500">Aktif pazaryeri</p>
              </div>
            </div>
          </div>
        )}

        {/* Credential Fields */}
        {marketplace && fields.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">
              {MARKETPLACE_LABELS[marketplace]} Baglanti Bilgileri
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ""}
                    onChange={(e) => handleCredentialChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-3 rounded-lg border text-sm ${
                testResult.ok
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.ok ? (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {testResult.message}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 font-medium rounded-lg text-sm transition-colors"
              >
                {testing ? "Test Ediliyor..." : "Baglantiyi Test Et"}
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
        )}

        {!marketplace && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p className="text-sm text-gray-500 mb-1">Pazaryeri henuz belirlenmemis.</p>
            <p className="text-xs text-gray-400">
              Lutfen yonetici ile iletisime gecin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
