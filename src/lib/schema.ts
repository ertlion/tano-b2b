import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  json,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── TENANTS ───────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  marketplace: varchar("marketplace", { length: 50 }).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  discountRate: numeric("discount_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  // Üyenin varsayılan kar marjı (%). Varyant bazlı override yoksa bu uygulanır.
  defaultMarkupPercent: numeric("default_markup_percent", { precision: 6, scale: 2 }).default("0").notNull(),
  // AI görsel üretiminde görsel başına düşülecek birim fiyat (TL) — kullanıcı bazlı.
  imageUnitPrice: numeric("image_unit_price", { precision: 10, scale: 2 }).default("0").notNull(),
  // Bakiyesi yokken fatura/kargo etiketi yükleyebilsin mi? (admin kullanıcı bazlı)
  allowActionWithoutBalance: boolean("allow_action_without_balance").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  settings: many(settings),
  tenantProducts: many(tenantProducts),
  orders: many(orders),
  syncLogs: many(syncLogs),
  notifications: many(notifications),
  returns: many(returns),
  invoices: many(invoices),
  payments: many(payments),
}));

// ─── SETTINGS ──────────────────────────────────────────────

export const settings = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: varchar("key", { length: 255 }).notNull(),
    value: text("value").notNull(),
  },
  (table) => [uniqueIndex("settings_tenant_key_idx").on(table.tenantId, table.key)]
);

export const settingsRelations = relations(settings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [settings.tenantId],
    references: [tenants.id],
  }),
}));

// ─── MASTER PRODUCTS ───────────────────────────────────────

export const masterProducts = pgTable("master_products", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  externalId: varchar("external_id", { length: 100 }).unique(),
  barcode: varchar("barcode", { length: 100 }),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  images: json("images").$type<string[]>().default([]).notNull(),
  brand: varchar("brand", { length: 255 }).default("Tano Atelier").notNull(),
  category: varchar("category", { length: 255 }),
  subcategory: varchar("subcategory", { length: 255 }),
  color: varchar("color", { length: 100 }),
  material: varchar("material", { length: 255 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  source: varchar("source", { length: 20 }).default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const masterProductsRelations = relations(masterProducts, ({ many }) => ({
  masterVariants: many(masterVariants),
  tenantProducts: many(tenantProducts),
}));

// ─── MASTER VARIANTS ───────────────────────────────────────

export const masterVariants = pgTable("master_variants", {
  id: serial("id").primaryKey(),
  masterProductId: integer("master_product_id")
    .notNull()
    .references(() => masterProducts.id),
  externalId: varchar("external_id", { length: 100 }),
  color: varchar("color", { length: 100 }),
  size: varchar("size", { length: 20 }).notNull(),
  // NOT: ikas'ta barkodlar benzersiz değil (placeholder/tekrar eden barkodlar var).
  // Gerçek benzersiz mağaza barkodları tenant_variant_skus'ta üretilir (Epic J).
  barcode: varchar("barcode", { length: 100 }).notNull(),
  sku: varchar("sku", { length: 100 }).notNull(),
  images: json("images").$type<string[]>().default([]).notNull(),
  stockQuantity: integer("stock_quantity").default(0).notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).default("0").notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).default("0").notNull(),
  // ikas "Dolar B2B" fiyat listesinden USD toptan fiyatı — TL fiyatların temeli.
  // TL = usdPrice × app_config.usd_try_rate; üye kendi markup'ını uygular.
  usdPrice: numeric("usd_price", { precision: 10, scale: 2 }).default("0").notNull(),
  weight: integer("weight"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const masterVariantsRelations = relations(masterVariants, ({ one, many }) => ({
  masterProduct: one(masterProducts, {
    fields: [masterVariants.masterProductId],
    references: [masterProducts.id],
  }),
  stockMovements: many(stockMovements),
  tenantVariantSkus: many(tenantVariantSkus),
}));

// ─── TENANT PRODUCTS ───────────────────────────────────────

export const tenantProducts = pgTable(
  "tenant_products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    masterProductId: integer("master_product_id")
      .notNull()
      .references(() => masterProducts.id),
    externalProductId: varchar("external_product_id", { length: 255 }),
    externalVariantIds: json("external_variant_ids"),
    categoryMapping: varchar("category_mapping", { length: 500 }),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    syncedAt: timestamp("synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tenant_products_tenant_product_idx").on(table.tenantId, table.masterProductId)]
);

export const tenantProductsRelations = relations(tenantProducts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantProducts.tenantId],
    references: [tenants.id],
  }),
  masterProduct: one(masterProducts, {
    fields: [tenantProducts.masterProductId],
    references: [masterProducts.id],
  }),
}));

// ─── ORDERS ────────────────────────────────────────────────

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  orderNumber: varchar("order_number", { length: 100 }).notNull(),
  externalOrderId: varchar("external_order_id", { length: 255 }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 100 }),
  shippingAddress: json("shipping_address"),
  items: json("items").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("TRY").notNull(),
  // Tano Toptan fulfillment state machine:
  // bekleniyor → (üye fatura+etiket yükledi) hazirlanacak → (Tano işleme aldı) paketlendi → gonderildi
  // (iptal: cancelled)
  status: varchar("status", { length: 30 }).default("bekleniyor").notNull(),
  // Üye tarafından yüklenen fatura ve kargo etiketi (PDF/görsel). İkisi de doluysa hazirlanacak olur.
  invoiceFileUrl: text("invoice_file_url"),
  cargoLabelFileUrl: text("cargo_label_file_url"),
  invoiceUploadedAt: timestamp("invoice_uploaded_at"),
  // Tek havuz stok idempotency: bu sipariş için master stok bir kez düşüldü mü?
  stockApplied: boolean("stock_applied").default(false).notNull(),
  // Sipariş geldiğinde ürün bakiyesinden düşülen B2B maliyet (TL). İptalde tam iade için.
  balanceCharged: numeric("balance_charged", { precision: 12, scale: 2 }).default("0").notNull(),
  cargoCompany: varchar("cargo_company", { length: 100 }),
  cargoTrackingNumber: varchar("cargo_tracking_number", { length: 255 }),
  cargoTrackingUrl: text("cargo_tracking_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [orders.tenantId],
    references: [tenants.id],
  }),
  orderStatusHistory: many(orderStatusHistory),
}));

// ─── ORDER STATUS HISTORY ──────────────────────────────────

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  fromStatus: varchar("from_status", { length: 30 }).notNull(),
  toStatus: varchar("to_status", { length: 30 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
}));

// ─── STOCK MOVEMENTS ──────────────────────────────────────

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  masterVariantId: integer("master_variant_id")
    .notNull()
    .references(() => masterVariants.id),
  type: varchar("type", { length: 30 }).notNull(),
  quantity: integer("quantity").notNull(),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  reference: varchar("reference", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  masterVariant: one(masterVariants, {
    fields: [stockMovements.masterVariantId],
    references: [masterVariants.id],
  }),
}));

// ─── SYNC LOGS ─────────────────────────────────────────────

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  details: json("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [syncLogs.tenantId],
    references: [tenants.id],
  }),
}));

// ─── TENANT PRODUCT PERMISSIONS ───────────────────────────

export const tenantProductPermissions = pgTable(
  "tenant_product_permissions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    masterProductId: integer("master_product_id")
      .notNull()
      .references(() => masterProducts.id),
    allowed: boolean("allowed").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tenant_product_perm_idx").on(table.tenantId, table.masterProductId)]
);

export const tenantProductPermissionsRelations = relations(tenantProductPermissions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantProductPermissions.tenantId],
    references: [tenants.id],
  }),
  masterProduct: one(masterProducts, {
    fields: [tenantProductPermissions.masterProductId],
    references: [masterProducts.id],
  }),
}));

// ─── RETURNS (İADE) ───────────────────────────────────────

export const returns = pgTable("returns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  orderId: integer("order_id")
    .references(() => orders.id),
  masterVariantId: integer("master_variant_id")
    .notNull()
    .references(() => masterVariants.id),
  masterProductId: integer("master_product_id")
    .notNull()
    .references(() => masterProducts.id),
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, approved, rejected
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const returnsRelations = relations(returns, ({ one }) => ({
  tenant: one(tenants, {
    fields: [returns.tenantId],
    references: [tenants.id],
  }),
  order: one(orders, {
    fields: [returns.orderId],
    references: [orders.id],
  }),
  masterVariant: one(masterVariants, {
    fields: [returns.masterVariantId],
    references: [masterVariants.id],
  }),
  masterProduct: one(masterProducts, {
    fields: [returns.masterProductId],
    references: [masterProducts.id],
  }),
}));

// ─── INVOICES (FATURALAR) ──────────────────────────────────

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("TRY").notNull(),
  status: varchar("status", { length: 20 }).default("unpaid").notNull(), // unpaid, partial, paid
  notes: text("notes"),
  fileUrl: text("file_url"), // PDF base64 or URL
  dueDate: timestamp("due_date"),
  parasutInvoiceId: varchar("parasut_invoice_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  payments: many(payments),
}));

// ─── PAYMENTS (ÖDEMELER) ───────────────────────────────────

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  invoiceId: integer("invoice_id")
    .references(() => invoices.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // payment, refund
  method: varchar("method", { length: 50 }), // bank_transfer, cash, credit_card
  reference: varchar("reference", { length: 255 }), // dekont no, açıklama
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

// ─── NOTIFICATIONS ─────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  type: varchar("type", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body"),
  sentAt: timestamp("sent_at"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
}));

// ─── XML FEEDS (Otomatik Ürün Çekme Kaynakları) ────────────

export const xmlFeeds = pgTable("xml_feeds", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  intervalMinutes: integer("interval_minutes").default(60).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 20 }),
  lastRunSummary: json("last_run_summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── TENANT VARIANT SKUS (Mağaza Bazlı SKU/Barkod Eşleme - Epic J) ──
// Her (tenant, master_variant, kanal) için benzersiz store_sku + store_barcode.
// Amaç: pazaryerlerinde ürünler birbiriyle eşleşmesin (buybox engelleme) +
// sipariş gelince store SKU/barkod → master varyant ters eşleme.

export const tenantVariantSkus = pgTable(
  "tenant_variant_skus",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    masterVariantId: integer("master_variant_id")
      .notNull()
      .references(() => masterVariants.id),
    marketplace: varchar("marketplace", { length: 50 }).notNull(),
    storeSku: varchar("store_sku", { length: 150 }).notNull().unique(),
    storeBarcode: varchar("store_barcode", { length: 150 }).notNull().unique(),
    externalProductId: varchar("external_product_id", { length: 255 }),
    externalVariantId: varchar("external_variant_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenant_variant_skus_unique_idx").on(
      table.tenantId,
      table.masterVariantId,
      table.marketplace
    ),
  ]
);

export const tenantVariantSkusRelations = relations(tenantVariantSkus, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantVariantSkus.tenantId],
    references: [tenants.id],
  }),
  masterVariant: one(masterVariants, {
    fields: [tenantVariantSkus.masterVariantId],
    references: [masterVariants.id],
  }),
}));

// ─── IKAS SYNC STATE (Epic A) ───────────────────────────────
// ikas master stok senkronu için cursor / son çalışma durumu (key-value).

export const ikasSyncState = pgTable("ikas_sync_state", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── APP CONFIG (Global ayarlar - admin) ───────────────────
// Örn: usd_try_rate (USD→TL kuru), ikas_b2b_price_list_id.
export const appConfig = pgTable("app_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── TENANT VARIANT PRICES (Üye fiyatlandırması) ───────────
// Üye varyant/ürün bazında fiyatlandırır: yüzde markup VEYA manuel TL fiyat.
// Override yoksa tenants.default_markup_percent uygulanır.
export const tenantVariantPrices = pgTable(
  "tenant_variant_prices",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    masterVariantId: integer("master_variant_id")
      .notNull()
      .references(() => masterVariants.id),
    mode: varchar("mode", { length: 10 }).notNull(), // 'percent' | 'manual'
    percent: numeric("percent", { precision: 6, scale: 2 }),
    manualPriceTry: numeric("manual_price_try", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenant_variant_prices_unique_idx").on(table.tenantId, table.masterVariantId),
  ]
);

export const tenantVariantPricesRelations = relations(tenantVariantPrices, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantVariantPrices.tenantId],
    references: [tenants.id],
  }),
  masterVariant: one(masterVariants, {
    fields: [tenantVariantPrices.masterVariantId],
    references: [masterVariants.id],
  }),
}));

// ─── BALANCES (Bakiye/Cüzdan - Epic E) ─────────────────────
// İki tip bakiye: 'product' (ürün/sipariş) ve 'image' (AI görsel). Tenant başına tek satır/tip.
export const balances = pgTable(
  "balances",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: varchar("type", { length: 10 }).notNull(), // 'product' | 'image'
    amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("balances_tenant_type_idx").on(table.tenantId, table.type)]
);

export const balancesRelations = relations(balances, ({ one }) => ({
  tenant: one(tenants, { fields: [balances.tenantId], references: [tenants.id] }),
}));

// Bakiye hareket defteri (ledger). amount işaretli (+ yükleme, - düşüm).
export const balanceTransactions = pgTable("balance_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  type: varchar("type", { length: 10 }).notNull(), // 'product' | 'image'
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // işaretli
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 30 }).notNull(), // admin_add, order, image_gen, paytr_load, transfer, refund
  reference: varchar("reference", { length: 255 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
  tenant: one(tenants, { fields: [balanceTransactions.tenantId], references: [tenants.id] }),
}));

// ─── BALANCE TOPUPS (PayTR bakiye yükleme - Epic F) ────────
export const balanceTopups = pgTable("balance_topups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  merchantOid: varchar("merchant_oid", { length: 64 }).notNull().unique(),
  balanceType: varchar("balance_type", { length: 10 }).notNull(), // product | image
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | success | failed
  failReason: text("fail_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const balanceTopupsRelations = relations(balanceTopups, ({ one }) => ({
  tenant: one(tenants, { fields: [balanceTopups.tenantId], references: [tenants.id] }),
}));

// ─── AI GÖRSEL ÜRETİMİ (Epic G) ────────────────────────────
export const aiImageJobs = pgTable("ai_image_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  masterProductId: integer("master_product_id").references(() => masterProducts.id),
  params: json("params"), // { sceneId, modelOptions, angle, sourceImages, ... }
  count: integer("count").default(1).notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }).default("0").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending|processing|done|failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const aiImageJobsRelations = relations(aiImageJobs, ({ one, many }) => ({
  tenant: one(tenants, { fields: [aiImageJobs.tenantId], references: [tenants.id] }),
  masterProduct: one(masterProducts, {
    fields: [aiImageJobs.masterProductId],
    references: [masterProducts.id],
  }),
  images: many(generatedImages),
}));

export const generatedImages = pgTable("generated_images", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => aiImageJobs.id),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id),
  masterProductId: integer("master_product_id").references(() => masterProducts.id),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const generatedImagesRelations = relations(generatedImages, ({ one }) => ({
  job: one(aiImageJobs, { fields: [generatedImages.jobId], references: [aiImageJobs.id] }),
  tenant: one(tenants, { fields: [generatedImages.tenantId], references: [tenants.id] }),
}));
