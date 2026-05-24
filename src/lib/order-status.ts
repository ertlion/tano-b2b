// ─── Tano Toptan Sipariş Durum Makinesi (Epic D) ───────────────
//
// bekleniyor → (üye fatura+etiket yükledi) hazirlanacak
//            → (Tano işleme aldı) paketlendi → gonderildi
// İptal: cancelled. İnceleme: pending_review (iade geçmişi olan siparişler).

export const ORDER_STATUS = {
  BEKLENIYOR: "bekleniyor",
  HAZIRLANACAK: "hazirlanacak",
  PAKETLENDI: "paketlendi",
  GONDERILDI: "gonderildi",
  IPTAL: "cancelled",
  INCELEME: "pending_review",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  bekleniyor: "Bekleniyor",
  hazirlanacak: "Hazırlanacak",
  paketlendi: "Paketlendi",
  gonderildi: "Gönderildi",
  cancelled: "İptal",
  pending_review: "İnceleme Gerekli",
};

// Admin'in elle yapabileceği ileri geçişler.
const ADMIN_FORWARD: Record<string, string[]> = {
  hazirlanacak: [ORDER_STATUS.PAKETLENDI],
  paketlendi: [ORDER_STATUS.GONDERILDI],
};

export function canAdminTransition(from: string, to: string): boolean {
  return (ADMIN_FORWARD[from] ?? []).includes(to);
}

/**
 * Fatura + kargo etiketi yüklendiğinde sipariş hazırlanacak olur.
 * Üye dosyaları geri çekerse (ikisinden biri eksilirse) tekrar bekleniyor'a döner.
 */
export function statusAfterDocUpdate(
  currentStatus: string,
  hasInvoice: boolean,
  hasLabel: boolean
): string {
  // Tano işleme aldıysa (paketlendi/gonderildi) belge değişimi durumu geri almaz.
  if (currentStatus === ORDER_STATUS.PAKETLENDI || currentStatus === ORDER_STATUS.GONDERILDI) {
    return currentStatus;
  }
  if (currentStatus === ORDER_STATUS.IPTAL || currentStatus === ORDER_STATUS.INCELEME) {
    return currentStatus;
  }
  return hasInvoice && hasLabel ? ORDER_STATUS.HAZIRLANACAK : ORDER_STATUS.BEKLENIYOR;
}
