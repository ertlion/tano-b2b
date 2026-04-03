"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface OrderItem {
  productName: string;
  sku: string;
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface StatusHistoryEntry {
  id: number;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

interface ShippingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
}

interface OrderDetail {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  totalAmount: string;
  currency: string;
  status: string;
  cargoCompany: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingUrl: string | null;
  notes: string | null;
  shippingAddress: ShippingAddress | null;
  items: OrderItem[];
  orderStatusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  preparing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Yeni",
  processing: "İşleniyor",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
};

export default function PanelOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrder() {
      try {
        const res = await fetch(`/api/panel/orders/${orderId}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        setOrder(json.data);
      } catch {
        setError("Sipariş yüklenemedi");
      } finally {
        setLoading(false);
      }
    }
    loadOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="space-y-6">
        <Link href="/panel/orders" className="text-blue-600 hover:text-blue-700 text-sm">
          &larr; Siparişlere Don
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const address = order.shippingAddress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/panel/orders" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h1>
          <p className="text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleString("tr-TR")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Müşteri</p>
                <p className="text-sm text-gray-900 font-medium">{order.customerName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Durum</p>
                <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                  {STATUS_LABEL[order.status] || order.status}
                </span>
              </div>
              {order.customerEmail && (
                <div>
                  <p className="text-xs text-gray-500">E-posta</p>
                  <p className="text-sm text-gray-900">{order.customerEmail}</p>
                </div>
              )}
              {order.customerPhone && (
                <div>
                  <p className="text-xs text-gray-500">Telefon</p>
                  <p className="text-sm text-gray-900">{order.customerPhone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">Toplam Tutar</p>
                <p className="text-sm text-gray-900 font-bold">
                  {Number(order.totalAmount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currency}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Tarih</p>
                <p className="text-sm text-gray-900">
                  {new Date(order.createdAt).toLocaleString("tr-TR")}
                </p>
              </div>
            </div>

            {/* Cargo info */}
            {order.cargoTrackingNumber && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Kargo Bilgileri</p>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-purple-900">
                        {order.cargoCompany}
                      </p>
                      <p className="text-xs text-purple-700 font-mono">
                        {order.cargoTrackingNumber}
                      </p>
                    </div>
                  </div>
                  {order.cargoTrackingUrl && (
                    <a
                      href={order.cargoTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-purple-700 hover:text-purple-800 font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Kargoyu Takip Et
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Ürünler</h2>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                Ürün bilgisi bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ürün</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Beden</th>
                      <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Adet</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Birim Fiyat</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900">{item.productName}</td>
                        <td className="px-6 py-3 text-gray-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-6 py-3 text-gray-600">{item.size}</td>
                        <td className="px-6 py-3 text-center text-gray-900">{item.quantity}</td>
                        <td className="px-6 py-3 text-right text-gray-600">
                          {Number(item.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                        </td>
                        <td className="px-6 py-3 text-right text-gray-900 font-medium">
                          {Number(item.totalPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Shipping Address */}
          {address && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Teslimat Adresi</h2>
              <div className="text-sm text-gray-700 space-y-1">
                {address.name && <p className="font-medium">{address.name}</p>}
                {address.address1 && <p>{address.address1}</p>}
                {address.address2 && <p>{address.address2}</p>}
                <p>
                  {[address.district, address.city, address.postalCode].filter(Boolean).join(", ")}
                </p>
                {address.country && <p>{address.country}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Status Timeline */}
        <div className="space-y-6">
          {/* Current Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Durumu</h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700"}`}>
                {STATUS_LABEL[order.status] || order.status}
              </span>
            </div>
            {order.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notlar</p>
                <p className="text-sm text-gray-700">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Status History */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Durum Gecmisi</h2>

            {order.orderStatusHistory.length === 0 ? (
              <p className="text-sm text-gray-500">Henüz durum değişikliği yok.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-4">
                  {order.orderStatusHistory.map((entry) => (
                    <div key={entry.id} className="relative pl-8">
                      <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[entry.toStatus] || "bg-gray-100 text-gray-700"}`}>
                            {STATUS_LABEL[entry.toStatus] || entry.toStatus}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {STATUS_LABEL[entry.fromStatus] || entry.fromStatus} &rarr; {STATUS_LABEL[entry.toStatus] || entry.toStatus}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(entry.createdAt).toLocaleString("tr-TR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
