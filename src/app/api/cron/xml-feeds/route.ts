import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { xmlFeeds } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { importFromUrl } from "@/lib/xml-import";
import { syncAllTenantsStock } from "@/lib/sync-engine";

export const dynamic = "force-dynamic";

// Cron endpoint — her dakika hit edilebilir.
// Sadece intervalMinutes geçmiş aktif feed'leri çalıştırır.
// Header: x-cron-secret veya ?secret=...  ($WEBHOOK_SECRET ile eşleşmeli)
async function authorize(request: NextRequest): Promise<boolean> {
  const expected = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!expected) {
    console.warn("[CRON] WEBHOOK_SECRET tanımsız - cron koruması yok");
    return true; // dev kolaylığı; prod'da set edilmeli
  }
  const headerVal = request.headers.get("x-cron-secret");
  const queryVal = request.nextUrl.searchParams.get("secret");
  return headerVal === expected || queryVal === expected;
}

async function runDueFeeds() {
  const now = Date.now();
  const feeds = await db.query.xmlFeeds.findMany({
    where: eq(xmlFeeds.isActive, true),
  });

  const results: Array<{
    feedId: number;
    name: string;
    ran: boolean;
    summary?: unknown;
    error?: string;
  }> = [];

  let anyStockChange = false;

  for (const feed of feeds) {
    const nextRunAt = feed.lastRunAt
      ? feed.lastRunAt.getTime() + feed.intervalMinutes * 60 * 1000
      : 0;
    if (now < nextRunAt) {
      results.push({ feedId: feed.id, name: feed.name, ran: false });
      continue;
    }

    try {
      const result = await importFromUrl(feed.url);
      if (result.stockChanges.length > 0) anyStockChange = true;

      await db
        .update(xmlFeeds)
        .set({
          lastRunAt: new Date(),
          lastRunStatus:
            result.errors.length === 0
              ? "success"
              : result.totalVariants > 0
              ? "partial"
              : "error",
          lastRunSummary: {
            newProducts: result.newProducts,
            updatedProducts: result.updatedProducts,
            totalVariants: result.totalVariants,
            stockChangesCount: result.stockChanges.length,
            errorCount: result.errors.length,
            firstErrors: result.errors.slice(0, 5),
          },
          updatedAt: new Date(),
        })
        .where(eq(xmlFeeds.id, feed.id));

      results.push({
        feedId: feed.id,
        name: feed.name,
        ran: true,
        summary: {
          new: result.newProducts,
          updated: result.updatedProducts,
          variants: result.totalVariants,
          stockChanges: result.stockChanges.length,
          errors: result.errors.length,
        },
      });
    } catch (err) {
      results.push({
        feedId: feed.id,
        name: feed.name,
        ran: true,
        error: err instanceof Error ? err.message : "bilinmeyen hata",
      });
      await db
        .update(xmlFeeds)
        .set({
          lastRunAt: new Date(),
          lastRunStatus: "error",
          lastRunSummary: {
            errorMessage: err instanceof Error ? err.message : "hata",
          },
          updatedAt: new Date(),
        })
        .where(eq(xmlFeeds.id, feed.id));
    }
  }

  if (anyStockChange) {
    syncAllTenantsStock().catch((err) =>
      console.error("[CRON] Sync after XML import failed:", err)
    );
  }

  return results;
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runDueFeeds();
  return NextResponse.json({ success: true, results });
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runDueFeeds();
  return NextResponse.json({ success: true, results });
}
