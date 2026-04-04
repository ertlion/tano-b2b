"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const MARKETPLACE_OPTIONS = [
  { value: "shopify", label: "Shopify" },
  { value: "ikas", label: "ikas" },
  { value: "tsoft", label: "TSoft" },
  { value: "ideasoft", label: "IdeaSoft" },
];

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const ikasToken = searchParams.get("ikas_token");
  const ikasError = searchParams.get("ikas_error");
  const isIkasFlow = !!ikasToken;

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
    phone: "",
    marketplace: isIkasFlow ? "ikas" : "",
  });
  const [error, setError] = useState(ikasError || "");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ikasStore, setIkasStore] = useState("");

  useEffect(() => {
    if (ikasToken) {
      try {
        const data = JSON.parse(atob(ikasToken.replace(/-/g, "+").replace(/_/g, "/")));
        setIkasStore(data.storeUrl || "");
        setForm((prev) => ({ ...prev, marketplace: "ikas" }));
      } catch {
        // Invalid token
      }
    }
  }, [ikasToken]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body: Record<string, string> = { ...form };
      if (ikasToken) {
        body.ikas_token = ikasToken;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Kayıt başarısız");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Tano Atelier</h1>
            <p className="text-gray-500 mt-1">B2B Toptan Sipariş Platformu</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Kayıt Başarılı</h2>
            <p className="text-gray-600 text-sm mb-6">
              {isIkasFlow
                ? "Hesabınız oluşturuldu ve ikas mağazanız bağlandı. Admin onayından sonra giriş yapabileceksiniz."
                : "Hesabınız oluşturuldu. Admin onayından sonra giriş yapabileceksiniz."}
            </p>
            <Link
              href="/login"
              className="inline-block py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              Giriş Sayfasına Dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tano Atelier</h1>
          <p className="text-gray-500 mt-1">B2B Toptan Sipariş Platformu</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Kayıt Ol</h2>

          {isIkasFlow && ikasStore && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
              <strong>ikas mağazası:</strong> {ikasStore}
              <br />
              <span className="text-blue-500 text-xs">Kayıt tamamlanınca mağazanız otomatik bağlanacak.</span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
              <input id="name" type="text" required value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input id="email" type="email" required value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input id="password" type="password" required minLength={6} value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <div>
              <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">Firma Adı</label>
              <input id="company" type="text" required value={form.company}
                onChange={(e) => updateField("company", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input id="phone" type="tel" required value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="05XX XXX XX XX" />
            </div>

            {!isIkasFlow && (
              <div>
                <label htmlFor="marketplace" className="block text-sm font-medium text-gray-700 mb-1">E-ticaret Platformu</label>
                <select id="marketplace" required value={form.marketplace}
                  onChange={(e) => updateField("marketplace", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">Platform seçin</option>
                  {MARKETPLACE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg text-sm transition-colors">
              {loading ? "Kayıt yapılıyor..." : isIkasFlow ? "Kayıt Ol ve Mağazayı Bağla" : "Kayıt Ol"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Zaten hesabınız var mı?{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Giriş Yap</Link>
        </p>
      </div>
    </main>
  );
}
