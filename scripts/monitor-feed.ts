/**
 * monitor-feed.ts
 *
 * Polls the MFN Nordic press release feed every 30 seconds and displays new items.
 * Tracks the last seen timestamp to only show new press releases.
 *
 * Usage:
 *   npx tsx scripts/monitor-feed.ts                   # Monitor all press releases
 *   npx tsx scripts/monitor-feed.ts "nyemission"      # Filter by keyword in title
 *   npx tsx scripts/monitor-feed.ts --lang=sv          # Only Swedish press releases
 *
 * Press Ctrl+C to stop.
 */

// ---------------------------------------------------------------------------
// Types (subset of MfnFeedItem from lib/mfn-api.ts)
// ---------------------------------------------------------------------------

interface MfnFeedItem {
  news_id: string;
  title: string;
  timestamp: string;
  author: {
    entity_id: string;
    slug: string;
    name: string;
    brand_image_url?: string;
  };
  properties: {
    lang: string;
    tags: string[];
    type: string;
    scope: string;
  };
  content?: {
    preamble?: string;
  };
}

interface MfnFeedResponse {
  items: MfnFeedItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000;
const FEED_URL = "https://mfn.se/all/s/nordic.json?compact=true&limit=10";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTags(tags: string[]): string {
  if (!tags || tags.length === 0) return "-";
  return tags
    .map((t) => {
      // Make common tags more readable
      if (t === ":regulatory") return "REG";
      if (t === "sub:report") return "REPORT";
      if (t === "sub:ca") return "CA";
      if (t.startsWith("sub:")) return t.slice(4).toUpperCase();
      return t;
    })
    .join(", ");
}

function printItem(item: MfnFeedItem) {
  const time = formatTimestamp(item.timestamp);
  const lang = item.properties.lang?.toUpperCase() ?? "??";
  const type = item.properties.type?.toUpperCase() ?? "??";
  const tags = formatTags(item.properties.tags);
  const company = item.author.name;
  const title = item.title;

  console.log(`\n  ${time}  [${lang}] [${type}]`);
  console.log(`  ${company}`);
  console.log(`  ${title}`);
  console.log(`  Tags: ${tags}`);
  console.log(`  https://mfn.se/a/${item.author.slug}`);
}

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------

function parseArgs(): { filter?: string; lang?: string } {
  const args = process.argv.slice(2);
  let filter: string | undefined;
  let lang: string | undefined;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npx tsx scripts/monitor-feed.ts [filter] [--lang=sv|en]"
      );
      console.log("");
      console.log("Arguments:");
      console.log(
        "  filter       Optional keyword to filter titles (case-insensitive)"
      );
      console.log(
        "  --lang=XX    Only show items in the given language (sv, en, no, fi, da)"
      );
      console.log("");
      console.log("Examples:");
      console.log('  npx tsx scripts/monitor-feed.ts "nyemission"');
      console.log("  npx tsx scripts/monitor-feed.ts --lang=sv");
      console.log('  npx tsx scripts/monitor-feed.ts "rapport" --lang=sv');
      process.exit(0);
    } else if (arg.startsWith("--lang=")) {
      lang = arg.slice(7);
    } else {
      filter = arg;
    }
  }

  return { filter, lang };
}

// ---------------------------------------------------------------------------
// Main polling loop
// ---------------------------------------------------------------------------

async function main() {
  const { filter, lang } = parseArgs();

  console.log("=== MFN Feed Monitor ===");
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
  if (filter) console.log(`Filter: "${filter}"`);
  if (lang) console.log(`Language: ${lang}`);
  console.log("Press Ctrl+C to stop.\n");

  let lastSeenTimestamp: string | null = null;
  let seenIds = new Set<string>();
  let isFirstPoll = true;

  const poll = async () => {
    try {
      const res = await fetch(FEED_URL);
      if (!res.ok) {
        console.error(
          `[${new Date().toLocaleTimeString("sv-SE")}] HTTP ${res.status}`
        );
        return;
      }

      const data: MfnFeedResponse = await res.json();
      const items = data.items ?? [];

      // Sort oldest first so we print in chronological order
      const sorted = [...items].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let newCount = 0;

      for (const item of sorted) {
        // Skip already seen items
        if (seenIds.has(item.news_id)) continue;
        seenIds.add(item.news_id);

        // On first poll, just register existing items without printing
        if (isFirstPoll) continue;

        // Apply language filter
        if (lang && item.properties.lang !== lang) continue;

        // Apply title keyword filter
        if (filter && !item.title.toLowerCase().includes(filter.toLowerCase()))
          continue;

        printItem(item);
        newCount++;
      }

      if (isFirstPoll) {
        console.log(
          `[${new Date().toLocaleTimeString("sv-SE")}] Initialized with ${
            items.length
          } existing items. Watching for new...`
        );
        isFirstPoll = false;
      } else if (newCount > 0) {
        console.log(
          `\n[${new Date().toLocaleTimeString(
            "sv-SE"
          )}] ${newCount} new item(s)`
        );
      }

      // Update last seen timestamp
      if (sorted.length > 0) {
        lastSeenTimestamp = sorted[sorted.length - 1].timestamp;
      }

      // Keep seenIds from growing unboundedly
      if (seenIds.size > 1000) {
        const recentIds = new Set(items.map((i) => i.news_id));
        seenIds = recentIds;
      }
    } catch (err) {
      console.error(
        `[${new Date().toLocaleTimeString("sv-SE")}] Poll error:`,
        err instanceof Error ? err.message : err
      );
    }
  };

  // Initial poll
  await poll();

  // Subsequent polls
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
