import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { xmlFeeds } from "@/lib/schema";
import { desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const feeds = await db.query.xmlFeeds.findMany({
      orderBy: [desc(xmlFeeds.createdAt)],
    });
    return NextResponse.json({ success: true, data: feeds });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[XML-FEEDS] GET:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const { name, url, intervalMinutes, isActive } = body as {
      name?: string;
      url?: string;
      intervalMinutes?: number;
      isActive?: boolean;
    };

    if (!name?.trim() || !url?.trim()) {
      return NextResponse.json({ error: "İsim ve URL zorunludur" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Geçersiz URL" }, { status: 400 });
    }

    const interval = Math.max(5, Math.min(1440, Number(intervalMinutes) || 60));

    const [feed] = await db
      .insert(xmlFeeds)
      .values({
        name: name.trim(),
        url: url.trim(),
        intervalMinutes: interval,
        isActive: isActive !== false,
      })
      .returning();

    return NextResponse.json({ success: true, data: feed });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[XML-FEEDS] POST:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
