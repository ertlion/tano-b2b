"use client";

import { useEffect, useState } from "react";

interface Field {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string;
}

export default function IntegrationsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((j) => setFields(j.data || []))
      .catch(() => setMsg("Yüklenemedi"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      // Sadece kullanıcının doldurduğu alanları gönder.
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(edits)) {
        if (v.trim() !== "") payload[k] = v;
      }
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Kaydedilemedi");
      setMsg(`${j.data?.updated ?? 0} alan kaydedildi`);
      setEdits({});
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setSaving(false);
    }
  }

  const groups = Array.from(new Set(fields.map((f) => f.group)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entegrasyonlar</h1>
        <p className="text-sm text-gray-500">
          ikas, PayTR, AI görsel (Gemini) ve görsel depolama (S3) ayarları. Gizli alanlar maskelenir; boş bırakılan alan mevcut değeri korur.
        </p>
      </div>

      {msg && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{group}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.filter((f) => f.group === group).map((f) => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {f.label}
                      {f.secret && f.isSet && <span className="ml-2 text-xs text-green-600">• kayıtlı</span>}
                      {!f.isSet && <span className="ml-2 text-xs text-amber-500">• tanımsız</span>}
                    </label>
                    <input
                      type={f.secret ? "password" : "text"}
                      value={edits[f.key] ?? (f.secret ? "" : f.value)}
                      onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.secret && f.isSet ? "•••••• (değiştirmek için yaz)" : ""}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
