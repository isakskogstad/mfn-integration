/**
 * download-attachments.ts
 *
 * Downloads all PDF attachments from a company's recent press releases on MFN.
 * Files are named: {date}_{title-slug}.pdf
 *
 * Usage:
 *   npx tsx scripts/download-attachments.ts <company-slug> [output-dir] [--limit=N]
 *
 * Examples:
 *   npx tsx scripts/download-attachments.ts climeon ./downloads
 *   npx tsx scripts/download-attachments.ts egetis-therapeutics ./reports --limit=5
 *   npx tsx scripts/download-attachments.ts duni                         # defaults to ./attachments/{slug}
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MfnAttachment {
  url: string;
  title: string;
  tags: string[];
}

interface MfnFeedItem {
  news_id: string;
  title: string;
  timestamp: string;
  slug: string;
  author: {
    entity_id: string;
    slug: string;
    name: string;
  };
  content: {
    html: string;
    text: string;
    preamble: string;
    attachments: MfnAttachment[];
  };
}

interface MfnFeedResponse {
  items: MfnFeedItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a string to a URL-friendly slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Extract date part from ISO timestamp: "2026-02-25T08:00:00Z" -> "2026-02-25" */
function extractDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Check if a URL points to a PDF file */
function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes(".pdf");
}

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------

function parseArgs(): { slug: string; outDir: string; limit: number } {
  const args = process.argv.slice(2);
  let slug: string | undefined;
  let outDir: string | undefined;
  let limit = 10;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npx tsx scripts/download-attachments.ts <company-slug> [output-dir] [--limit=N]"
      );
      console.log("");
      console.log("Arguments:");
      console.log("  company-slug   MFN company slug (e.g. climeon, duni)");
      console.log(
        "  output-dir     Directory to save PDFs (default: ./attachments/{slug})"
      );
      console.log(
        "  --limit=N      Number of recent press releases to check (default: 10)"
      );
      console.log("");
      console.log("Examples:");
      console.log(
        "  npx tsx scripts/download-attachments.ts climeon ./downloads"
      );
      console.log(
        "  npx tsx scripts/download-attachments.ts egetis-therapeutics ./reports --limit=5"
      );
      process.exit(0);
    } else if (arg.startsWith("--limit=")) {
      limit = parseInt(arg.slice(8), 10);
      if (isNaN(limit) || limit < 1) {
        console.error("Invalid --limit value. Must be a positive integer.");
        process.exit(1);
      }
    } else if (!slug) {
      slug = arg;
    } else if (!outDir) {
      outDir = arg;
    }
  }

  if (!slug) {
    console.log(
      "Usage: npx tsx scripts/download-attachments.ts <company-slug> [output-dir] [--limit=N]"
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  npx tsx scripts/download-attachments.ts climeon ./downloads"
    );
    console.log(
      "  npx tsx scripts/download-attachments.ts egetis-therapeutics ./reports --limit=5"
    );
    process.exit(1);
  }

  if (!outDir) {
    outDir = `./attachments/${slug}`;
  }

  return { slug, outDir: resolve(outDir), limit };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { slug, outDir, limit } = parseArgs();

  console.log(`Fetching ${limit} recent press releases for "${slug}"...`);

  // Fetch press releases (non-compact to get attachments)
  const url = `https://mfn.se/all/a/${slug}.json?limit=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.statusText}`);
    if (res.status === 404) {
      console.error(
        `Company slug "${slug}" not found. Check the slug and try again.`
      );
    }
    process.exit(1);
  }

  const data: MfnFeedResponse = await res.json();
  const items = data.items ?? [];

  if (items.length === 0) {
    console.error(`No press releases found for "${slug}".`);
    process.exit(1);
  }

  console.log(`Found ${items.length} press releases.`);

  // Collect all PDF attachments
  const downloads: {
    url: string;
    filename: string;
    newsTitle: string;
  }[] = [];

  for (const item of items) {
    const attachments = item.content?.attachments ?? [];
    const pdfs = attachments.filter((a) => isPdfUrl(a.url));

    for (const pdf of pdfs) {
      const date = extractDate(item.timestamp);
      const titleSlug = slugify(pdf.title || item.title);
      const filename = `${date}_${titleSlug}.pdf`;
      downloads.push({ url: pdf.url, filename, newsTitle: item.title });
    }
  }

  if (downloads.length === 0) {
    console.log("\nNo PDF attachments found in the fetched press releases.");
    process.exit(0);
  }

  console.log(`\nFound ${downloads.length} PDF attachment(s) to download.`);
  console.log(`Output directory: ${outDir}\n`);

  // Create output directory
  mkdirSync(outDir, { recursive: true });

  // Download each PDF
  let successCount = 0;
  let failCount = 0;

  for (const dl of downloads) {
    const outPath = resolve(outDir, dl.filename);
    process.stdout.write(`  Downloading: ${dl.filename} ... `);

    try {
      const pdfRes = await fetch(dl.url);
      if (!pdfRes.ok) {
        console.log(`FAILED (HTTP ${pdfRes.status})`);
        failCount++;
        continue;
      }

      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      writeFileSync(outPath, buffer);

      const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
      console.log(`OK (${sizeMb} MB)`);
      successCount++;
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : err}`);
      failCount++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Downloaded: ${successCount}/${downloads.length}`);
  if (failCount > 0) console.log(`Failed:     ${failCount}`);
  console.log(`Directory:  ${outDir}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
