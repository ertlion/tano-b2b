// Run with: npx tsx scripts/seed.ts
import { db } from "../src/lib/db";
import { tenants } from "../src/lib/schema";
import bcrypt from "bcryptjs";

async function seed() {
  const password = await bcrypt.hash("admin123", 12);

  await db
    .insert(tenants)
    .values({
      name: "Admin",
      email: "admin@tanoatelier.com",
      password,
      company: "Tano Atelier",
      phone: "",
      marketplace: "shopify",
      isAdmin: true,
      isApproved: true,
      isActive: true,
    })
    .onConflictDoNothing();

  console.log("Seed completed!");
  console.log("Admin: admin@tanoatelier.com / admin123");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
