import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { to } = body;

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { error: "Alici email adresi (to) zorunlu" },
        { status: 400 }
      );
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return NextResponse.json(
        { error: "SMTP ayarlari yapilandirilmamis (SMTP_HOST, SMTP_USER, SMTP_PASS)" },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: "Tano Atelier B2B - Test Email",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1f2937">Test Email</h2>
          <p style="color:#6b7280">Bu bir test emailidir. SMTP ayarlariniz dogru calisiyor.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">
            Gonderim zamani: ${new Date().toLocaleString("tr-TR")}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: "Test emaili gonderildi" });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json(
        { error: await error.text() },
        { status: error.status }
      );
    }
    console.error("[ADMIN/SETTINGS/test-email] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Email gonderilemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
