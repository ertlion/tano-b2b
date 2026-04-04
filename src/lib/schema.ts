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
  color: varchar("color", { length: 100 }),
  size: varchar("size", { length: 20 }).notNull(),
  barcode: varchar("barcode", { length: 100 }).notNull().unique(),
  sku: varchar("sku", { length: 100 }).notNull(),
  stockQuantity: integer("stock_quantity").default(0).notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 2 }).default("0").notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }).default("0").notNull(),
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
  status: varchar("status", { length: 30 }).default("new").notNull(),
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
