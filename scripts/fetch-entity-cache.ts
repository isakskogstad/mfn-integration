/**
 * fetch-entity-cache.ts
 *
 * Fetches all MFN entities (~2000 companies) and saves them as a JSON cache file.
 * Builds lookup maps by orgNumber, entityId, and slug for fast offline access.
 *
 * Usage:
 *   npx tsx scripts/fetch-entity-cache.ts
 *
 * Output:
 *   ../data/mfn-entity-cache.json
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types (mirrors MfnCompany from lib/mfn-api.ts)
// ---------------------------------------------------------------------------

interface MfnCompany {
  entity_id: string;
  slug: string;
  slugs: string[];
  name: string;
  isins: string[];
  leis: string[];
  local_refs: string[];
  tickers: string[];
  brand_image_url?: string;
  mil_insref?: string;
  sector_id?: number;
  industry_id?: number;
}

interface CacheFile {
  builtAt: string;
  totalEntities: number;
  stats: {
    withSwedishOrgNumber: number;
    withTickers: number;
    withIsins: number;
    withBrandImage: number;
  };
  /** Map: orgNumber (e.g. "556012-5790") -> entity_id */
  byOrgNumber: Record<string, string>;
  /** Map: slug -> entity_id */
  bySlug: Record<string, string>;
  /** All entities keyed by entity_id */
  entities: Record<string, MfnCompany>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching all MFN entities...");

  const url = "https://mfn.se/search/companies?limit=2000&query=";
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  const entities: MfnCompany[] = await res.json();
  console.log(`Received ${entities.length} entities from MFN.`);

  // Build lookup maps
  const byOrgNumber: Record<string, string> = {};
  const bySlug: Record<string, string> = {};
  const entitiesMap: Record<string, MfnCompany> = {};

  let withSwedishOrgNumber = 0;
  let withTickers = 0;
  let withIsins = 0;
  let withBrandImage = 0;

  for (const entity of entities) {
    entitiesMap[entity.entity_id] = entity;
    bySlug[entity.slug] = entity.entity_id;

    // Map all Swedish org numbers to this entity
    for (const ref of entity.local_refs ?? []) {
      if (ref.startsWith("SE:")) {
        const orgNumber = ref.slice(3); // Remove "SE:" prefix
        byOrgNumber[orgNumber] = entity.entity_id;
      }
    }

    // Statistics
    if ((entity.local_refs ?? []).some((r) => r.startsWith("SE:"))) {
      withSwedishOrgNumber++;
    }
    if ((entity.tickers ?? []).length > 0) withTickers++;
    if ((entity.isins ?? []).length > 0) withIsins++;
    if (entity.brand_image_url) withBrandImage++;
  }

  const cache: CacheFile = {
    builtAt: new Date().toISOString(),
    totalEntities: entities.length,
    stats: {
      withSwedishOrgNumber,
      withTickers,
      withIsins,
      withBrandImage,
    },
    byOrgNumber,
    bySlug,
    entities: entitiesMap,
  };

  // Write to file
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(scriptDir, "../data/mfn-entity-cache.json");
  writeFileSync(outPath, JSON.stringify(cache, null, 2), "utf-8");

  // Print statistics
  console.log("\n--- MFN Entity Cache Statistics ---");
  console.log(`Total entities:            ${entities.length}`);
  console.log(`With Swedish org number:   ${withSwedishOrgNumber}`);
  console.log(`With tickers:              ${withTickers}`);
  console.log(`With ISINs:                ${withIsins}`);
  console.log(`With brand image:          ${withBrandImage}`);
  console.log(`Unique org number entries:  ${Object.keys(byOrgNumber).length}`);
  console.log(`Unique slug entries:        ${Object.keys(bySlug).length}`);
  console.log(`\nSaved to: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
