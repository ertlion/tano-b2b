import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeUrl = searchParams.get("storeName") || searchParams.get("store");

  if (!storeUrl) {
    return NextResponse.json({ error: "store parametresi gerekli (storeName veya store)" }, { status: 400 });
  }

  const clientId = process.env.IKAS_APP_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/ikas/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "IKAS_APP_CLIENT_ID yapılandırılmamış" }, { status: 500 });
  }

  // Clean store URL
  const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const baseUrl = cleanStore.includes("myikas.com") ? `https://${cleanStore}` : `https://${cleanStore}.myikas.com`;

  const authUrl = new URL(`${baseUrl}/api/admin/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "read_product write_product read_product_stock write_product_stock read_order write_order");
  authUrl.searchParams.set("state", cleanStore);

  return NextResponse.redirect(authUrl.toString());
}
