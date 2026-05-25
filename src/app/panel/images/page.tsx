"use client";

import { useEffect, useState } from "react";

interface Opt { id: string; label: string }
interface Presets { scenes: Opt[]; models: Opt[]; angles: Opt[] }
interface Gen { id: number; url: string; sortOrder: number }

export default function ImagesPage() {
  const [presets, setPresets] = useState<Presets | null>(null);
  const [sources, setSources] = useState<Array<{ mimeType: string; base64: string; preview: string }>>([]);
  const [sceneId, setSceneId] = useState("");
  const [modelId, setModelId] = useState("");
  const [angleId, setAngleId] = useState("");
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [gallery, setGallery] = useState<Gen[]>([]);

  useEffect(() => {
    fetch("/api/panel/images/presets").then((r) => r.json()).then((j) => {
      setPresets(j.data);
      if (j.data) { setSceneId(j.data.scenes[0]?.id || ""); setModelId(j.data.models[0]?.id || ""); setAngleId(j.data.angles[0]?.id || ""); }
    }).catch(() => {});
    loadGallery();
  }, []);

  function loadGallery() {
    fetch("/api/panel/images").then((r) => r.json()).then((j) => setGallery(j.data || [])).catch(() => {});
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 4).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.split("base64,")[1] || "";
        setSources((p) => [...p, { mimeType: f.type || "image/jpeg", base64, preview: dataUrl }]);
      };
      reader.readAsDataURL(f);
    });
  }

  async function generate() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/panel/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImages: sources.map((s) => ({ mimeType: s.mimeType, base64: s.base64 })),
          sceneId, modelId, angleId, count: Number(count),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Üretilemedi");
      setMsg(`${j.data.produced} görsel üretildi${j.data.failed ? `, ${j.data.failed} başarısız (iade edildi)` : ""}.`);
      loadGallery();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally { setBusy(false); }
  }

  async function del(id: number) {
    await fetch(`/api/panel/images/${id}`, { method: "DELETE" });
    setGallery((g) => g.filter((x) => x.id !== id));
  }

  async function move(idx: number, dir: -1 | 1) {
    const arr = [...gallery];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setGallery(arr);
    await fetch("/api/panel/images", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: arr.map((x) => x.id) }),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Görsel Üretimi</h1>
        <p className="text-sm text-gray-500">Ürün görselinizi yükleyin, mekan/manken/açı seçin, yeni görseller üretin. Üretim görsel bakiyenizden düşer.</p>
      </div>

      {msg && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">{msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        {/* Kaynak görseller */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Kaynak Ürün Görseli</label>
          <div className="flex flex-wrap gap-3">
            {sources.map((s, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.preview} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                <button onClick={() => setSources((p) => p.filter((_, k) => k !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer text-gray-400 hover:border-blue-400">
              +
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </div>
        </div>

        {/* Seçimler */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mekan</label>
            <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
              {presets?.scenes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Manken</label>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
              {presets?.models.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Açı</label>
            <select value={angleId} onChange={(e) => setAngleId(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
              {presets?.angles.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Adet</label>
            <input type="number" min="1" max="10" value={count} onChange={(e) => setCount(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>

        <button onClick={generate} disabled={busy || sources.length === 0} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm">
          {busy ? "Üretiliyor..." : "Görsel Üret"}
        </button>
      </div>

      {/* Galeri */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Görsellerim</h2>
        {gallery.length === 0 ? (
          <p className="text-sm text-gray-500">Henüz görsel üretmediniz.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {gallery.map((g, i) => (
              <div key={g.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" className="w-full aspect-[3/4] object-cover" />
                <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs px-1.5 py-0.5 border rounded disabled:opacity-30">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === gallery.length - 1} className="text-xs px-1.5 py-0.5 border rounded disabled:opacity-30">↓</button>
                  </div>
                  <button onClick={() => del(g.id)} className="text-xs text-red-600 hover:text-red-700">Sil</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
