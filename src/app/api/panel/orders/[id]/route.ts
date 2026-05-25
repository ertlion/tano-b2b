import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders, orderStatusHistory, masterVariants, masterProducts, tenants } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { statusAfterDocUpdate } from "@/lib/order-status";
import { getBalance } from "@/lib/balance";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RawOrderItem {
  masterVariantId?: number;
  title?: string;
  productName?: string;
  sku?: string;
  barcode?: string;
  size?: string;
  color?: string;
  quantity?: number;
  unitPrice?: number;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const orderId = parseInt(id);

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
    }

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
      with: {
        orderStatusHistory: {
          orderBy: (h, { desc }) => [desc(h.createdAt)],
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    // Enrich items
    const rawItems = Array.isArray(order.items) ? (order.items as RawOrderItem[]) : [];
    const variantIds = rawItems
      .map((i) => i.masterVariantId)
      .filter((id): id is number => typeof id === "number" && id > 0);

    let variantMap = new Map<number, { color: string | null; size: string; sku: string; barcode: string; productName: string | null; productImages: string[] | null }>();

    if (variantIds.length > 0) {
      const variants = await db
        .select({
          id: masterVariants.id,
          color: masterVariants.color,
          size: masterVariants.size,
          sku: masterVariants.sku,
          barcode: masterVariants.barcode,
          productName: masterProducts.name,
          productImages: masterProducts.images,
        })
        .from(masterVariants)
        .leftJoin(masterProducts, eq(masterVariants.masterProductId, masterProducts.id))
        .where(inArray(masterVariants.id, variantIds));
      variantMap = new Map(variants.map((v) => [v.id, v]));
    }

    const enrichedItems = rawItems.map((item) => {
      const variant = item.masterVariantId ? variantMap.get(item.masterVariantId) : undefined;
      const images = variant?.productImages;
      const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null;
      return {
        productName: variant?.productName || String(item.title || item.productName || "-"),
        productImage: firstImage,
        color: variant?.color || String(item.color || "-"),
        size: variant?.size || String(item.size || "-"),
        sku: variant?.sku || String(item.sku || ""),
        barcode: variant?.barcode || String(item.barcode || ""),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      };
    });

    return NextResponse.json({ success: true, data: { ...order, enrichedItems } });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[PANEL/ORDERS/:id] GET error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// Üye: fatura ve/veya kargo etiketi yükle (base64 veya URL). null gönderilirse temizler.
// İkisi de doluysa sipariş "hazirlanacak" olur (Epic D).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await requireAuth(request);
    const { id } = await params;
    const orderId = parseInt(id);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
    }

    const body = await request.json();
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
      columns: { id: true, status: true, invoiceFileUrl: true, cargoLabelFileUrl: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    // Bakiye kapısı (Epic E): borçtaki (negatif ürün bakiyesi) üye, izni yoksa
    // fatura/kargo etiketi yükleyemez. Dosya yükleme/güncelleme deneniyorsa kontrol et.
    const isUploading = body.invoiceFile != null || body.cargoLabelFile != null;
    if (isUploading) {
      const t = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { allowActionWithoutBalance: true },
      });
      if (!t?.allowActionWithoutBalance) {
        const productBalance = await getBalance(tenantId, "product");
        if (productBalance < 0) {
          return NextResponse.json(
            {
              error:
                "Bakiyeniz yetersiz (borçta). Fatura/kargo etiketi yükleyebilmek için bakiye yükleyin.",
              code: "INSUFFICIENT_BALANCE",
            },
            { status: 403 }
          );
        }
      }
    }

    const invoiceFileUrl =
      body.invoiceFile === null
        ? null
        : typeof body.invoiceFile === "string"
        ? body.invoiceFile
        : order.invoiceFileUrl;
    const cargoLabelFileUrl =
      body.cargoLabelFile === null
        ? null
        : typeof body.cargoLabelFile === "string"
        ? body.cargoLabelFile
        : order.cargoLabelFileUrl;

    const hasInvoice = Boolean(invoiceFileUrl);
    const hasLabel = Boolean(cargoLabelFileUrl);
    const newStatus = statusAfterDocUpdate(order.status, hasInvoice, hasLabel);

    await db
      .update(orders)
      .set({
        invoiceFileUrl,
        cargoLabelFileUrl,
        invoiceUploadedAt: hasInvoice ? new Date() : null,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    if (newStatus !== order.status) {
      await db.insert(orderStatusHistory).values({
        orderId,
        fromStatus: order.status,
        toStatus: newStatus,
        note: "Üye fatura/kargo etiketi güncelledi",
      });
    }

    return NextResponse.json({
      success: true,
      data: { status: newStatus, hasInvoice, hasLabel },
    });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[PANEL/ORDERS/:id] PATCH error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
