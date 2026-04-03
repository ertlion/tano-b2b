import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { processExcelImport } from "@/lib/excel-import";
import { syncAllTenantsStock } from "@/lib/sync-engine";
import { sendNewProductsEmail } from "@/lib/mailer";
import { db } from "@/lib/db";
import {
  tenants,
  masterVariants,
} from "@/lib/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Excel dosyasi gerekli (field: file)" },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Sadece .xlsx veya .xls dosyalari kabul edilir" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Dollar rate for goods/mcapp price conversion
    const dollarRateStr = formData.get("dollarRate") as string | null;
    const dollarRate = dollarRateStr ? parseFloat(dollarRateStr) : 34.0;

    // Process the excel import
    const result = await processExcelImport(buffer, dollarRate);

    // Sync stock to all tenant marketplaces (fire-and-forget with logging)
    syncAllTenantsStock().catch((err) => {
      console.error("[IMPORT] Stock sync failed after import:", err);
    });

    // Send notification emails to approved tenants about new products
    if (result.newProducts > 0) {
      notifyTenantsAboutNewProducts(result).catch((err) => {
        console.error("[IMPORT] Tenant notification failed:", err);
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        newProducts: result.newProducts,
        updatedProducts: result.updatedProducts,
        totalVariants: result.totalVariants,
        stockChangesCount: result.stockChanges.length,
        errors: result.errors,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/PRODUCTS/IMPORT] POST error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

/**
 * Notify all approved tenants about newly imported products.
 * Runs in background - errors are logged but do not block the response.
 */
async function notifyTenantsAboutNewProducts(
  importResult: Awaited<ReturnType<typeof processExcelImport>>
) {
  const approvedTenants = await db.query.tenants.findMany({
    where: and(
      eq(tenants.isApproved, true),
      eq(tenants.isActive, true),
      eq(tenants.isAdmin, false)
    ),
    columns: { id: true, name: true, email: true },
  });

  if (approvedTenants.length === 0) return;

  // Gather newly created product details from stock changes
  // Stock changes with previousStock=0 on new products
  const newVariantIds = importResult.stockChanges
    .filter((sc) => sc.previousStock === 0)
    .map((sc) => sc.variantId);

  if (newVariantIds.length === 0) return;

  const newVariants = await db.query.masterVariants.findMany({
    where: inArray(masterVariants.id, newVariantIds),
    with: { masterProduct: true },
  });

  // Group by product
  const productMap = new Map<
    number,
    {
      name: string;
      sku: string;
      category?: string;
      variants: Array<{ size: string; salePrice: number }>;
    }
  >();

  for (const v of newVariants) {
    const existing = productMap.get(v.masterProductId);
    if (existing) {
      existing.variants.push({
        size: v.size,
        salePrice: Number(v.salePrice),
      });
    } else {
      productMap.set(v.masterProductId, {
        name: v.masterProduct.name,
        sku: v.masterProduct.sku,
        category: v.masterProduct.category ?? undefined,
        variants: [{ size: v.size, salePrice: Number(v.salePrice) }],
      });
    }
  }

  const products = Array.from(productMap.values());

  // Send email to each tenant
  for (const tenant of approvedTenants) {
    try {
      await sendNewProductsEmail({
        tenantEmail: tenant.email,
        tenantName: tenant.name,
        products,
      });
    } catch (err) {
      console.error(
        `[IMPORT] Failed to notify tenant ${tenant.id}:`,
        err
      );
    }
  }
}
