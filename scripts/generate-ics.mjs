#!/usr/bin/env node
/**
 * Fetches latest news from MFN for watched companies and generates feed.ics
 * Run via GitHub Actions on a schedule to keep the calendar feed up to date.
 */

const WATCHED_SLUGS = [
  "agtira",
  "arjo",
  "avsalt-group",
  "bioextrax",
  "biofrigas",
  "bomill",
  "bure-equity",
  "byggmastare-anders-j-ahlstrom-holding",
  "byhmgard",
  "c100",
  "cinis-fertilizer",
  "circhem",
  "clean-motion",
  "climeon",
  "creades",
  "creturner",
  "ctek",
  "dug-foodtech",
  "duni",
  "ecoclime-group",
  "ecorub",
  "ferroamp",
  "flatcapital",
  "gomero-group",
  "greater-than",
  "hexicon",
  "humble-group",
  "hybricon",
  "i-tech",
  "insplorion",
  "latour",
  "linc-ab",
  "ln-future-invest",
  "lyckegard",
  "lyko-group",
  "mantex",
  "metacon",
  "midsummer",
  "minesto",
  "modelon",
  "monivent",
  "nattaro-labs",
  "nexam-chemical-holding",
  "oresund",
  "organoclick",
  "powercell-sweden",
  "prebona",
  "recyctec-holding",
  "saltx-technology-holding",
  "scandinavian-enviro-systems",
  "seatwirl",
  "sht-smart-high-tech",
  "smoltek-nanotech-holding",
  "sustainable-energy-solutions-sweden-holding",
  "svenska-aerogel-holding",
  "svolder",
  "traction",
  "unibap-space-solutions",
  "vend-marketplaces",
  "voitechnology",
  "xoma",
];

const TAG_LABELS = {
  ":regulatory": "Regulatorisk",
  ":regulatory:mar": "MAR",
  ":regulatory:listing": "Notering",
  ":correction": "Rättelse",
  "sub:report": "Rapport",
  "sub:report:annual": "Årsredovisning",
  "sub:report:interim": "Delrapport",
  "sub:report:interim:q1": "Q1",
  "sub:report:interim:q2": "Q2",
  "sub:report:interim:q3": "Q3",
  "sub:report:interim:q4": "Q4",
  "sub:ci": "Bolagsinfo",
  "sub:ci:insider": "Insynshandel",
  "sub:ci:gm": "Bolagsstämma",
  "sub:ci:gm:notice": "Stämmokallelse",
  "sub:ci:other": "Annan info",
};

function icsEscape(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toICSDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function foldLine(line) {
  const parts = [];
  while (line.length > 75) {
    parts.push(line.substring(0, 75));
    line = " " + line.substring(75);
  }
  parts.push(line);
  return parts.join("\r\n");
}

async function fetchMFNItems() {
  const dedup = new Set();
  const allItems = [];
  const slugSet = new Set(WATCHED_SLUGS);

  // Fetch per-company feeds in parallel batches of 10
  // Each company feed: latest 20 items
  const batchSize = 10;
  for (let i = 0; i < WATCHED_SLUGS.length; i += batchSize) {
    const batch = WATCHED_SLUGS.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (slug) => {
        const url = `https://mfn.se/all/a/${slug}.json?limit=20&compact=true`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.items || [];
      }),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const item of r.value) {
        const key =
          (item.news_id || "") + "::" + (item.content?.publish_date || "");
        if (!dedup.has(key)) {
          dedup.add(key);
          allItems.push(item);
        }
      }
    }
    console.error(
      `Fetched batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(WATCHED_SLUGS.length / batchSize)} (${allItems.length} items so far)`,
    );
  }

  // Sort by date descending
  allItems.sort((a, b) => {
    const da = new Date(a.content?.publish_date || 0);
    const db = new Date(b.content?.publish_date || 0);
    return db - da;
  });

  console.error(
    `Total: ${allItems.length} unique items from ${WATCHED_SLUGS.length} companies`,
  );
  return allItems;
}

function buildICS(items) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MFN Explorer//Bevakade Bolag//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MFN Bevakade Bolag",
    "X-WR-CALDESC:Pressmeddelanden från bevakade bolag på MFN.se",
    // Refresh interval: 30 minutes (for calendar apps that support it)
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  for (const item of items) {
    const pubDate = item.content?.publish_date || item.published || "";
    const dtStart = toICSDate(pubDate);
    if (!dtStart) continue;

    const title = item.content?.title || item.title || "MFN-nyhet";
    const company = item.author?.name || "";
    const url = item.url || "";
    const preamble = item.content?.preamble || "";
    const tags = (item.properties?.tags || [])
      .map((t) => TAG_LABELS[t] || t.replace(/^[:]/, ""))
      .join(", ");
    const uid = (item.news_id || Math.random().toString(36)) + "@mfn.se";

    let desc = "";
    if (company) desc += company + "\\n\\n";
    if (preamble) desc += icsEscape(preamble) + "\\n\\n";
    if (tags) desc += "Taggar: " + icsEscape(tags) + "\\n";
    if (url) desc += "\\nLäs mer: " + url;

    const startDate = new Date(pubDate);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const dtEnd = toICSDate(endDate.toISOString());
    const dtStamp = toICSDate(new Date().toISOString());

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine("UID:" + uid));
    lines.push("DTSTART:" + dtStart);
    lines.push("DTEND:" + dtEnd);
    lines.push("DTSTAMP:" + dtStamp);
    lines.push(
      foldLine(
        "SUMMARY:" + icsEscape(company ? `[${company}] ${title}` : title),
      ),
    );
    if (desc) lines.push(foldLine("DESCRIPTION:" + desc));
    if (url) lines.push(foldLine("URL:" + url));
    if (company) {
      lines.push(
        foldLine(
          "ORGANIZER;CN=" + icsEscape(company) + ":MAILTO:noreply@mfn.se",
        ),
      );
    }

    const isReg = (item.properties?.tags || []).includes(":regulatory");
    if (isReg) lines.push("CATEGORIES:Regulatorisk");
    const reportTag = (item.properties?.tags || []).find((t) =>
      t.startsWith("sub:report"),
    );
    if (reportTag) lines.push("CATEGORIES:Rapport");

    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

async function main() {
  try {
    const items = await fetchMFNItems();
    const ics = buildICS(items);
    // Write to stdout — redirect to feed.ics in the workflow
    process.stdout.write(ics);
    console.error(`Generated ICS with ${items.length} events`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
