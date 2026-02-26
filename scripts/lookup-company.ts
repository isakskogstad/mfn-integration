/**
 * lookup-company.ts
 *
 * Looks up a company by name, ticker, ISIN, or Swedish org number.
 * Uses the local entity cache for org number lookups (since the MFN API
 * does not support org number search), and direct API search for everything else.
 *
 * Usage:
 *   npx tsx scripts/lookup-company.ts <query>
 *
 * Examples:
 *   npx tsx scripts/lookup-company.ts "556536-7488"       # Org number lookup (via cache)
 *   npx tsx scripts/lookup-company.ts "Duni"              # Name search (via API)
 *   npx tsx scripts/lookup-company.ts "VOLV-B"            # Ticker search (via API)
 *   npx tsx scripts/lookup-company.ts "SE0000616716"      # ISIN search (via API)
 *
 * Requires: Run fetch-entity-cache.ts first for org number lookups.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
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
  byOrgNumber: Record<string, string>;
  bySlug: Record<string, string>;
  entities: Record<string, MfnCompany>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/mfn-entity-cache.json"
);

/** Check if input looks like a Swedish org number (XXXXXX-XXXX or XXXXXXXXXX) */
function isOrgNumber(input: string): boolean {
  return /^\d{6}-?\d{4}$/.test(input);
}

/** Normalize org number to XXXXXX-XXXX format */
function normalizeOrgNumber(input: string): string {
  const digits = input.replace("-", "");
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/** Load the entity cache from disk */
function loadCache(): CacheFile | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Look up a company by org number in the cache */
function lookupByOrgNumber(
  cache: CacheFile,
  orgNumber: string
): MfnCompany | null {
  const normalized = normalizeOrgNumber(orgNumber);
  const entityId = cache.byOrgNumber[normalized];
  if (!entityId) return null;
  return cache.entities[entityId] ?? null;
}

/** Search for companies via the MFN API */
async function searchApi(query: string): Promise<MfnCompany[]> {
  const params = new URLSearchParams({ query, limit: "5" });
  const res = await fetch(`https://mfn.se/search/companies?${params}`);
  if (!res.ok) {
    throw new Error(`MFN search API returned HTTP ${res.status}`);
  }
  return res.json();
}

/** Display a company's details */
function displayCompany(company: MfnCompany, matchMethod: string) {
  const orgNumbers = (company.local_refs ?? [])
    .filter((r) => r.startsWith("SE:"))
    .map((r) => r.slice(3));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Name:          ${company.name}`);
  console.log(`  Entity ID:     ${company.entity_id}`);
  console.log(`  Slug:          ${company.slug}`);
  if (company.slugs?.length > 1) {
    console.log(`  Alt slugs:     ${company.slugs.join(", ")}`);
  }
  console.log(
    `  Tickers:       ${(company.tickers ?? []).join(", ") || "(none)"}`
  );
  console.log(
    `  ISINs:         ${(company.isins ?? []).join(", ") || "(none)"}`
  );
  console.log(`  Org numbers:   ${orgNumbers.join(", ") || "(none)"}`);
  console.log(
    `  LEIs:          ${(company.leis ?? []).join(", ") || "(none)"}`
  );
  if (company.brand_image_url) {
    console.log(`  Brand image:   ${company.brand_image_url}`);
  }
  if (company.mil_insref) {
    console.log(`  Millistream:   ${company.mil_insref}`);
  }
  if (company.sector_id != null) {
    console.log(`  GICS sector:   ${company.sector_id}`);
  }
  if (company.industry_id != null) {
    console.log(`  GICS industry: ${company.industry_id}`);
  }
  console.log(`  Match method:  ${matchMethod}`);
  console.log(`  MFN page:      https://mfn.se/a/${company.slug}`);
  console.log(`${"=".repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const query = process.argv[2];

  if (!query) {
    console.log("Usage: npx tsx scripts/lookup-company.ts <query>");
    console.log("");
    console.log("The query can be:");
    console.log("  - A Swedish org number: 556536-7488 (uses local cache)");
    console.log("  - A company name:       Duni (uses MFN API)");
    console.log("  - A ticker symbol:      VOLV-B (uses MFN API)");
    console.log("  - An ISIN code:         SE0000616716 (uses MFN API)");
    console.log("");
    console.log(
      "Note: Run fetch-entity-cache.ts first for org number lookups."
    );
    process.exit(1);
  }

  // Route to org number lookup or API search
  if (isOrgNumber(query)) {
    const normalized = normalizeOrgNumber(query);
    console.log(`Looking up org number: ${normalized} (via cache)`);

    const cache = loadCache();
    if (!cache) {
      console.error(`\nCache file not found at: ${CACHE_PATH}`);
      console.error("Run fetch-entity-cache.ts first to build the cache.");
      process.exit(1);
    }

    console.log(
      `Cache loaded: ${cache.totalEntities} entities (built ${cache.builtAt})`
    );

    const company = lookupByOrgNumber(cache, query);
    if (!company) {
      console.log(`\nNo company found with org number ${normalized}.`);
      process.exit(0);
    }

    displayCompany(company, `org number cache (${normalized})`);
  } else {
    console.log(`Searching MFN API for: "${query}"`);

    const results = await searchApi(query);

    if (results.length === 0) {
      console.log(`\nNo results found for "${query}".`);
      process.exit(0);
    }

    console.log(`Found ${results.length} result(s):`);

    for (const company of results) {
      displayCompany(company, "API search");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
