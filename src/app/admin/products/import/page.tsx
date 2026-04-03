"use client";

import { useState, useRef, DragEvent } from "react";
import Link from "next/link";

interface ImportResult {
  newProducts: number;
  updatedProducts: number;
  totalVariants: number;
  stockChanges?: Array<{
    sku: string;
    productName: string;
    size: string;
    previousStock: number;
    newStock: number;
  }>;
  errors?: string[];
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrag(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isValidFile(droppedFile)) {
      setFile(droppedFile);
      setError("");
    } else {
      setError("Sadece .xlsx ve .xls dosyalari kabul edilir.");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected && isValidFile(selected)) {
      setFile(selected);
      setError("");
    } else if (selected) {
      setError("Sadece .xlsx ve .xls dosyalari kabul edilir.");
    }
  }

  function isValidFile(f: File): boolean {
    const ext = f.name.toLowerCase();
    return ext.endsWith(".xlsx") || ext.endsWith(".xls");
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import başarısız oldu");
        return;
      }

      setResult(data);
      setFile(null);
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/products" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Excel Import</h1>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
            dragActive
              ? "border-blue-400 bg-blue-50"
              : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 hover:border-gray-400 bg-gray-50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <>
              <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </>
          ) : (
            <>
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-700">
                Dosyayi surukleyin veya tiklayarak secin
              </p>
              <p className="text-xs text-gray-500 mt-1">
                .xlsx veya .xls dosyalari kabul edilir
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
          >
            {uploading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Yükleniyor...
              </>
            ) : (
              "Yükle ve İşlem Yap"
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Sonucu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600">Yeni Ürün</p>
                <p className="text-2xl font-bold text-green-700">{result.newProducts}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600">Güncellenen Ürün</p>
                <p className="text-2xl font-bold text-blue-700">{result.updatedProducts}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-purple-600">Toplam Varyant</p>
                <p className="text-2xl font-bold text-purple-700">{result.totalVariants}</p>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <p className="text-sm font-medium text-yellow-800 mb-1">Uyarilar:</p>
                <ul className="text-xs text-yellow-700 space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.stockChanges && result.stockChanges.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Stok Değişiklikleri</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Beden</th>
                      <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Eski Stok</th>
                      <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Yeni Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.stockChanges.map((change, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900">{change.productName}</td>
                        <td className="px-6 py-3 text-gray-500 font-mono text-xs">{change.sku}</td>
                        <td className="px-6 py-3 text-gray-600">{change.size}</td>
                        <td className="px-6 py-3 text-center text-gray-500">{change.previousStock}</td>
                        <td className={`px-6 py-3 text-center font-medium ${change.newStock > change.previousStock ? "text-green-600" : "text-red-600"}`}>
                          {change.newStock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
