# MFN.se → LoopDesk Integrationsguide

> MFN (Modular Finance News) distribuerar pressmeddelanden för nordiska börsnoterade bolag.
> Alla API:er är publika — ingen API-nyckel behövs.
>
> Denna guide beskriver hur MFN-data integreras i LoopDesk-systemet.

---

## 1. Realtidsbevakning — Strategi

Det finns tre kompletterande metoder för att bevaka MFN-pressmeddelanden i realtid.
Rekommendationen är att använda JSON-polling som primär metod, med WebSocket som tillägg för live-UI.

### Primär: JSON Polling med `?after`-parameter

Enklast och mest driftsäkert. Polla JSON-feeden var 30–60:e sekund med en tidsstämpel
som markör för senast hämtade pressmeddelande. Servern returnerar bara nyheter nyare
än markören.

```typescript
// scripts/mfn-monitor.mjs — Polling loop
const MFN_BASE = "https://mfn.se";
const FEED_PATH = "/all/s/nordic.json";
const POLL_INTERVAL = 30_000; // 30 seconds

let lastTimestamp: string | null = null;

async function pollMfnFeed() {
  const params = new URLSearchParams({
    compact: "true",
    limit: "50",
  });
  if (lastTimestamp) {
    params.set("after", lastTimestamp);
  }

  const url = `${MFN_BASE}${FEED_PATH}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const feed = await res.json();

  if (feed.items?.length > 0) {
    // Uppdatera markör till senaste publish_date
    lastTimestamp = feed.items[0].content.publish_date;

    for (const item of feed.items) {
      await processNewsItem(item);
    }
  }

  return feed.items?.length ?? 0;
}

// Kör polling-loop
setInterval(async () => {
  try {
    const count = await pollMfnFeed();
    if (count > 0) console.log(`Processed ${count} new items`);
  } catch (err) {
    console.error("Poll error:", err.message);
  }
}, POLL_INTERVAL);
```

**Fördelar:**

- Enkel implementation, inga beroenden (ingen WebSocket-klient behövs)
- Servervänligt — MFN cachar JSON-svar via Cloudflare
- Missade meddelanden hämtas automatiskt vid nästa poll
- Fungerar bakom brandväggar och proxys

**Nackdelar:**

- 30–60 sekunders latens (acceptabelt för de flesta användningsfall)

### Sekundär: WebSub-prenumerationer

För högprioriterade bolag kan man prenumerera via WebSub-protokollet.
MFN skickar en HTTP POST till din callback-URL varje gång ett nytt pressmeddelande publiceras.

```typescript
import { subscribeMfnEmail, getMfnEntityFeedUrl } from "@/lib/mfn-api";

// WebSub kräver en publikt tillgänglig callback-URL
// Topic = feed.mfn.se/v1/feed/{entity_id}
const topic = getMfnEntityFeedUrl("81ca67a1-632b-450f-9db7-946963f337d1");
// → "https://feed.mfn.se/v1/feed/81ca67a1-632b-450f-9db7-946963f337d1"

// Alternativ: e-postprenumeration via hub.mfn.se
await subscribeMfnEmail("/all/a/volvo", "alerts@loopdesk.se", "sv");
// Skickar verifieringsmail → klicka på länken för att aktivera
```

**Krav:**

- Publikt tillgänglig HTTPS callback-URL (t.ex. `https://www.loopdesk.se/api/webhooks/mfn`)
- Hub: `https://feed.mfn.se/v1` (standard WebSub)
- Topic-format: `https://feed.mfn.se/v1/feed/{entity_id}`

### Tertiär: WebSocket för Live-UI

WebSocket ger omedelbar push av nya pressmeddelanden — perfekt för realtidsdashboard
i webbläsaren. Servern skickar HTML-fragment (inte JSON).

```typescript
import { buildMfnFilter, getMfnWebSocketUrl } from "@/lib/mfn-api";

// Bygg filter för svenska bolag, bara regulatoriska
const filter = buildMfnFilter({
  segments: [13, 14, 15, 5, 9], // Large/Mid/Small Cap + First North + Spotlight
  languages: ["sv"],
  tags: [":regulatory"],
});

const wsUrl = getMfnWebSocketUrl(filter ?? undefined);
// → "wss://mfn.se/all/s/nordic?filter=..."

const ws = new WebSocket(wsUrl);

ws.onmessage = (event) => {
  const html = event.data;
  // Servern skickar HTML-fragment — parsning krävs
  const titleMatch = html.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</);
  if (titleMatch) {
    console.log("Nytt pressmeddelande:", titleMatch[1].trim());
  }
};

ws.onclose = (event) => {
  if (event.code === 3000) {
    // Servern begär snabb reconnect
    connect();
    return;
  }
  // Exponentiell backoff, max 30s
  setTimeout(connect, Math.min(reconnectDelay * 2, 30000));
};
```

**OBS:** WebSocket skickar HTML-fragment, inte strukturerad JSON. Använd den främst
som trigger/notis — hämta sedan komplett data via JSON-feeden.

---

## 2. Entity Cache-strategi

MFN:s sök-API stöder **inte** sökning på organisationsnummer, LEI, entity_id eller slug.
Den enda sökbara fälten är bolagsnamn, ticker och ISIN.

Lösningen är att dagligen hämta samtliga ~2 000 entiteter via en tom sökning och
bygga in-memory lookup-tabeller.

```typescript
import {
  buildMfnEntityCache,
  type MfnEntityCache,
  type MfnCompany,
} from "@/lib/mfn-api";

// Bygg cachen — anropa en gång vid uppstart, refresha dagligen
let cache: MfnEntityCache;

async function refreshEntityCache() {
  cache = await buildMfnEntityCache();
  console.log(
    `Entity cache built: ${
      cache.totalEntities
    } entities at ${cache.builtAt.toISOString()}`
  );
}

// buildMfnEntityCache() gör internt:
//   1. searchMfnCompanies("", 2000) — hämtar ALLA entiteter
//   2. Bygger tre Maps:
//      - byOrgNumber: Map<string, MfnCompany>  (nyckel: "556536-7488")
//      - byEntityId:  Map<string, MfnCompany>  (nyckel: UUID)
//      - bySlug:      Map<string, MfnCompany>  (nyckel: URL-slug)

// Snabb lookup efter organisationsnummer
const volvo = cache.byOrgNumber.get("556012-5790");
// → { name: "Volvo", entity_id: "...", slug: "volvo", tickers: ["XSTO:VOLV-B"], ... }

// Lookup efter entity_id (kommer från news items)
const entity = cache.byEntityId.get("81ca67a1-632b-450f-9db7-946963f337d1");

// Lookup efter slug (kommer från URL:er)
const bySlug = cache.bySlug.get("duni");
```

**Implementation i LoopDesk:**

- Cachen initieras vid serverstart i monitorskriptet (`scripts/mfn-monitor.mjs`)
- Refreshas var 24:e timme via `setInterval`
- Används för att matcha `author.entity_id` i inkommande nyheter mot lokala bolag

**Org-nummerformat i MFN:**
MFN lagrar organisationsnummer i `local_refs` som `"SE:556012-5790"`.
Cachen strippar `SE:`-prefixet och indexerar på `"556012-5790"` (med bindestreck).

---

## 3. Matchning mot lokal databas

En förmatchning mellan LoopDesks Supabase-databas (WatchedCompany, VCCompany,
FamilyOffice) och MFN:s entiteter har identifierat **62 bolag** som finns i båda systemen.

### Matchningsmetoder

| Metod        | Antal | Beskrivning                                             |
| ------------ | ----- | ------------------------------------------------------- |
| `exact`      | 7     | Exakt namnmatchning (case-insensitive)                  |
| `normalized` | 54    | Org-nummer matchat via `local_refs` efter normalisering |
| `fuzzy`      | 1     | Fuzzy namnmatchning (Levenshtein-avstånd)               |

### Matchningsdata

Filen `mfn_matches.json` innehåller färdiga mappningar. Varje post ser ut så här:

```json
{
  "db_name": "Volvo AB",
  "orgNumber": "556012-5790",
  "sources": ["WatchedCompany"],
  "match_type": "normalized",
  "mfn_name": "Volvo",
  "mfn_entity_id": "81ca67a1-632b-450f-9db7-946963f337d1",
  "mfn_slug": "volvo",
  "mfn_tickers": ["XSTO:VOLV-B", "CAPA:VOLVBs"],
  "mfn_isins": ["SE0000115446"]
}
```

### Matchningsskriptet

Skriptet `scripts/mfn-match-watched.mjs` kör matchningen:

```bash
# Kör matchning och spara resultatet
node scripts/mfn-match-watched.mjs > data/mfn_matches.json
```

Skriptet:

1. Hämtar alla WatchedCompany från Supabase
2. Söker MFN per bolagsnamn (rensat från "AB", "Aktiebolag" etc.)
3. Matchar via `local_refs` (org-nummer) — primärt
4. Faller tillbaka på exakt namnmatchning — sekundärt
5. Rate-limitar med 300 ms mellan anrop

### Dataanrikning

De matchade bolagen kan berikas i den lokala databasen med:

| Fält          | Källa             | Exempel                      |
| ------------- | ----------------- | ---------------------------- |
| ISIN          | `mfn_isins`       | `SE0000115446`               |
| Ticker        | `mfn_tickers`     | `XSTO:VOLV-B`                |
| LEI           | `mfn_leis`        | `549300...`                  |
| MFN-slug      | `mfn_slug`        | `volvo`                      |
| MFN entity_id | `mfn_entity_id`   | UUID                         |
| Logo-URL      | `brand_image_url` | `https://storage.mfn.se/...` |

---

## 4. Pressmeddelande-bearbetning

Pipeline för att bearbeta inkommande pressmeddelanden från MFN.

### Steg 1: Ta emot nyhetspost

Nyheter inkommer via polling (primärt), WebSub eller WebSocket. Varje post
är ett `MfnNewsItem`-objekt:

```typescript
interface MfnNewsItem {
  news_id: string; // Unikt ID
  group_id: string; // Grupperar sv/en-versioner
  url: string; // Permalink till mfn.se
  author: MfnCompany; // Avsändande bolag
  subjects: MfnCompany[]; // Omnämnda bolag (vid M&A etc.)
  properties: {
    lang: string; // "sv" | "en"
    type?: string; // "ir" | "pr"
    tags: string[]; // [":regulatory", "sub:report:interim:q2", ...]
  };
  content: {
    title: string;
    slug: string;
    publish_date: string; // ISO 8601
    preamble?: string; // Ingress
    html?: string; // Full HTML (ej med compact=true)
    attachments?: Array<{
      file_title: string;
      content_type: string;
      url: string; // https://storage.mfn.se/...
      tags: string[]; // [":primary", "archive:report:pdf", ...]
    }>;
  };
}
```

### Steg 2: Matcha mot lokalt bolag

```typescript
// Matcha avsändaren mot lokal databas via entity cache
const entityId = item.author.entity_id;
const localCompany = cache.byEntityId.get(entityId);

if (!localCompany) {
  // Alternativ: extrahera org-nummer från local_refs
  const orgNumber = extractOrgNumber(item.author.local_refs);
  // → "556012-5790"
}
```

### Steg 3: Extrahera strukturerad data

Funktionen `extractMfnContent()` parsrar HTML-innehållet och extraherar
kontaktpersoner, om-sektion, regulatorisk information m.m.

```typescript
import { extractMfnContent, type MfnExtractedContent } from "@/lib/mfn-api";

// Hämta komplett post (inte compact) för att få HTML
const fullItem = await fetch(
  `https://mfn.se/a/${item.author.slug}/${item.content.slug}.json`
);
const data = await fullItem.json();

const extracted: MfnExtractedContent = extractMfnContent(data.content.html);
// → {
//     contacts: [
//       { name: "Anna Svensson", role: "VD", email: "anna@bolag.se", phone: "+46 70 123 45 67" }
//     ],
//     aboutCompany: "Bolaget AB utvecklar...",
//     certifiedAdviser: "FNCA Sweden AB, info@fnca.se, +46 8 528 00 399",
//     regulatoryDisclosure: "Informationen lämnades ... den 2026-02-26 08:00 CET",
//     sections: [
//       { heading: "VD har ordet", text: "Under kvartalet..." },
//       { heading: "Väsentliga händelser", text: "..." }
//     ]
//   }
```

### Steg 4: Ladda ner bilagor

```typescript
// PDF-rapporter och bilagor
for (const att of item.content.attachments ?? []) {
  if (att.content_type === "application/pdf") {
    const pdfResponse = await fetch(att.url);
    const buffer = await pdfResponse.arrayBuffer();
    // Spara till Supabase Storage eller lokal disk
  }
}
```

### Steg 5: Lagra och notifiera

```typescript
// Spara till Supabase
const row = {
  external_id: `mfn:${item.news_id}`,
  source: "mfn",
  title: item.content.title,
  published_at: item.content.publish_date,
  url: item.url,
  company_name: item.author.name,
  org_number: extractOrgNumber(item.author.local_refs),
  tickers: item.author.tickers || [],
  language: item.properties.lang,
  tags: item.properties.tags || [],
  preamble: item.content.preamble || null,
  raw_json: item,
};

await supabase.from("MfnNews").upsert([row], { onConflict: "external_id" });

// Trigga Slack-notis om bolaget bevakas
if (localCompany) {
  await sendSlackNotification({
    company: localCompany.name,
    title: item.content.title,
    url: item.url,
    tags: item.properties.tags,
  });
}
```

---

## 5. Fil- och mediahantering

All MFN-media serveras från `storage.mfn.se`, Cloudflare-cachat, utan autentisering.

### PDF-bilagor

PDF-filer (rapporter, pressmeddelanden) refereras i `content.attachments`:

```typescript
// Hitta primär PDF-bilaga
const primaryPdf = item.content.attachments?.find(
  (att) =>
    att.tags.includes(":primary") && att.content_type === "application/pdf"
);

if (primaryPdf) {
  // Direkt nedladdning — ingen auth krävs
  const res = await fetch(primaryPdf.url);
  // → https://storage.mfn.se/{uuid}/{slug}.pdf
}

// Alla PDF-bilagor (rapport + bilagor)
const allPdfs =
  item.content.attachments?.filter(
    (att) => att.content_type === "application/pdf"
  ) ?? [];
```

### Bilder med storleksändering

Bilder kan storleksändras via `?size`-parameter:

```typescript
const imageUrl = "https://storage.mfn.se/{uuid}/{slug}.jpeg";

// Tillgängliga storlekar:
const thumbnail = `${imageUrl}?size=w-512`; // ~50 KB
const medium = `${imageUrl}?size=w-1024`; // ~150 KB
const large = `${imageUrl}?size=w-2048`; // ~340 KB
const original = imageUrl; // ~6 MB (original)

// Kombinera med download-header:
const downloadUrl = `${imageUrl}?size=w-1024&download=true`;
```

### Bolagslogotyper

Logotyper finns i `author.brand_image_url`:

```typescript
const logoUrl = item.author.brand_image_url;
// → "https://storage.mfn.se/a/{company-slug}/{uuid}/{slug}"

// Kan även storleksändras:
const smallLogo = `${logoUrl}?size=w-512`;
```

### PR Room (pressrumsmedia)

Vissa bolag har ett PR Room med kurerade mediesamlingar (produktbilder,
managementfoton, logotyper i hög upplösning).

```
URL:    https://mfn.se/pr/{slug}
        https://mfn.se/pr/{slug}?collection={collectionId}
        https://mfn.se/pr/{slug}?collection={id}&media-item={itemId}
```

PR Room finns bara för bolag där `window.PR_ROOM = true` på bolagssidan.
Datat måste scrapas från HTML — inget JSON-API finns.

### Bilage-taggar i JSON-feeden

| Tagg                 | Beskrivning                    |
| -------------------- | ------------------------------ |
| `:primary`           | Primär bilaga (huvudrapporten) |
| `archive:report:pdf` | Arkiverad rapport-PDF          |
| `image:primary`      | Primärbild för nyheten         |

---

## 6. RSS/Atom Feeds

MFN tillhandahåller feeds i flera format. Användbara för externa läsare,
webhook-integrationer eller som backup-bevakningskanal.

### Feed-URL:er

```
# Per bolag
https://mfn.se/all/a/{slug}.rss       RSS 2.0
https://mfn.se/all/a/{slug}.atom      Atom
https://mfn.se/all/a/{slug}.json      JSON Feed
https://mfn.se/all/a/{slug}.xml       XML

# Globalt (nordiskt)
https://mfn.se/all/s/nordic.rss       RSS 2.0
https://mfn.se/all/s/nordic.atom      Atom
https://mfn.se/all/s/nordic.json      JSON Feed

# Feed API (entity_id-baserat, WebSub-topic)
https://feed.mfn.se/v1/feed/{entity_id}
```

### RSS-tillägg (extensions)

MFN:s RSS-feed innehåller icke-standardiserade XML-element:

```xml
<item>
  <title>Volvo publicerar kvartalsrapport Q3 2026</title>
  <link>https://mfn.se/a/volvo/volvo-publicerar-kvartalsrapport-q3-2026</link>
  <pubDate>Thu, 24 Oct 2026 07:30:00 +0200</pubDate>
  <x:language>sv</x:language>
  <x:tag>:regulatory</x:tag>
  <x:tag>sub:report:interim:q3</x:tag>
  <x:scope>SE</x:scope>
  <x:content type="html">...</x:content>
  <x:content type="text">...</x:content>
</item>
```

### Hjälpfunktioner

```typescript
import {
  getMfnRssFeedUrl,
  getMfnAtomFeedUrl,
  getMfnEntityFeedUrl,
} from "@/lib/mfn-api";

const rss = getMfnRssFeedUrl("volvo"); // → .../all/a/volvo.rss
const atom = getMfnAtomFeedUrl("volvo"); // → .../all/a/volvo.atom
const feed = getMfnEntityFeedUrl("81ca67a1-..."); // → feed.mfn.se/v1/feed/...
```

---

## 7. Kalenderbevakning

MFN tillhandahåller en global kalender med kommande rapportdatum, bolagsstämmor
och andra finansiella händelser.

### Hämta kalenderdata

```typescript
import { fetchMfnGlobalCalendar, type MfnCalendarEvent } from "@/lib/mfn-api";

// Hämta svenska bolagskalenderhändelser
const html = await fetchMfnGlobalCalendar("SE");
// Returnerar HTML — parsning krävs
```

**URL:**

```
GET https://mfn.se/partials/global-calendar?scope=SE
GET https://mfn.se/partials/global-calendar?scope=nordic
GET https://mfn.se/partials/global-calendar?scope=SE&filter=(and(or(a.market_segment_ids@>[13])))
```

### Händelsetyper

| Typ (svenska)             | Beskrivning                                  |
| ------------------------- | -------------------------------------------- |
| Kvartalsrapport           | Kvartalsrapport (med kvartal, t.ex. 2026-Q3) |
| Bokslutskommuniké         | Helårsbokslut (med räkenskapsår, t.ex. 2025) |
| Årsredovisning            | Årsredovisning                               |
| Årsstämma                 | Årsstämma                                    |
| Extra Bolagsstämma        | Extraordinär bolagsstämma                    |
| X-dag ordinarie utdelning | Ex-utdelningsdag (med ticker + belopp)       |
| Split                     | Aktiesplit (t.ex. "CLIME B 10:1")            |

### Parsning av kalender-HTML

Kalendern returnerar HTML med datumgrupper. Varje grupp innehåller bolagsposter
med rapportdatum, tid, typ och detaljer. Parsning med regex eller DOM-parser krävs.

```typescript
// Exempel: extrahera händelser från HTML
interface CalendarEvent {
  date: string; // "2026-10-23"
  time: string | null; // "07:30"
  type: string; // "Kvartalsrapport"
  detail: string; // "2026-Q3"
  slug: string; // "volvo"
  name: string; // "Volvo"
}

function parseCalendarHtml(html: string): CalendarEvent[] {
  // Implementation: parsera HTML-tabeller/listor
  // Returnera strukturerade händelser
}
```

---

## 8. Notiser och prenumerationer

MFN erbjuder flera kanaler för att ta emot notiser om nya pressmeddelanden.

### E-postprenumeration via WebSub Hub

```typescript
import { subscribeMfnEmail } from "@/lib/mfn-api";

// Prenumerera på alla pressmeddelanden från Volvo
await subscribeMfnEmail("/all/a/volvo", "alerts@loopdesk.se", "sv");

// Prenumerera på hela nordiska feeden
await subscribeMfnEmail("/all/s/nordic", "alerts@loopdesk.se", "sv");

// Prenumerera med filter (bara regulatoriska)
await subscribeMfnEmail(
  '/all/s/nordic?filter=(and(or(.properties.tags@>[":regulatory"])))',
  "alerts@loopdesk.se",
  "sv"
);
```

**Flöde:**

1. `POST hub.mfn.se` med `hub.callback=smtp://email@example.com`
2. MFN skickar verifieringsmail
3. Klicka på länken i mailet för att aktivera
4. Nya pressmeddelanden skickas till e-postadressen

### Bolagsspecifik e-postprenumeration

```typescript
import { subscribeToCompanyMail } from "@/lib/mfn-api";

await subscribeToCompanyMail(
  "81ca67a1-632b-450f-9db7-946963f337d1", // entity_id
  {
    options: ["ir", "pr"], // Nyhetstyper
    languages: ["sv", "en"], // Språk
    email: "alerts@loopdesk.se",
    name: "LoopDesk Alerts",
  },
  "sv", // Verifieringsmailets språk
  true // useNoAuth — kräver inte inloggning
);
```

### Hantera prenumerationer

```typescript
import {
  listMfnSubscriptions,
  updateMfnSubscription,
  unsubscribeMfn,
  reactivateMfnSubscription,
} from "@/lib/mfn-api";

// Lista prenumerationer (kräver JWT-token från MFN-mail)
const subs = await listMfnSubscriptions(jwtToken);

// Uppdatera filter
await updateMfnSubscription(subscriptionId, {
  langs: ["sv"],
  options: ["ir"],
});

// Avsluta prenumeration
await unsubscribeMfn(subscriptionId);

// Återaktivera
await reactivateMfnSubscription(subscriptionId);
```

### Web Push (kräver MFN-konto)

Web Push-notiser kräver inloggning på mfn.se (Twitter/X eller e-post).
Används via `authr/`-endpoints — **inte aktuellt för LoopDesk-integrationen**
eftersom vi använder server-side polling + egna Slack-notiser istället.

---

## 9. Rekommenderad arkitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                     Entity Cache (daglig refresh)                │
│                                                                  │
│  fetchAllMfnEntities() → ~2000 bolag                            │
│                                                                  │
│  Maps:                                                           │
│    byOrgNumber  "556012-5790"  → MfnCompany                     │
│    byEntityId   "81ca67a1-..."  → MfnCompany                    │
│    bySlug       "volvo"         → MfnCompany                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ lookup
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Real-time Monitor                            │
│                                                                  │
│  JSON polling (30s interval)                                     │
│    GET /all/s/nordic.json?after={ts}&compact=true                │
│                                                                  │
│  → Matcha author.entity_id mot cache                             │
│  → Filtrera: bevakas bolaget i WatchedCompany?                   │
│  → Vid träff: vidare till processing pipeline                    │
│                                                                  │
│  WebSocket (valfritt, för live-UI i dashboarden)                 │
│    wss://mfn.se/all/s/nordic                                    │
│    → Trigga UI-uppdatering, hämta sedan JSON för full data       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ nya poster
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Processing Pipeline                          │
│                                                                  │
│  1. extractMfnContent(html)                                      │
│     → kontaktpersoner, om-sektion, regulatorisk info, sektioner  │
│                                                                  │
│  2. Ladda ner bilagor från storage.mfn.se                        │
│     → PDF-rapporter → Supabase Storage                           │
│     → Bilder → storleksändra med ?size=w-1024                    │
│                                                                  │
│  3. Spara till Supabase                                          │
│     → MfnNews-tabell (upsert på external_id)                    │
│     → Koppla till Nyhetskort (unified news feed)                 │
│                                                                  │
│  4. Notifiera via Slack                                          │
│     → Skicka till relevanta kanaler baserat på bolag/taggar      │
│     → Formatera med Slack Blocks (titel, preamble, bilagor)      │
└─────────────────────────────────────────────────────────────────┘
```

### Dataflöde i LoopDesk

```
MFN.se  ──polling──→  mfn-monitor.mjs  ──match──→  Supabase (MfnNews)
                            │                            │
                            │                            ▼
                            │                    Nyhetskort (unified feed)
                            │                            │
                            ▼                            ▼
                    Slack-notiser              LoopDesk Dashboard
                    (lib/slack-notis.ts)       (app/page.tsx → SSE)
```

### Befintliga filer

| Fil                             | Beskrivning                                           |
| ------------------------------- | ----------------------------------------------------- |
| `lib/mfn-api.ts`                | Komplett typat API-klientbibliotek med alla endpoints |
| `scripts/mfn-monitor.mjs`       | CLI-verktyg för polling, WebSocket och sökning        |
| `scripts/mfn-match-watched.mjs` | Matchningsskript: WatchedCompany ↔ MFN                |

### Nästa steg

1. **Skapa `MfnNews`-tabell** i Supabase (migration) med `external_id`, `source`, `title` etc.
2. **Deploya mfn-monitor.mjs** som bakgrundsprocess (Railway worker eller cron)
3. **Koppla till Nyhetskort** — projicera MFN-nyheter in i det enhetliga nyhetsflödet
4. **Implementera Slack-notiser** för bevakade bolag med MFN-matchning
5. **Lägg till kalenderbevakning** — daglig sync av rapportdatum till LoopDesk
