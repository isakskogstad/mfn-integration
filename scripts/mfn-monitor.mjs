#!/usr/bin/env node
/**
 * MFN.se Monitor — Real-time press release monitoring for Nordic listed companies
 *
 * API surface (reverse-engineered from mfn.se frontend):
 *   - JSON Feed:    GET /all/s/nordic.json?limit=N&offset=N&query=...&filter=...&compact=true
 *   - Search:       GET /search/companies?limit=N&query=...
 *   - WebSocket:    wss://mfn.se/all/s/nordic (real-time push)
 *   - Hub/PubSub:   POST https://hub.mfn.se (WebSub protocol)
 *
 * Usage:
 *   node scripts/mfn-monitor.mjs                          # Poll latest 20
 *   node scripts/mfn-monitor.mjs --watch                  # Real-time WebSocket monitor
 *   node scripts/mfn-monitor.mjs --query "nyemission"     # Search for keyword
 *   node scripts/mfn-monitor.mjs --company "volvo"        # Search company + its news
 *   node scripts/mfn-monitor.mjs --segments 13,14,15      # Filter by market segments
 *   node scripts/mfn-monitor.mjs --limit 50               # Fetch more items
 *   node scripts/mfn-monitor.mjs --json                   # Raw JSON output
 *   node scripts/mfn-monitor.mjs --save                   # Save to Supabase Nyhetskort
 */

import WebSocket from "ws";

const BASE_URL = "https://mfn.se";
const FEED_PATH = "/all/s/nordic.json";
const SEARCH_PATH = "/search/companies";

// ---------------------------------------------------------------------------
// Market segment IDs (from mfn.se filter checkboxes)
// ---------------------------------------------------------------------------
const SEGMENTS = {
  1: "Nasdaq Stockholm Large Cap",
  5: "Nasdaq Stockholm Mid Cap",
  9: "Nasdaq Stockholm Small Cap",
  13: "Nasdaq Copenhagen",
  14: "Nasdaq Helsinki",
  15: "Nasdaq Iceland",
  44: "Oslo Børs",
  45: "Spotlight Stock Market",
  // Additional segments observed:
  // 2: 'Nasdaq Stockholm First North Growth Market',
  // 6: 'Nordic SME',
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    watch: false,
    query: null,
    company: null,
    segments: null,
    limit: 20,
    offset: 0,
    json: false,
    save: false,
    compact: true,
    lang: null, // 'sv' or 'en'
    tags: null, // e.g. ':regulatory'
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--watch":
      case "-w":
        opts.watch = true;
        break;
      case "--query":
      case "-q":
        opts.query = args[++i];
        break;
      case "--company":
      case "-c":
        opts.company = args[++i];
        break;
      case "--segments":
      case "-s":
        opts.segments = args[++i].split(",").map(Number);
        break;
      case "--limit":
      case "-l":
        opts.limit = parseInt(args[++i], 10);
        break;
      case "--offset":
        opts.offset = parseInt(args[++i], 10);
        break;
      case "--json":
        opts.json = true;
        break;
      case "--save":
        opts.save = true;
        break;
      case "--lang":
        opts.lang = args[++i];
        break;
      case "--tags":
        opts.tags = args[++i];
        break;
      case "--verbose":
      case "-v":
        opts.verbose = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        // Treat bare arg as query
        if (!args[i].startsWith("-")) {
          opts.query = args[i];
        }
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
MFN.se Monitor — Nordic press release monitoring

Usage:
  node scripts/mfn-monitor.mjs [options] [query]

Options:
  --watch, -w           Real-time WebSocket monitoring
  --query, -q <text>    Search for keyword in press releases
  --company, -c <name>  Search for company and show its news
  --segments, -s <ids>  Filter by market segment IDs (comma-separated)
  --limit, -l <n>       Number of items to fetch (default: 20)
  --offset <n>          Pagination offset
  --lang <sv|en>        Filter by language
  --tags <tag>          Filter by tag (e.g. ":regulatory")
  --json                Output raw JSON
  --save                Save results to Supabase
  --verbose, -v         Verbose output
  --help, -h            Show this help

Market Segments:
  1   Nasdaq Stockholm Large Cap
  5   Nasdaq Stockholm Mid Cap
  9   Nasdaq Stockholm Small Cap
  13  Nasdaq Copenhagen
  14  Nasdaq Helsinki
  15  Nasdaq Iceland
  44  Oslo Børs
  45  Spotlight Stock Market

Examples:
  node scripts/mfn-monitor.mjs --watch
  node scripts/mfn-monitor.mjs --query "nyemission" --lang sv
  node scripts/mfn-monitor.mjs --company "volvo"
  node scripts/mfn-monitor.mjs --segments 1,5,9 --limit 50
`);
}

// ---------------------------------------------------------------------------
// MFN filter string builder
// ---------------------------------------------------------------------------
function buildFilter(opts) {
  const parts = [];

  if (opts.segments && opts.segments.length > 0) {
    const segmentParts = opts.segments
      .map((id) => `(a.market_segment_ids@>[${id}])`)
      .join("");
    parts.push(`(or${segmentParts})`);
  }

  if (opts.lang) {
    parts.push(`(or(.properties.lang="${opts.lang}"))`);
  }

  if (opts.tags) {
    parts.push(`(or(.properties.tags@>["${opts.tags}"]))`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return `(and${parts[0]})`;
  return `(and${parts.join("")})`;
}

// ---------------------------------------------------------------------------
// API: Fetch news feed (JSON)
// ---------------------------------------------------------------------------
async function fetchNews(opts) {
  const params = new URLSearchParams();
  params.set("limit", opts.limit.toString());

  if (opts.offset > 0) params.set("offset", opts.offset.toString());
  if (opts.compact) params.set("compact", "true");
  if (opts.query) params.set("query", opts.query);

  const filter = buildFilter(opts);
  if (filter) params.set("filter", filter);

  const url = `${BASE_URL}${FEED_PATH}?${params}`;
  if (opts.verbose) console.error(`[fetch] ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// API: Search companies
// ---------------------------------------------------------------------------
async function searchCompanies(query, limit = 10) {
  const params = new URLSearchParams({ query, limit: limit.toString() });
  const url = `${BASE_URL}${SEARCH_PATH}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// API: Fetch news for a specific company (by slug)
// ---------------------------------------------------------------------------
async function fetchCompanyNews(slug, limit = 20) {
  const url = `${BASE_URL}/all/a/${slug}.json?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// WebSocket: Real-time monitoring
// ---------------------------------------------------------------------------
function watchNews(opts, onItem) {
  const filter = buildFilter(opts);
  let path = "/all/s/nordic";
  if (filter) path += `?filter=${encodeURIComponent(filter)}`;

  const wsUrl = `wss://mfn.se${path}`;
  console.error(`[ws] Connecting to ${wsUrl}`);

  let reconnectDelay = 1000;

  function connect() {
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      console.error("[ws] Connected — waiting for press releases...");
      reconnectDelay = 1000;
    });

    ws.on("message", (data) => {
      const html = data.toString();
      // The WS sends HTML fragments. We extract what we can.
      onItem(html);
    });

    ws.on("close", (code) => {
      if (code === 3000) {
        console.error("[ws] Fast reconnect");
        connect();
        return;
      }
      console.error(
        `[ws] Disconnected (${code}), reconnecting in ${reconnectDelay}ms...`
      );
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error: ${err.message}`);
    });
  }

  connect();
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function formatItem(item) {
  const date = item.content?.publish_date
    ? new Date(item.content.publish_date).toLocaleString("sv-SE")
    : "?";
  const company = item.author?.name || "?";
  const title = item.content?.title || "?";
  const lang = item.properties?.lang || "?";
  const tags = (item.properties?.tags || []).join(", ");
  const url = item.url || "";
  const tickers = (item.author?.tickers || []).join(", ");
  const orgRef = (item.author?.local_refs || []).join(", ");

  return [
    `┌─ ${company}`,
    tickers ? `│  Tickers: ${tickers}` : null,
    orgRef ? `│  OrgNr:   ${orgRef}` : null,
    `│  ${date} [${lang}] ${tags ? `(${tags})` : ""}`,
    `│  ${title}`,
    item.content?.preamble
      ? `│  ${item.content.preamble.substring(0, 200).replace(/\n/g, " ")}...`
      : null,
    `│  ${url}`,
    `└───`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCompany(c) {
  const tickers = (c.tickers || []).join(", ");
  const isins = (c.isins || []).join(", ");
  const refs = (c.local_refs || []).join(", ");
  return [
    `  ${c.name} (${c.slug})`,
    tickers ? `    Tickers: ${tickers}` : null,
    isins ? `    ISIN:    ${isins}` : null,
    refs ? `    OrgNr:   ${refs}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Supabase save (optional)
// ---------------------------------------------------------------------------
async function saveToSupabase(items) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[save] Missing SUPABASE env vars, skipping save");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const rows = items.map((item) => ({
    external_id: `mfn:${item.news_id}`,
    source: "mfn",
    title: item.content?.title,
    published_at: item.content?.publish_date,
    url: item.url,
    company_name: item.author?.name,
    org_number: extractOrgNumber(item.author?.local_refs),
    tickers: item.author?.tickers || [],
    language: item.properties?.lang,
    tags: item.properties?.tags || [],
    preamble: item.content?.preamble || null,
    raw_json: item,
  }));

  const { data, error } = await supabase
    .from("MfnNews")
    .upsert(rows, { onConflict: "external_id" });

  if (error) {
    console.error("[save] Supabase error:", error.message);
  } else {
    console.error(`[save] Saved ${rows.length} items to MfnNews`);
  }
}

function extractOrgNumber(localRefs) {
  if (!localRefs || localRefs.length === 0) return null;
  // Format: "SE:556012-5790" → "556012-5790"
  const se = localRefs.find((r) => r.startsWith("SE:"));
  return se ? se.replace("SE:", "") : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs();

  // --- Company search mode ---
  if (opts.company) {
    console.error(`\n🔍 Searching companies: "${opts.company}"`);
    const companies = await searchCompanies(opts.company);

    if (opts.json) {
      console.log(JSON.stringify(companies, null, 2));
      return;
    }

    if (companies.length === 0) {
      console.log("No companies found.");
      return;
    }

    console.log(`\nFound ${companies.length} companies:\n`);
    companies.forEach((c) => console.log(formatCompany(c)));

    // Fetch news for the first match
    const slug = companies[0].slug;
    console.log(`\n📰 Latest news for ${companies[0].name}:\n`);
    const feed = await fetchCompanyNews(slug, opts.limit);

    if (feed.items) {
      feed.items.forEach((item) => console.log(formatItem(item) + "\n"));
    }

    if (opts.save && feed.items) {
      await saveToSupabase(feed.items);
    }
    return;
  }

  // --- Watch mode (WebSocket) ---
  if (opts.watch) {
    console.error("\n📡 MFN Real-time Monitor");
    console.error("Listening for new press releases...\n");

    watchNews(opts, (html) => {
      const timestamp = new Date().toLocaleString("sv-SE");
      console.log(`\n[${timestamp}] New press release received`);
      // WebSocket sends HTML fragments — log raw length
      console.log(`  (${html.length} chars of HTML)`);
      // Extract title from HTML if possible
      const titleMatch = html.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</);
      if (titleMatch) {
        console.log(`  Title: ${titleMatch[1].trim()}`);
      }
      const companyMatch = html.match(
        /class="[^"]*company-name[^"]*"[^>]*>([^<]+)</
      );
      if (companyMatch) {
        console.log(`  Company: ${companyMatch[1].trim()}`);
      }
    });
    return;
  }

  // --- Default: fetch feed ---
  console.error(
    `\n📰 MFN News Feed${opts.query ? ` (query: "${opts.query}")` : ""}${
      opts.segments ? ` (segments: ${opts.segments.join(", ")})` : ""
    }`
  );

  const feed = await fetchNews(opts);

  if (opts.json) {
    console.log(JSON.stringify(feed, null, 2));
    return;
  }

  if (!feed.items || feed.items.length === 0) {
    console.log("No items found.");
    return;
  }

  console.log(`\nShowing ${feed.items.length} items:\n`);
  feed.items.forEach((item) => console.log(formatItem(item) + "\n"));

  if (feed.next_url) {
    console.error(`[info] Next page: ${feed.next_url}`);
  }

  if (opts.save) {
    await saveToSupabase(feed.items);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
