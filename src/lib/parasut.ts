// Parasut (parasut.com) e-fatura API client
// Auth: OAuth2 password grant
// Base: https://api.parasut.com/v4/{company_id}/
// Format: JSONAPI spec
// Rate limit: 10 req / 10 sec
// Token expires: 2 hours

export interface ParasutConfig {
  clientId: string;
  clientSecret: string;
  email: string;
  password: string;
  companyId: string;
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

// In-memory token cache
let cachedToken: TokenData | null = null;

function isTokenValid(): boolean {
  if (!cachedToken) return false;
  // Refresh 5 minutes before expiry
  return cachedToken.expiresAt - 5 * 60 * 1000 > Date.now();
}

async function authenticate(config: ParasutConfig): Promise<TokenData> {
  const res = await fetch("https://api.parasut.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.email,
      password: config.password,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parasut auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(config: ParasutConfig, refreshToken: string): Promise<TokenData> {
  const res = await fetch("https://api.parasut.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    // Refresh failed, do full auth
    return authenticate(config);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getToken(config: ParasutConfig): Promise<string> {
  if (isTokenValid() && cachedToken) {
    return cachedToken.accessToken;
  }

  try {
    if (cachedToken?.refreshToken) {
      cachedToken = await refreshAccessToken(config, cachedToken.refreshToken);
    } else {
      cachedToken = await authenticate(config);
    }
    return cachedToken.accessToken;
  } catch {
    // Reset and retry with fresh auth
    cachedToken = null;
    cachedToken = await authenticate(config);
    return cachedToken.accessToken;
  }
}

// Clear cached token (useful for testing)
export function clearTokenCache(): void {
  cachedToken = null;
}

const BASE_URL = "https://api.parasut.com/v4";

function apiUrl(config: ParasutConfig, path: string): string {
  return `${BASE_URL}/${config.companyId}/${path}`;
}

async function apiRequest(
  config: ParasutConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getToken(config);
  const url = apiUrl(config, path);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parasut API error (${res.status} ${method} ${path}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── CONTACTS ──────────────────────────────────────────────

interface ContactInput {
  name: string;
  email?: string;
  taxOffice?: string;
  taxNumber?: string;
  phone?: string;
  city?: string;
}

export async function findOrCreateContact(
  config: ParasutConfig,
  input: ContactInput
): Promise<string> {
  // Search by name first
  const searchRes = (await apiRequest(config, "GET", `contacts?filter[name]=${encodeURIComponent(input.name)}`)) as {
    data?: Array<{ id: string; attributes: { name: string } }>;
  };

  if (searchRes?.data && searchRes.data.length > 0) {
    return searchRes.data[0].id;
  }

  // Create new contact
  const createRes = (await apiRequest(config, "POST", "contacts", {
    data: {
      type: "contacts",
      attributes: {
        name: input.name,
        email: input.email || undefined,
        tax_office: input.taxOffice || undefined,
        tax_number: input.taxNumber || undefined,
        phone: input.phone || undefined,
        city: input.city || undefined,
        contact_type: "company",
        account_type: "customer",
      },
    },
  })) as { data: { id: string } };

  return createRes.data.id;
}

// ─── PRODUCTS ──────────────────────────────────────────────

interface ProductInput {
  name: string;
  code?: string;
  vatRate?: number;
  unitPrice?: number;
}

export async function findOrCreateProduct(
  config: ParasutConfig,
  input: ProductInput
): Promise<string> {
  // Search by name
  const searchRes = (await apiRequest(config, "GET", `products?filter[name]=${encodeURIComponent(input.name)}`)) as {
    data?: Array<{ id: string }>;
  };

  if (searchRes?.data && searchRes.data.length > 0) {
    return searchRes.data[0].id;
  }

  const createRes = (await apiRequest(config, "POST", "products", {
    data: {
      type: "products",
      attributes: {
        name: input.name,
        code: input.code || undefined,
        vat_rate: input.vatRate ?? 20,
        unit: "Adet",
        list_price: input.unitPrice ? String(input.unitPrice) : undefined,
        currency: "TRL",
        buying_currency: "TRL",
        selling_currency: "TRL",
      },
    },
  })) as { data: { id: string } };

  return createRes.data.id;
}

// ─── SALES INVOICE ─────────────────────────────────────────

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  productId?: string;
}

interface CreateInvoiceInput {
  contactId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string;
  description?: string;
  items: InvoiceLineItem[];
}

interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
}

export async function createSalesInvoice(
  config: ParasutConfig,
  input: CreateInvoiceInput
): Promise<CreateInvoiceResult> {
  // Build line items as relationships
  const details = input.items.map((item) => {
    const detail: Record<string, unknown> = {
      type: "sales_invoice_details",
      attributes: {
        quantity: item.quantity,
        unit_price: String(item.unitPrice),
        vat_rate: item.vatRate,
        description: item.description,
      },
    };

    if (item.productId) {
      detail.relationships = {
        product: {
          data: { id: item.productId, type: "products" },
        },
      };
    }

    return detail;
  });

  const invoiceData: Record<string, unknown> = {
    data: {
      type: "sales_invoices",
      attributes: {
        item_type: "invoice",
        description: input.description || "",
        issue_date: input.issueDate,
        due_date: input.dueDate || input.issueDate,
        currency: "TRL",
      },
      relationships: {
        contact: {
          data: { id: input.contactId, type: "contacts" },
        },
        details: {
          data: details,
        },
      },
    },
  };

  const res = (await apiRequest(config, "POST", "sales_invoices", invoiceData)) as {
    data: {
      id: string;
      attributes: {
        invoice_no?: string;
        invoice_series?: string;
        description?: string;
      };
    };
  };

  return {
    invoiceId: res.data.id,
    invoiceNumber: res.data.attributes.invoice_no || res.data.id,
  };
}

// ─── TEST CONNECTION ───────────────────────────────────────

export async function testConnection(config: ParasutConfig): Promise<{ success: boolean; error?: string }> {
  try {
    clearTokenCache();
    await getToken(config);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
    };
  }
}
