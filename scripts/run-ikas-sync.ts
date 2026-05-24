// Run with: node_modules/.bin/tsx --env-file=.env scripts/run-ikas-sync.ts
import { syncMasterCatalogFromIkas } from "../src/lib/ikas-master-sync";

(async () => {
  console.log("ikas master sync başlıyor...");
  const s = await syncMasterCatalogFromIkas();
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
})();
