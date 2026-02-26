/**
 * extract-contacts.ts
 *
 * Fetches a company's latest press release from MFN and extracts structured
 * content: contacts, about section, regulatory disclosure, and sections.
 *
 * Usage:
 *   npx tsx scripts/extract-contacts.ts <company-slug>
 *
 * Examples:
 *   npx tsx scripts/extract-contacts.ts climeon
 *   npx tsx scripts/extract-contacts.ts egetis-therapeutics
 *   npx tsx scripts/extract-contacts.ts hexicon
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  properties: {
    lang: string;
    tags: string[];
    type: string;
    scope: string;
  };
  content: {
    html: string;
    text: string;
    preamble: string;
    attachments: { url: string; title: string; tags: string[] }[];
  };
}

interface MfnFeedResponse {
  items: MfnFeedItem[];
  total: number;
}

interface MfnContact {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface MfnExtractedContent {
  contacts: MfnContact[];
  aboutCompany: string | null;
  certifiedAdviser: string | null;
  regulatoryDisclosure: string | null;
  sections: { heading: string; text: string }[];
}

// ---------------------------------------------------------------------------
// Content extraction (copied from lib/mfn-api.ts extractMfnContent)
// ---------------------------------------------------------------------------

function extractMfnContent(html: string): MfnExtractedContent {
  const stripHtml = (s: string) =>
    s
      .replace(/<[^>]+>/g, "\n")
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  // --- Contacts ---
  const contacts: MfnContact[] = [];

  // Strategy 1: mfn-footer mfn-contacts (structured, e.g. Egetis)
  const contactFooter = html.match(
    /<div class="mfn-footer mfn-contacts[^"]*">([\s\S]*?)<\/div>\s*(?:\n<div|$)/
  );
  // Strategy 2: generic mfn-footer with hash containing contact keywords
  const contactGenericFooter = html.match(
    /<div class="mfn-footer mfn-[a-f0-9]+">[^]*?(?:CONTACT|kontakta|INFORMATION)[^]*?<\/div>/i
  );
  // Strategy 3: bare mfn-footer (no subclass) containing contact keywords
  const contactBareFooter = html.match(
    /<div class="mfn-footer">\s*(?:<p>)?\s*(?:<span>)*\s*(?:<span>)*\s*(?:<strong>)?\s*(?:Mediakontakt|Företagskontakt|Investor Relations|Pressansvarig|Press\s*contact|Media\s*contact|CONTACT|kontakta|INFORMATION)[\s\S]*?<\/div>/i
  );
  // Strategy 4: inline in body
  const contactInline = html.match(
    /<strong[^>]*>(?:<[^>]+>)*[^<]*(?:kontakt[a-z]*|(?:please )?contact)[^]*?<\/strong>(?:<\/p>)?\s*([\s\S]*?)(?:<div class="mfn-footer|<strong[^>]*class="mfn-heading|$)/i
  );

  const contactSource =
    contactFooter?.[1] ??
    contactGenericFooter?.[0] ??
    contactBareFooter?.[0] ??
    contactInline?.[1] ??
    "";
  const contactBlock = stripHtml(contactSource);

  if (contactBlock) {
    const lines = contactBlock
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          l !== "-".repeat(l.length) &&
          l !== "_".repeat(l.length) &&
          !/^(?:FOR MORE|För (?:mer|ytterligare|vidare)|KONTAKT|Contact)/i.test(
            l
          )
      );

    const emailRe = /^(?:E-?mail:\s*)?[\w.+-]+@[\w.-]+\.\w+$/i;
    const phoneRe = /^(?:Phone:\s*|Tel(?:efon)?:\s*)?[+0][\s()\d-]{7,}/i;
    const isEmail = (s: string) => emailRe.test(s);
    const isPhone = (s: string) => phoneRe.test(s);
    const extractEmail = (s: string) => {
      const m = s.match(/([\w.+-]+@[\w.-]+\.\w+)/);
      return m ? m[1] : s;
    };
    const extractPhone = (s: string) =>
      s.replace(/^(?:Phone|Tel(?:efon)?):\s*/i, "").trim();

    const consumed = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (consumed.has(i)) continue;

      // Pattern A: "Name, Title" or "Name, Title, email, phone"
      const nameTitle =
        lines[i].length <= 200
          ? lines[i].match(/^([A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]{1,50}),\s*(.+?)$/)
          : null;
      if (nameTitle) {
        const name = nameTitle[1].trim();
        let role = nameTitle[2].trim();
        let email: string | null = null;
        let phone: string | null = null;

        const inlineEmail = role.match(/([\w.+-]+@[\w.-]+\.\w+)/);
        const inlinePhone = role.match(/([+0][\s()\d-]{7,})/);
        if (inlineEmail) {
          email = inlineEmail[1];
          role = role.replace(inlineEmail[0], "").replace(/,\s*$/, "").trim();
        }
        if (inlinePhone) {
          phone = inlinePhone[1].trim();
          role = role.replace(inlinePhone[0], "").replace(/,\s*$/, "").trim();
        }

        consumed.add(i);
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (!email && isEmail(lines[j])) {
            email = extractEmail(lines[j]);
            consumed.add(j);
          } else if (!phone && isPhone(lines[j])) {
            phone = extractPhone(lines[j]);
            consumed.add(j);
          } else if (/^(?:E-?mail|Phone|Tel):\s*$/i.test(lines[j])) {
            continue;
          } else if (
            lines[j].match(/^[A-ZÅÄÖ]/) &&
            !isEmail(lines[j]) &&
            !isPhone(lines[j])
          ) {
            break;
          }
        }

        contacts.push({ name, role: role || null, email, phone });
        continue;
      }

      // Pattern B: Department/category style
      if (
        /^(?:Mediakontakt|Företagskontakt|Investor Relations|Pressansvarig|Press\s*contact|Media\s*contact|Communications?\s*Department)/i.test(
          lines[i]
        )
      ) {
        const dept = lines[i];
        let name: string | null = null;
        let role: string | null = null;
        let email: string | null = null;
        let phone: string | null = null;
        consumed.add(i);
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (isEmail(lines[j])) {
            email = extractEmail(lines[j]);
            consumed.add(j);
          } else if (isPhone(lines[j])) {
            phone = extractPhone(lines[j]);
            consumed.add(j);
          } else if (
            !name &&
            /^[A-ZÅÄÖ]/.test(lines[j]) &&
            !isEmail(lines[j]) &&
            !isPhone(lines[j])
          ) {
            name = lines[j];
            consumed.add(j);
          } else if (
            name &&
            !role &&
            !isEmail(lines[j]) &&
            !isPhone(lines[j]) &&
            /^(?:CEO|CFO|CTO|COO|VD|VP|Head|Chief|Director|Chef|Kommunikation|Finans)/i.test(
              lines[j]
            )
          ) {
            role = lines[j];
            consumed.add(j);
          } else if (
            /^(?:Mediakontakt|Företagskontakt|Investor|Press)/i.test(lines[j])
          ) {
            break;
          }
        }
        if (name || email) {
          contacts.push({
            name: name ?? dept,
            role: role ?? dept,
            email,
            phone,
          });
        }
        continue;
      }

      // Pattern C: Name on own line followed by Title, phone, email
      if (
        /^[A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]+$/.test(lines[i]) &&
        !isEmail(lines[i]) &&
        !isPhone(lines[i]) &&
        i + 1 < lines.length
      ) {
        const nextLine = lines[i + 1];
        const looksLikeRole =
          /(?:VD|CEO|CFO|CTO|COO|VP|Head|Chief|Director|Chef|direktör|ansvarig|ordförande|Chairman|Manager|Officer|Investor|Communications|IR\b)/i.test(
            nextLine
          ) &&
          !isEmail(nextLine) &&
          !isPhone(nextLine);

        if (looksLikeRole) {
          const name = lines[i].trim();
          const role = nextLine.trim();
          let email: string | null = null;
          let phone: string | null = null;
          consumed.add(i);
          consumed.add(i + 1);
          for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
            if (!email && isEmail(lines[j])) {
              email = extractEmail(lines[j]);
              consumed.add(j);
            } else if (!phone && isPhone(lines[j])) {
              phone = extractPhone(lines[j]);
              consumed.add(j);
            } else if (
              /^[A-ZÅÄÖ]/.test(lines[j]) &&
              !isEmail(lines[j]) &&
              !isPhone(lines[j])
            ) {
              break;
            }
          }
          contacts.push({ name, role, email, phone });
          continue;
        }
      }

      // Pattern D: Standalone name/department followed by email
      if (
        /^[A-ZÅÄÖÉÈÊ]/.test(lines[i]) &&
        !isEmail(lines[i]) &&
        !isPhone(lines[i]) &&
        i + 1 < lines.length &&
        isEmail(lines[i + 1])
      ) {
        const name = lines[i].trim();
        const email = extractEmail(lines[i + 1]);
        let phone: string | null = null;
        consumed.add(i);
        consumed.add(i + 1);
        if (i + 2 < lines.length && isPhone(lines[i + 2])) {
          phone = extractPhone(lines[i + 2]);
          consumed.add(i + 2);
        }
        contacts.push({ name, role: null, email, phone });
        continue;
      }
    }
  }

  // --- About Company ---
  const aboutMatch =
    html.match(/<div class="mfn-footer mfn-about[^"]*">([\s\S]*?)<\/div>/) ??
    html.match(
      /<div class="mfn-footer mfn-[a-f0-9]+">\s*(?:<p>)?\s*(?:<strong[^>]*>)?\s*(?:Om |About )[^]*?<\/div>/i
    );
  const aboutCompany = aboutMatch
    ? stripHtml(aboutMatch[1] ?? aboutMatch[0])
    : null;

  // --- Regulatory Disclosure ---
  const regMatch = html.match(
    /<div class="mfn-footer mfn-regulatory[^"]*">([\s\S]*?)<\/div>/
  );
  const regulatoryDisclosure = regMatch ? stripHtml(regMatch[1]) : null;

  // --- Certified Adviser ---
  const text = stripHtml(html);
  const caMatch = text.match(
    /Certified Adviser[:\s]*\n(.*?)(?=\n\n|Om |About |$)/is
  );
  const certifiedAdviser = caMatch ? caMatch[1].trim() : null;

  // --- Sections ---
  const sections: { heading: string; text: string }[] = [];
  const headingParts = html.split(/<strong class="mfn-heading-[12]">/);
  for (let i = 1; i < headingParts.length; i++) {
    const endTag = headingParts[i].indexOf("</strong>");
    if (endTag === -1) continue;
    const heading = headingParts[i].substring(0, endTag).trim();
    const rest = headingParts[i].substring(endTag);
    const sectionEnd = rest.search(
      /<strong class="mfn-heading|<div class="mfn-footer/
    );
    const sectionHtml = sectionEnd > 0 ? rest.substring(0, sectionEnd) : rest;
    const sectionText = stripHtml(sectionHtml).replace(/^\s*\n/, "");
    if (sectionText) {
      sections.push({ heading, text: sectionText });
    }
  }

  return {
    contacts,
    aboutCompany,
    certifiedAdviser,
    regulatoryDisclosure,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.log("Usage: npx tsx scripts/extract-contacts.ts <company-slug>");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx scripts/extract-contacts.ts climeon");
    console.log("  npx tsx scripts/extract-contacts.ts egetis-therapeutics");
    console.log("  npx tsx scripts/extract-contacts.ts hexicon");
    process.exit(1);
  }

  console.log(`Fetching latest press release for "${slug}"...`);

  // Fetch the latest press release (non-compact to get full HTML)
  const url = `https://mfn.se/all/a/${slug}.json?limit=1`;
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

  if (!data.items || data.items.length === 0) {
    console.error(`No press releases found for "${slug}".`);
    process.exit(1);
  }

  const item = data.items[0];

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Company: ${item.author.name}`);
  console.log(`Title:   ${item.title}`);
  console.log(`Date:    ${item.timestamp}`);
  console.log(
    `Type:    ${item.properties.type} | Lang: ${item.properties.lang}`
  );
  console.log(`Tags:    ${(item.properties.tags ?? []).join(", ") || "-"}`);
  console.log(`${"=".repeat(70)}`);

  // Extract structured content
  const html = item.content?.html ?? "";
  if (!html) {
    console.log("\nNo HTML content available for extraction.");
    process.exit(0);
  }

  const extracted = extractMfnContent(html);

  // --- Print Contacts ---
  console.log(`\n--- Contacts (${extracted.contacts.length}) ---`);
  if (extracted.contacts.length === 0) {
    console.log("  (none found)");
  } else {
    for (const c of extracted.contacts) {
      console.log(`  Name:  ${c.name}`);
      if (c.role) console.log(`  Role:  ${c.role}`);
      if (c.email) console.log(`  Email: ${c.email}`);
      if (c.phone) console.log(`  Phone: ${c.phone}`);
      console.log("");
    }
  }

  // --- Print About ---
  console.log("--- About Company ---");
  if (extracted.aboutCompany) {
    // Truncate to first 500 chars for readability
    const about =
      extracted.aboutCompany.length > 500
        ? extracted.aboutCompany.slice(0, 500) + "..."
        : extracted.aboutCompany;
    console.log(`  ${about}`);
  } else {
    console.log("  (none found)");
  }

  // --- Print Certified Adviser ---
  if (extracted.certifiedAdviser) {
    console.log("\n--- Certified Adviser ---");
    console.log(`  ${extracted.certifiedAdviser}`);
  }

  // --- Print Regulatory Disclosure ---
  console.log("\n--- Regulatory Disclosure ---");
  if (extracted.regulatoryDisclosure) {
    console.log(`  ${extracted.regulatoryDisclosure}`);
  } else {
    console.log("  (none found)");
  }

  // --- Print Sections ---
  console.log(`\n--- Sections (${extracted.sections.length}) ---`);
  if (extracted.sections.length === 0) {
    console.log("  (none found)");
  } else {
    for (const s of extracted.sections) {
      // Show heading and first 200 chars of text
      const preview =
        s.text.length > 200 ? s.text.slice(0, 200) + "..." : s.text;
      console.log(`  [${s.heading}]`);
      console.log(`  ${preview}`);
      console.log("");
    }
  }

  // --- Print Attachments ---
  const attachments = item.content?.attachments ?? [];
  console.log(`--- Attachments (${attachments.length}) ---`);
  if (attachments.length === 0) {
    console.log("  (none)");
  } else {
    for (const a of attachments) {
      console.log(`  ${a.title || "(untitled)"}`);
      console.log(`  URL:  ${a.url}`);
      console.log(`  Tags: ${(a.tags ?? []).join(", ") || "-"}`);
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
