"use client";

import { useEffect, useState } from "react";

interface SettingsKey {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "number";
  options?: Array<{ value: string; label: string }>;
}

interface SettingsData {
  marketplace: string;
  marketplaceDisplayName: string;
  settingsKeys: SettingsKey[];
  settings: Record<string, string>;
}

export default function PanelSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
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
        const d = json.data;
        if (d) {
          setData(d);
          setCredentials(d.settings || {});
        }
      } catch {
        // Default empty
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  function handleChange(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Kayıt başarısız");
      }

      setSuccess(`${json.updatedKeys?.length || 0} ayar başarıyla kaydedildi`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!data) return;
    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const res = await fetch("/api/panel/settings/test", {
        method: "POST",
      });

      const json = await res.json();
      setTestResult({
        ok: res.ok,
        message: json.message || json.error || (res.ok ? "Bağlantı başarılı" : "Bağlantı başarısız"),
      });
    } catch {
      setTestResult({ ok: false, message: "Bağlantı testi sırasında hata oluştu" });
    } finally {
      setTesting(false);
    }
  }

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

  const fields = data?.settingsKeys || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Pazaryeri Entegrasyonu</h2>
        <p className="text-sm text-gray-500 mb-6">
          Ürünlerin ve siparişlerin senkronize edildiği pazaryeri bilgileri.
        </p>

        {data?.marketplace ? (
          <>
            {/* Marketplace Info */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-700">
                    {data.marketplaceDisplayName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{data.marketplaceDisplayName}</p>
                  <p className="text-xs text-gray-500">Aktif pazaryeri</p>
                </div>
              </div>
            </div>

            {/* Fields from API */}
            {fields.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">
                  {data.marketplaceDisplayName} Bağlantı Bilgileri
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                      </label>
                      {field.type === "select" && field.options ? (
                        <select
                          value={credentials[field.key] || ""}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Seçiniz</option>
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : field.type}
                          value={credentials[field.key] || ""}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
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
                    {testResult.message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium rounded-lg text-sm transition-colors"
                  >
                    {testing ? "Test Ediliyor..." : "Bağlantıyı Test Et"}
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
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-1">Pazaryeri henüz belirlenmemiş.</p>
            <p className="text-xs text-gray-400">Lütfen yönetici ile iletişime geçin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
