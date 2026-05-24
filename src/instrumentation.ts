// Next.js instrumentation — sunucu açılışında bir kez çalışır.
// Node modüllerini (postgres) sadece nodejs runtime'da yükle (Edge bundling'i önle).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./instrumentation-node");
    await runMigrations();
  }
}
