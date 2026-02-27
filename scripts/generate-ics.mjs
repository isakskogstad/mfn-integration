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

// Keywords to watch — catches mentions in press releases from ANY company
// Useful for investment companies whose portfolio holdings publish news elsewhere
// Keywords from FamilyOffice + VCCompany tables in Supabase
// Catches mentions of these companies in press releases from ANY Nordic company
const WATCHED_KEYWORDS = [
  // FamilyOffice
  "41an Invest",
  "Abraxas Holding",
  "ACACIA",
  "Active Invest",
  "Alsteron",
  "AltoCumulus",
  "AxSol",
  "Backahill",
  "Beijerinvest",
  "Bonnier Ventures",
  "Briban Invest",
  "Bure Equity",
  "Byggmästare AJ Ahlström",
  "Carl Bennet",
  "Creades",
  "Curus",
  "Danir",
  "EKO-Gruppen",
  "Ernström",
  "FAM AB",
  "Ferd",
  "Flat Capital",
  "Flerie Invest",
  "Formica Capital",
  "Fort Knox Förvaltning",
  "Frankenius Equity",
  "Gozal Invest",
  "Granitor",
  "Gullspång Invest",
  "Haflo",
  "Inbox Capital",
  "Ingka Investments",
  "JCE Group",
  "Jula Holding",
  "Kempestiftelserna",
  "Knil AB",
  "Latour",
  "Leksell Social Ventures",
  "Linc",
  "Lindéngruppen",
  "Löfberg Invest",
  "Lyko Group",
  "Max Burgers",
  "Medicon Village",
  "Mellby Gård",
  "Neptunia Invest",
  "Nolsterby Invest",
  "Nordstjernan",
  "Norrsken Foundation",
  "Novax",
  "Öresund",
  "Philian",
  "Profura",
  "Qarlbo",
  "R12 Kapital",
  "Rite Ventures",
  "RoosGruppen",
  "Salénia",
  "Sandberg Development",
  "Sätila Impact",
  "Skoogs",
  "Sobro",
  "Spiltan",
  "Stena Adactum",
  "Stena Sessan",
  "Svolder",
  "Swedia Capital",
  "Tetra Laval",
  "Traction",
  "Vera Invest",
  "Walerud Ventures",
  "Wellstreet",
  "Zenith",
  // VCCompany
  "Alder",
  "Alliance Ventures",
  "Almi Invest Greentech",
  "Amplio Private Equity",
  "Annexstruktur",
  "Byfounders",
  "Chalmers Ventures",
  "Course Corrected",
  "Curitas Ventures",
  "E14 Invest",
  "Eir Ventures",
  "EIT Urban Mobility",
  "Fairpoint Capital",
  "First Venture",
  "Fundforward",
  "Gullspång Re:food",
  "Industrifonden",
  "InnoEnergy",
  "Inventure",
  "Kale United",
  "Klimatet Invest",
  "Klint Ventures",
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
        const url = `https://mfn.se/all/a/${slug}.json?limit=50&compact=true`;
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

  // Fetch keyword search results (catches mentions across ALL companies)
  if (WATCHED_KEYWORDS.length > 0) {
    const kwBatchSize = 5;
    for (let i = 0; i < WATCHED_KEYWORDS.length; i += kwBatchSize) {
      const batch = WATCHED_KEYWORDS.slice(i, i + kwBatchSize);
      const results = await Promise.allSettled(
        batch.map(async (keyword) => {
          const url = `https://mfn.se/all/s/nordic.json?query=${encodeURIComponent(keyword)}&limit=30&compact=true`;
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.items || []).map((item) => ({
            ...item,
            _matchedKeyword: keyword,
          }));
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
        `Keyword batch ${Math.floor(i / kwBatchSize) + 1}/${Math.ceil(WATCHED_KEYWORDS.length / kwBatchSize)} (${allItems.length} items total)`,
      );
    }
  }

  // Sort by date descending
  allItems.sort((a, b) => {
    const da = new Date(a.content?.publish_date || 0);
    const db = new Date(b.content?.publish_date || 0);
    return db - da;
  });

  console.error(
    `Total: ${allItems.length} unique items from ${WATCHED_SLUGS.length} companies + ${WATCHED_KEYWORDS.length} keywords`,
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
    "X-WR-CALDESC:Alla händelser från bevakade bolag på MFN.se",
    // Refresh interval: 15 minutes (for calendar apps that support it)
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
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
    if (item._matchedKeyword)
      desc += "Sökord: " + icsEscape(item._matchedKeyword) + "\\n\\n";
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
