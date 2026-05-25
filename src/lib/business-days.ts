// İş günü hesabı (Epic H) — hafta sonları hariç.
// NOT: Türkiye resmi tatilleri şimdilik dahil değil; gerekirse tatil tablosu eklenir.

export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let count = 0;
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay(); // 0=Pazar, 6=Cumartesi
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * orderDate'ten bu yana geçen iş günü, maxDays'i AŞMADIYSA true (işlem yapılabilir).
 */
export function isWithinBusinessDays(orderDate: Date, maxDays = 5): boolean {
  return businessDaysBetween(orderDate, new Date()) <= maxDays;
}
