import { db } from "./db";
import { balances, balanceTransactions } from "./schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Bakiye/Cüzdan (Epic E) ────────────────────────────────
// İki tip: 'product' (sipariş) ve 'image' (AI görsel). Tüm hareketler ledger'a yazılır.

export type BalanceType = "product" | "image";
export type BalanceReason =
  | "admin_add"
  | "order"
  | "image_gen"
  | "paytr_load"
  | "transfer"
  | "refund";

export async function getBalance(tenantId: number, type: BalanceType): Promise<number> {
  const row = await db.query.balances.findFirst({
    where: and(eq(balances.tenantId, tenantId), eq(balances.type, type)),
  });
  return row ? Number(row.amount) : 0;
}

export async function getBalances(tenantId: number): Promise<{ product: number; image: number }> {
  const rows = await db.query.balances.findMany({ where: eq(balances.tenantId, tenantId) });
  const out = { product: 0, image: 0 };
  for (const r of rows) {
    if (r.type === "product") out.product = Number(r.amount);
    else if (r.type === "image") out.image = Number(r.amount);
  }
  return out;
}

/**
 * Bakiye ekle (pozitif) — admin_add / paytr_load / refund.
 */
export async function addBalance(
  tenantId: number,
  type: BalanceType,
  amount: number,
  reason: BalanceReason,
  opts?: { reference?: string; note?: string }
): Promise<number> {
  if (amount <= 0) throw new Error("Eklenecek tutar pozitif olmalı");

  const [row] = await db
    .insert(balances)
    .values({ tenantId, type, amount: String(amount), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [balances.tenantId, balances.type],
      set: { amount: sql`${balances.amount} + ${amount}`, updatedAt: new Date() },
    })
    .returning({ amount: balances.amount });

  const after = Number(row.amount);
  await db.insert(balanceTransactions).values({
    tenantId,
    type,
    amount: String(amount),
    balanceAfter: String(after),
    reason,
    reference: opts?.reference ?? null,
    note: opts?.note ?? null,
  });
  return after;
}

/**
 * Bakiye düş (atomik, yetersizse düşmez). Başarılıysa { ok:true, balanceAfter }.
 */
export async function deductBalance(
  tenantId: number,
  type: BalanceType,
  amount: number,
  reason: BalanceReason,
  opts?: { reference?: string; note?: string; force?: boolean }
): Promise<{ ok: boolean; balanceAfter: number }> {
  if (amount <= 0) return { ok: true, balanceAfter: await getBalance(tenantId, type) };

  // force=true: bakiye yetersiz olsa bile düş (borç/eksi bakiye olabilir) — sipariş anı için.
  // force=false: atomik, yalnızca yeterliyse düş.
  if (opts?.force) {
    const [row] = await db
      .insert(balances)
      .values({ tenantId, type, amount: String(-amount), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [balances.tenantId, balances.type],
        set: { amount: sql`${balances.amount} - ${amount}`, updatedAt: new Date() },
      })
      .returning({ amount: balances.amount });
    const after = Number(row.amount);
    await db.insert(balanceTransactions).values({
      tenantId,
      type,
      amount: String(-amount),
      balanceAfter: String(after),
      reason,
      reference: opts?.reference ?? null,
      note: opts?.note ?? null,
    });
    return { ok: true, balanceAfter: after };
  }

  const [row] = await db
    .update(balances)
    .set({ amount: sql`${balances.amount} - ${amount}`, updatedAt: new Date() })
    .where(
      and(
        eq(balances.tenantId, tenantId),
        eq(balances.type, type),
        sql`${balances.amount} >= ${amount}`
      )
    )
    .returning({ amount: balances.amount });

  if (!row) {
    return { ok: false, balanceAfter: await getBalance(tenantId, type) };
  }

  const after = Number(row.amount);
  await db.insert(balanceTransactions).values({
    tenantId,
    type,
    amount: String(-amount),
    balanceAfter: String(after),
    reason,
    reference: opts?.reference ?? null,
    note: opts?.note ?? null,
  });
  return { ok: true, balanceAfter: after };
}

export async function getTransactions(tenantId: number, limit = 50) {
  return db.query.balanceTransactions.findMany({
    where: eq(balanceTransactions.tenantId, tenantId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit,
  });
}
