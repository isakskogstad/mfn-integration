#!/usr/bin/env node
/**
 * Match WatchedCompany table against MFN.se company database.
 * Checks which of our watched companies are listed on MFN (i.e. publicly traded).
 *
 * Strategy: Fetch the full MFN nordic feed's company list by searching common terms,
 * then cross-reference with our WatchedCompany org numbers via local_refs.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BASE = "https://mfn.se";
const RATE_DELAY = 300; // ms between requests

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAllWatchedCompanies() {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("WatchedCompany")
      .select('"orgNumber", name')
      .range(offset, offset + limit - 1)
      .order("name");
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

// Search MFN by company name and check if any result's local_refs matches our org number
async function searchMfnForCompany(name, orgNumber) {
  // Clean name for search - take first 2-3 meaningful words
  const cleanName = name
    .replace(/\b(AB|Aktiebolag|Sweden|Holding|Group|International)\b/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .trim();

  if (cleanName.length < 2) return null;

  const url = `${BASE}/search/companies?limit=5&query=${encodeURIComponent(
    cleanName
  )}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const results = await res.json();
  if (!results || results.length === 0) return null;

  // Check for org number match in local_refs
  const orgClean = orgNumber.replace("-", "");
  const orgDash = orgNumber.includes("-")
    ? orgNumber
    : orgNumber.slice(0, 6) + "-" + orgNumber.slice(6);

  for (const company of results) {
    const refs = company.local_refs || [];
    for (const ref of refs) {
      const refOrg = ref.replace("SE:", "");
      if (
        refOrg === orgDash ||
        refOrg === orgClean ||
        refOrg.replace("-", "") === orgClean
      ) {
        return company;
      }
    }
  }

  // Also try name-based match if org didn't match
  const nameLower = name.toLowerCase();
  for (const company of results) {
    if (company.name.toLowerCase() === nameLower) {
      return company;
    }
  }

  return null;
}

async function main() {
  console.error("Fetching watched companies from Supabase...");
  const watched = await getAllWatchedCompanies();
  console.error(`Found ${watched.length} watched companies\n`);

  const matches = [];
  const noMatch = [];
  let checked = 0;

  for (const w of watched) {
    checked++;
    if (checked % 50 === 0) {
      console.error(`  Progress: ${checked}/${watched.length}...`);
    }

    try {
      const match = await searchMfnForCompany(w.name, w.orgNumber);
      if (match) {
        matches.push({
          our_name: w.name,
          our_org: w.orgNumber,
          mfn_name: match.name,
          mfn_slug: match.slug,
          mfn_entity_id: match.entity_id,
          tickers: (match.tickers || []).join(", "),
          isins: (match.isins || []).join(", "),
          mfn_org: (match.local_refs || []).join(", "),
        });
        console.error(
          `  ✓ ${w.name} → ${match.name} (${(match.tickers || []).join(", ")})`
        );
      }
    } catch (err) {
      // skip errors silently
    }

    await sleep(RATE_DELAY);
  }

  console.error(`\n===== RESULTS =====`);
  console.error(`Checked: ${checked}`);
  console.error(`MFN matches: ${matches.length}`);
  console.error(`No match: ${checked - matches.length}\n`);

  // Output matches as JSON
  console.log(JSON.stringify(matches, null, 2));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
