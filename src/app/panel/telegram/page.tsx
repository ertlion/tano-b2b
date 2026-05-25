"use client";

import { useEffect, useState } from "react";

interface TgData {
  username: string;
  connected: boolean;
  prefs: Record<string, boolean>;
  botUsername: string;
  pairingLink: string;
}

const EVENTS: Array<{ key: string; label: string }> = [
  { key: "order", label: "Yeni sipariş" },
  { key: "defect_result", label: "Defolu talep sonucu" },
  { key: "low_balance", label: "Düşük bakiye uyarısı" },
  { key: "image_ready", label: "Görsel üretimi hazır" },
];

export default function TelegramPage() {
  const [data, setData] = useState<TgData | null>(null);
  const [username, setUsername] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/panel/telegram").then((r) => r.json()).then((j) => {
      if (j.data) { setData(j.data); setUsername(j.data.username || ""); setPrefs(j.data.prefs || {}); }
    }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/panel/telegram", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, prefs }),
      });
      if (!res.ok) throw new Error();
      setMsg("Kaydedildi"); load();
    } catch { setMsg("Kaydedilemedi"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Telegram Bildirimleri</h1>
        <p className="text-sm text-gray-500">Telegram&apos;dan sipariş ve talep bildirimleri alın.</p>
      </div>

      {msg && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${data?.connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {data?.connected ? "Bağlı ✓" : "Bağlı değil"}
          </span>
        </div>

        {!data?.connected && (
          data?.pairingLink ? (
            <a href={data.pairingLink} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm">
              Telegram&apos;da Bağlan
            </a>
          ) : (
            <p className="text-sm text-amber-600">Bot henüz yapılandırılmadı (admin Telegram bot ayarını girmeli).</p>
          )
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telegram Kullanıcı Adı</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="kullaniciadi" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Bildirim Tercihleri</p>
          <div className="space-y-2">
            {EVENTS.map((e) => (
              <label key={e.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={prefs[e.key] !== false} onChange={(ev) => setPrefs((p) => ({ ...p, [e.key]: ev.target.checked }))} className="w-4 h-4" />
                {e.label}
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
