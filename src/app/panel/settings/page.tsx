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

interface IntegrationInfo {
  marketplace: string;
  displayName: string;
  redirects: { label: string; url: string; description: string }[];
  steps: { title: string; body: string; fieldHint?: string }[];
  apiInfo: { label: string; value: string; sensitive?: boolean }[];
  configured: boolean;
}

interface CargoProvider {
  value: string;
  label: string;
}

interface CargoSettingsKey {
  key: string;
  label: string;
  type: "text" | "password";
}

interface CargoSettingsData {
  provider: string;
  providerDisplayName: string;
  settingsKeys: CargoSettingsKey[];
  settings: Record<string, string>;
  availableProviders: CargoProvider[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
    >
      {copied ? "✓ Kopyalandı" : "Kopyala"}
    </button>
  );
}

export default function PanelSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [integration, setIntegration] = useState<IntegrationInfo | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookResult, setWebhookResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushImages, setPushImages] = useState(false);
  const [savingPushImages, setSavingPushImages] = useState(false);

  // Cargo state
  const [cargoData, setCargoData] = useState<CargoSettingsData | null>(null);
  const [cargoProvider, setCargoProvider] = useState("");
  const [cargoCredentials, setCargoCredentials] = useState<Record<string, string>>({});
  const [cargoSaving, setCargoSaving] = useState(false);
  const [cargoError, setCargoError] = useState("");
  const [cargoSuccess, setCargoSuccess] = useState("");

  async function loadAll() {
    try {
      const [settingsRes, integrationRes] = await Promise.all([
        fetch("/api/panel/settings"),
        fetch("/api/panel/settings/integration-info"),
      ]);
      if (settingsRes.ok) {
        const json = await settingsRes.json();
        const d = json.data;
        if (d) {
          setData(d);
          setCredentials(d.settings || {});
          setPushImages(d.settings?.push_images_enabled === "true");
        }
      }
      if (integrationRes.ok) {
        const json = await integrationRes.json();
        setIntegration(json.data || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();

    async function loadCargoSettings() {
      try {
        const res = await fetch("/api/panel/cargo/settings");
        if (!res.ok) throw new Error();
        const json = await res.json();
        const d = json.data as CargoSettingsData;
        if (d) {
          setCargoData(d);
          setCargoProvider(d.provider || "");
          setCargoCredentials(d.settings || {});
        }
      } catch {
        // ignore
      }
    }
    loadCargoSettings();
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
      if (!res.ok) throw new Error(json.error || "Kayıt başarısız");

      setSuccess(`${json.updatedKeys?.length || 0} ayar kaydedildi`);
      setTimeout(() => setSuccess(""), 3000);
      // API bilgilerini yenile
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePushImages(next: boolean) {
    setSavingPushImages(true);
    setPushImages(next);
    try {
      await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ push_images_enabled: next ? "true" : "false" }),
      });
    } catch {
      setPushImages(!next);
    } finally {
      setSavingPushImages(false);
    }
  }

  function handleCargoChange(key: string, value: string) {
    setCargoCredentials((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCargoSave() {
    if (!cargoProvider) return;
    setCargoSaving(true);
    setCargoError("");
    setCargoSuccess("");

    try {
      const res = await fetch("/api/panel/cargo/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: cargoProvider,
          settings: cargoCredentials,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kayıt başarısız");

      setCargoSuccess("Kargo ayarları kaydedildi");
      setTimeout(() => setCargoSuccess(""), 3000);

      const reloadRes = await fetch("/api/panel/cargo/settings");
      if (reloadRes.ok) {
        const reloadJson = await reloadRes.json();
        const d = reloadJson.data as CargoSettingsData;
        if (d) {
          setCargoData(d);
          setCargoCredentials(d.settings || {});
        }
      }
    } catch (err) {
      setCargoError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setCargoSaving(false);
    }
  }

  const cargoSettingsKeys: CargoSettingsKey[] =
    cargoProvider && cargoData?.provider === cargoProvider ? cargoData.settingsKeys : [];

  async function handleTest() {
    if (!data) return;
    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const res = await fetch("/api/panel/settings/test", { method: "POST" });
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

  const fields = (data?.settingsKeys || []).filter((f) => f.key !== "push_images_enabled");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{success}</div>
      )}

      {/* ─── ENTEGRASYON AKIŞI ─────────────────────────────── */}
      {data?.marketplace && integration && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-6 gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {integration.displayName} Entegrasyonu
              </h2>
              <p className="text-sm text-gray-500">
                Adımları sırayla uygulayın. Aşağıdaki URL'leri karşı tarafın istediği alana yapıştırın.
              </p>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                integration.configured
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {integration.configured ? "✓ Bağlandı" : "⚠ Tamamlanmadı"}
            </span>
          </div>

          {/* Adım 1: Yönlendirme URL'leri */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                1
              </span>
              Yönlendirme adreslerini kopyalayın
            </h3>
            <div className="space-y-3 pl-8">
              {integration.redirects.map((r) => (
                <div key={r.label} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-xs font-semibold text-gray-700">{r.label}</span>
                    <CopyButton text={r.url} />
                  </div>
                  <code className="block text-xs font-mono text-gray-800 break-all bg-white px-2 py-1.5 rounded border border-gray-200 mb-1.5">
                    {r.url}
                  </code>
                  <p className="text-xs text-gray-500">{r.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Adım 2: Talimat */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                2
              </span>
              {integration.displayName} panelinizde yapın
            </h3>
            <ol className="space-y-2 pl-8">
              {integration.steps.map((s, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium text-gray-800">{s.title}</p>
                  <p className="text-gray-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Adım 3: Form */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                3
              </span>
              API bilgilerini girin ve kaydedin
            </h3>
            <div className="pl-8">
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
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
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

              {testResult && (
                <div
                  className={`mt-4 p-3 rounded-lg border text-sm ${
                    testResult.ok
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {testResult.message}
                </div>
              )}
              {webhookResult && (
                <div
                  className={`mt-4 p-3 rounded-lg border text-sm ${
                    webhookResult.ok
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {webhookResult.message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                {data.marketplace === "shopify" && (
                  <button
                    onClick={async () => {
                      setRegisteringWebhook(true);
                      setWebhookResult(null);
                      try {
                        const res = await fetch("/api/panel/settings/register-webhook", {
                          method: "POST",
                        });
                        const json = await res.json();
                        setWebhookResult({
                          ok: res.ok,
                          message:
                            json.message || json.error || (res.ok ? "Webhook kaydedildi" : "Webhook kaydı başarısız"),
                        });
                      } catch {
                        setWebhookResult({ ok: false, message: "Webhook kaydı sırasında hata oluştu" });
                      } finally {
                        setRegisteringWebhook(false);
                      }
                    }}
                    disabled={registeringWebhook}
                    className="px-4 py-2.5 border border-green-300 hover:bg-green-50 disabled:opacity-50 text-green-700 font-medium rounded-lg text-sm transition-colors"
                  >
                    {registeringWebhook ? "Kaydediliyor..." : "Webhook Kaydet"}
                  </button>
                )}
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
          </div>

          {/* Adım 4: Oluşan API Bilgileri */}
          {integration.configured && (
            <div className="border-t border-gray-200 pt-6 mt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center">
                  ✓
                </span>
                Oluşan API bilgileri (paylaşılabilir)
              </h3>
              <div className="pl-8 space-y-2">
                {integration.apiInfo.map((info) => (
                  <div
                    key={info.label}
                    className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">{info.label}</p>
                      <code className="text-xs font-mono text-gray-900 break-all">{info.value}</code>
                    </div>
                    {info.value && info.value !== "—" && <CopyButton text={info.value} />}
                  </div>
                ))}
                <p className="text-xs text-gray-500 pt-1">
                  Bu bilgileri karşı taraf (entegratör, geliştirici) ile paylaşabilirsiniz.
                  Şifrelenmiş alanlar maskelenmiştir; karşı tarafa giderken yine kendi panelden almanız gerekir.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {!data?.marketplace && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center py-8">
          <p className="text-sm text-gray-500 mb-1">Pazaryeri henüz belirlenmemiş.</p>
          <p className="text-xs text-gray-400">Lütfen yönetici ile iletişime geçin.</p>
        </div>
      )}

      {/* ─── GÖRSEL PUSH AYARI ─────────────────────────────── */}
      {data?.marketplace && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Ürün Görselleri</h2>
          <p className="text-sm text-gray-500 mb-4">
            Açık olduğunda; yeni ürün gönderdiğinizde Tano'daki ürün görselleri pazaryeri mağazanıza da yüklenir.
          </p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pushImages}
              onChange={(e) => handleTogglePushImages(e.target.checked)}
              disabled={savingPushImages}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">
              Görselleri pazaryerine gönder
              {savingPushImages && <span className="text-xs text-gray-500 ml-2">kaydediliyor...</span>}
            </span>
          </label>
        </div>
      )}

      {/* ─── KARGO AYARLARI ─────────────────────────────── */}
      {/* Tano Toptan: kargo entegrasyonu pasif — üyeler kargo etiketini siparişte
          manuel yükler. Kod korunuyor, UI gizli (Epic D). */}
      {false && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Kargo Ayarları</h2>
        <p className="text-sm text-gray-500 mb-6">Kargo firmanızı seçin ve API bilgilerinizi girin.</p>

        {cargoError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {cargoError}
          </div>
        )}
        {cargoSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            {cargoSuccess}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kargo Firması</label>
            <select
              value={cargoProvider}
              onChange={(e) => {
                setCargoProvider(e.target.value);
                setCargoCredentials({});
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">Seçiniz</option>
              {cargoData?.availableProviders.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {cargoProvider && cargoSettingsKeys.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cargoSettingsKeys.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    value={cargoCredentials[field.key] || ""}
                    onChange={(e) => handleCargoChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          )}

          {cargoProvider && cargoProvider !== cargoData?.provider && (
            <p className="text-xs text-amber-600">
              Yeni kargo firmasını seçtiğinizde ayarları kaydetmeniz gerekiyor.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleCargoSave}
              disabled={cargoSaving || !cargoProvider}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors"
            >
              {cargoSaving ? "Kaydediliyor..." : "Kargo Ayarlarını Kaydet"}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
