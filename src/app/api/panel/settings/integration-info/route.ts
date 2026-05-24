import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getTenantSetting, setTenantSetting, getTenantSettings } from "@/lib/tenant-settings";
import type { MarketplaceName } from "@/lib/marketplace/types";

interface StepInstruction {
  title: string;
  body: string;
  fieldHint?: string;
}

interface IntegrationInfo {
  marketplace: MarketplaceName;
  displayName: string;
  redirects: { label: string; url: string; description: string }[];
  steps: StepInstruction[];
  apiInfo: { label: string; value: string; sensitive?: boolean }[];
  configured: boolean;
}

function appUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get("host")}`;
}

async function ensureTenantWebhookSecret(tenantId: number): Promise<string> {
  const existing = await getTenantSetting(tenantId, "webhook_secret");
  if (existing) return existing;
  const secret = crypto.randomBytes(24).toString("hex");
  await setTenantSetting(tenantId, "webhook_secret", secret);
  return secret;
}

function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAuth(request);
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { id: true, marketplace: true },
    });
    if (!tenant) return NextResponse.json({ error: "Bayi bulunamadı" }, { status: 404 });

    const marketplace = tenant.marketplace as MarketplaceName;
    const base = appUrl(request);
    const webhookSecret = await ensureTenantWebhookSecret(tenantId);
    const settings = await getTenantSettings(tenantId);

    const baseWebhookUrl = `${base}/api/webhooks/${marketplace}`;
    const webhookUrlWithTenant = `${baseWebhookUrl}?tenantId=${tenantId}`;

    let info: IntegrationInfo;

    switch (marketplace) {
      case "ikas": {
        const ikasAuthorize = `${base}/api/auth/ikas/authorize?storeName={MAGAZA_ADINIZ}`;
        const ikasCallback = `${base}/api/auth/ikas/callback`;
        info = {
          marketplace,
          displayName: "ikas",
          redirects: [
            {
              label: "Yönlendirme (Callback) URL",
              url: ikasCallback,
              description:
                "ikas Geliştirici Paneli → Uygulamalar → Uygulamanız → 'Yönlendirme URL' alanına yapıştırın.",
            },
            {
              label: "Webhook URL",
              url: webhookUrlWithTenant,
              description: "ikas → Ayarlar → Webhooks bölümünde 'order.created', 'product.updated' için bu URL'i ekleyin.",
            },
            {
              label: "Yetkilendirme Başlatma URL",
              url: ikasAuthorize,
              description: "İlk bağlantıyı yaparken bu URL'e gidin, {MAGAZA_ADINIZ} kısmını ikas mağaza isminizle değiştirin.",
            },
          ],
          steps: [
            {
              title: "1. ikas geliştirici uygulamanızı oluşturun",
              body: "ikas yönetim paneli → Geliştirici → Uygulamalar → Yeni uygulama. 'Yönlendirme URL' alanına yukarıdaki Callback URL'i yapıştırın.",
            },
            {
              title: "2. API Key ve Secret bilgilerini kopyalayın",
              body: "Oluşturulan uygulama detay sayfasından Client ID (API Key) ve Client Secret değerlerini alın.",
            },
            {
              title: "3. Aşağıdaki forma yapıştırıp Kaydet'e basın",
              body: "Mağaza URL'iniz (örn: ornek.myikas.com), API Key ve API Secret bilgilerini girip kaydedin.",
            },
          ],
          apiInfo: [
            { label: "ikas Mağaza URL", value: settings.ikas_store_url || "—" },
            { label: "API Key", value: settings.ikas_api_key || "—" },
            { label: "API Secret", value: maskSecret(settings.ikas_api_secret), sensitive: true },
            { label: "Webhook Secret (sizin)", value: webhookSecret, sensitive: true },
          ],
          configured: !!(settings.ikas_store_url && settings.ikas_api_key && settings.ikas_api_secret),
        };
        break;
      }

      case "shopify": {
        info = {
          marketplace,
          displayName: "Shopify",
          redirects: [
            {
              label: "Webhook URL",
              url: webhookUrlWithTenant,
              description:
                "Shopify Admin → Settings → Notifications → Webhooks bölümüne 'orders/create' ve 'orders/updated' olayları için bu URL'i ekleyin.",
            },
            {
              label: "Webhook Secret",
              url: webhookSecret,
              description: "Webhook eklerken 'Webhook signature' alanına bu değeri yapıştırın.",
            },
          ],
          steps: [
            {
              title: "1. Shopify Custom App oluşturun",
              body: "Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app. İsim verin ve oluşturun.",
            },
            {
              title: "2. Admin API izinlerini açın",
              body: "Configure Admin API scopes: read_products, write_products, read_inventory, write_inventory, read_orders, write_orders.",
            },
            {
              title: "3. Access Token'ı kopyalayın",
              body: "Install app → Reveal Admin API access token. Bu token'ı aşağıdaki forma yapıştırın.",
            },
            {
              title: "4. Webhook'ları kaydedin",
              body: "Form kaydedildikten sonra 'Webhook Kaydet' butonuna basın, sistem otomatik olarak sipariş webhook'larını kaydeder.",
            },
          ],
          apiInfo: [
            { label: "Store URL", value: settings.shopify_store_url || "—" },
            { label: "Access Token", value: maskSecret(settings.shopify_access_token), sensitive: true },
            { label: "Webhook URL", value: webhookUrlWithTenant },
            { label: "Webhook Secret", value: webhookSecret, sensitive: true },
          ],
          configured: !!(settings.shopify_store_url && settings.shopify_access_token),
        };
        break;
      }

      case "tsoft": {
        info = {
          marketplace,
          displayName: "T-Soft",
          redirects: [
            {
              label: "Webhook URL",
              url: webhookUrlWithTenant,
              description:
                "T-Soft Yönetim Paneli → Servisler → Webhook ayarları bölümüne yapıştırın.",
            },
          ],
          steps: [
            {
              title: "1. T-Soft API kullanıcısı oluşturun",
              body: "T-Soft Yönetim → Kullanıcılar → Yeni kullanıcı. API erişim yetkisi tanımlayın.",
            },
            {
              title: "2. API URL'ini öğrenin",
              body: "T-Soft API URL'iniz genelde 'https://<magazaniz>.tsoft.com.tr/rest1' formatındadır.",
            },
            {
              title: "3. Bilgileri aşağıdaki forma girin",
              body: "API URL, kullanıcı adı ve şifreyi girip kaydedin.",
            },
          ],
          apiInfo: [
            { label: "API URL", value: settings.tsoft_base_url || "—" },
            { label: "Kullanıcı Adı", value: settings.tsoft_username || "—" },
            { label: "Şifre", value: maskSecret(settings.tsoft_password), sensitive: true },
            { label: "Webhook URL", value: webhookUrlWithTenant },
          ],
          configured: !!(settings.tsoft_base_url && settings.tsoft_username && settings.tsoft_password),
        };
        break;
      }

      case "ideasoft": {
        info = {
          marketplace,
          displayName: "IdeaSoft",
          redirects: [
            {
              label: "Webhook URL",
              url: webhookUrlWithTenant,
              description: "IdeaSoft Yönetim Paneli → Geliştirici → Webhook ayarlarına yapıştırın.",
            },
          ],
          steps: [
            {
              title: "1. IdeaSoft API uygulaması oluşturun",
              body: "IdeaSoft Yönetim Paneli → Geliştirici → API Anahtarları → Yeni uygulama.",
            },
            {
              title: "2. Access Token oluşturun",
              body: "OAuth client_id/secret üzerinden veya 'Personal Access Token' alanından token alın.",
            },
            {
              title: "3. Mağaza URL'i + Token'ı girin",
              body: "Aşağıdaki forma mağaza URL'inizi (örn: magazaniz.idsmag.com) ve token'ı yapıştırıp kaydedin.",
            },
          ],
          apiInfo: [
            { label: "Mağaza URL", value: settings.ideasoft_store_url || "—" },
            { label: "Access Token", value: maskSecret(settings.ideasoft_access_token), sensitive: true },
            { label: "Webhook URL", value: webhookUrlWithTenant },
          ],
          configured: !!(settings.ideasoft_store_url && settings.ideasoft_access_token),
        };
        break;
      }

      case "trendyol": {
        info = {
          marketplace,
          displayName: "Trendyol",
          redirects: [
            {
              label: "Sipariş Çekme Bilgisi",
              url: `${base}/api/admin/trendyol/sync-orders`,
              description:
                "Trendyol Webhook desteklemediği için sipariş senkronu otomatik olarak Tano sistemi tarafından çekilir. URL'i karşı tarafa paylaşmanıza gerek yok.",
            },
          ],
          steps: [
            {
              title: "1. Trendyol Partner Hesabınızı açın",
              body: "https://partner.trendyol.com → Entegrasyon Bilgileri menüsünden API Key, API Secret ve Satıcı ID bilgilerinizi alın.",
            },
            {
              title: "2. API bilgilerini forma girin",
              body: "Aşağıdaki forma Satıcı ID, API Key ve API Secret'i girip kaydedin.",
            },
            {
              title: "3. Sipariş senkronunu test edin",
              body: "Kaydettikten sonra 'Bağlantıyı Test Et' butonuyla erişimi doğrulayın.",
            },
          ],
          apiInfo: [
            { label: "Satıcı ID", value: settings.trendyol_supplier_id || "—" },
            { label: "API Key", value: settings.trendyol_api_key || "—" },
            { label: "API Secret", value: maskSecret(settings.trendyol_api_secret), sensitive: true },
          ],
          configured: !!(
            settings.trendyol_supplier_id &&
            settings.trendyol_api_key &&
            settings.trendyol_api_secret
          ),
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Pazaryeri tanımsız" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: info });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status });
    }
    console.error("[INTEGRATION-INFO] GET:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
