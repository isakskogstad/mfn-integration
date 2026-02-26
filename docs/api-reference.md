# MFN.se API-referens

Komplett teknisk referens for MFN (Modular Finance News) — Nordens ledande plattform for distribution av pressmeddelanden fran noterade bolag.

> **Senast uppdaterad:** 2026-02-26
> **API-typ:** Publikt REST + WebSocket (reverse-engineered fran mfn.se frontend)
> **Autentisering:** Ingen API-nyckel kravs — samtliga endpoints ar offentliga

---

## Innehallsforteckning

1. [Oversikt](#1-oversikt)
2. [Base URLs](#2-base-urls)
3. [Bolagssökning (Company Search)](#3-bolagssökning-company-search)
4. [Nyhetsflode (News Feed)](#4-nyhetsflöde-news-feed)
5. [Filter DSL](#5-filter-dsl)
6. [Realtidsuppdateringar (Real-time)](#6-realtidsuppdateringar-real-time)
7. [Kalender (Calendar)](#7-kalender-calendar)
8. [Lagring (Storage CDN)](#8-lagring-storage-cdn)
9. [Pressrum (PR Room)](#9-pressrum-pr-room)
10. [Aktiekursdata (Stock Price)](#10-aktiekursdata-stock-price--embedded)
11. [Autentiserad API](#11-autentiserad-api-authenticated)
12. [Ticker-prefix](#12-ticker-prefix)
13. [Sokbegransningar](#13-sökbegränsningar)

---

## 1. Oversikt

MFN (Modular Finance News) distribuerar pressmeddelanden for nordiska noterade bolag. Plattformen aggregerar regulatorisk och icke-regulatorisk kommunikation fran bolag listade pa nordiska borser och gor dem tillgangliga via JSON-feeds, WebSocket, RSS/Atom, och WebSub.

### Tacking

- **~2000 bolag** (entities) indexerade per feb 2026
- Full tackning: Nasdaq Stockholm (XSTO), First North Stockholm (FNSE), Spotlight Stock Market (XSAT), Nordic SME (NSME)
- Partiell tackning: Oslo Bors (XOSL), ovriga nordiska borser (Kopenhamn, Helsingfors, Island)
- **INTE tackta:** Onoterade bolag, utlandsnoterade svenska bolag (t.ex. Oatly/NYSE, Spotify/NYSE)

### Nyckelegenskaper

- Alla endpoints ar publika — ingen API-nyckel, OAuth, eller registrering kravs
- JSON Feed-formatet (liknande JSON Feed v1.1) anvands for nyhetsfloden
- Realtidsuppdateringar via WebSocket (HTML-fragment) eller JSON-polling
- Varje bolag har ett unikt `entity_id` (UUID) och en URL-slug
- Organisationsnummer lagras i `local_refs` med formatet `"SE:XXXXXX-XXXX"`

---

## 2. Base URLs

| Doman                    | Syfte                                            | Protokoll |
| ------------------------ | ------------------------------------------------ | --------- |
| `https://mfn.se`         | Huvudwebbplats, JSON-feeds, bolagssok, kalender  | HTTPS     |
| `https://feed.mfn.se/v1` | WebSub-hub och entity-baserade feeds             | HTTPS     |
| `https://hub.mfn.se`     | E-postprenumerationer (WebSub med smtp-callback) | HTTPS     |
| `https://storage.mfn.se` | Fil- och bild-CDN (Cloudflare)                   | HTTPS     |
| `wss://mfn.se`           | WebSocket realtidsflode                          | WSS       |

### DNS och infrastruktur

- Alla domaner kors bakom Cloudflare CDN
- `storage.mfn.se` har aggressiv caching (lampligt for logotyper och bilagor)
- WebSocket-anslutningen gar till samma host som huvuddomanen (`mfn.se`)

---

## 3. Bolagssökning (Company Search)

### Endpoint

```
GET https://mfn.se/search/companies?limit={n}&query={term}
```

### Parametrar

| Parameter | Typ     | Standard | Beskrivning                                               |
| --------- | ------- | -------- | --------------------------------------------------------- |
| `query`   | string  | `""`     | Sokterm (namn, ticker, ISIN). Tom strang returnerar alla. |
| `limit`   | integer | `10`     | Max antal resultat (max observerat: 2000)                 |

### Sokbara falt

| Falt                            | Exempel                    | Fungerar? |
| ------------------------------- | -------------------------- | --------- |
| Bolagsnamn (partiell matchning) | `"fer"` hittar Ferroamp    | Ja        |
| Ticker (utan borsprefix)        | `"DUNI"` hittar Duni Group | Ja        |
| ISIN                            | `"SE0000616716"`           | Ja        |
| Organisationsnummer             | `"556536-7488"`            | **NEJ**   |
| LEI                             | `"549300..." `             | **NEJ**   |
| Entity ID (UUID)                | `"81ca67a1-..."`           | **NEJ**   |
| Slug                            | `"duni"`                   | **NEJ**   |

### Hamta ALLA bolag

For att bygga en lokal cache over samtliga ~2000 bolag, skicka en tom query med hogt limit:

```bash
curl -s "https://mfn.se/search/companies?limit=2000&query=" | jq length
# => ~2000
```

Detta ar den enda metoden att fa en komplett lista. Rekommenderas att koras en gang per dygn och cachas lokalt.

### Svarsformat

Svaret ar en JSON-array av bolagsobjekt:

```json
[
  {
    "entity_id": "81ca67a1-632b-450f-9db7-946963f337d1",
    "slug": "duni",
    "slugs": ["duni", "duni-group"],
    "name": "Duni Group",
    "isins": ["SE0000616716"],
    "leis": ["549300J7UWCFKN68GT48"],
    "local_refs": ["SE:556536-7488"],
    "tickers": ["XSTO:DUNI"],
    "brand_image_url": "https://storage.mfn.se/a/duni/abcd1234/duni-logo.png",
    "mil_insref": "52207",
    "sector_id": 25,
    "industry_id": 252010,
    "list_id": 2,
    "market_id": 3,
    "market_mic": "XSTO",
    "primary_market_segment_id": 15,
    "market_segment_ids": [15],
    "borsdata_slug": "duni-group"
  }
]
```

### Faltbeskrivning

| Falt                        | Typ           | Beskrivning                                               |
| --------------------------- | ------------- | --------------------------------------------------------- |
| `entity_id`                 | string (UUID) | Unikt ID — anvands for feed.mfn.se och WebSub             |
| `slug`                      | string        | Primär URL-slug (`/a/{slug}`)                             |
| `slugs`                     | string[]      | Alla slug-varianter (inkl. historiska)                    |
| `name`                      | string        | Bolagsnamn                                                |
| `isins`                     | string[]      | ISIN-koder, t.ex. `["SE0006091997"]`                      |
| `leis`                      | string[]      | LEI-koder                                                 |
| `local_refs`                | string[]      | Organisationsnummer med landsprefix: `"SE:556012-5790"`   |
| `tickers`                   | string[]      | Ticker-symboler: `"PREFIX:SYMBOL"`, t.ex. `"XSTO:VOLV-B"` |
| `brand_image_url`           | string?       | URL till bolagets logotyp pa storage.mfn.se               |
| `mil_insref`                | string?       | Millistream Instrument Reference (for kursdata)           |
| `sector_id`                 | number?       | GICS-sektor                                               |
| `industry_id`               | number?       | GICS-bransch                                              |
| `list_id`                   | number?       | Borslista                                                 |
| `market_id`                 | number?       | Marknad                                                   |
| `market_mic`                | string?       | Market MIC-kod, t.ex. `"XSTO"`                            |
| `primary_market_segment_id` | number?       | Primärt marknadssegment                                   |
| `market_segment_ids`        | number[]?     | Alla marknadssegment                                      |

### Exempel

```bash
# Sok pa bolagsnamn
curl -s "https://mfn.se/search/companies?limit=5&query=volvo" | jq '.[].name'

# Sok pa ticker
curl -s "https://mfn.se/search/companies?limit=5&query=DUNI" | jq '.[0]'

# Sok pa ISIN
curl -s "https://mfn.se/search/companies?limit=1&query=SE0000616716" | jq '.[0].name'

# Hamta alla bolag for lokal caching
curl -s "https://mfn.se/search/companies?limit=2000&query=" > mfn-entities.json
```

---

## 4. Nyhetsflöde (News Feed)

MFN tillhandahaller nyhetsfloden i flera format. JSON ar det primara formatet for integration.

### 4.1 Nordiskt nyhetsflode

```
GET https://mfn.se/all/s/nordic.json
```

Returnerar pressmeddelanden fran samtliga nordiska bolag, sorterade i omvand kronologisk ordning.

#### Parametrar

| Parameter | Typ      | Standard | Beskrivning                                                 |
| --------- | -------- | -------- | ----------------------------------------------------------- |
| `limit`   | integer  | `20`     | Antal nyheter (max ej dokumenterat, 100+ fungerar)          |
| `offset`  | integer  | `0`      | Paginering — hoppa over N nyheter                           |
| `query`   | string   | —        | Fritext-sok i titel och ingress                             |
| `filter`  | string   | —        | Filter DSL-strang (se sektion 5)                            |
| `compact` | boolean  | `false`  | `true` utelämnar fullstandig HTML-kropp (mindre payload)    |
| `after`   | ISO 8601 | —        | Inkrementella uppdateringar (bara nyheter efter tidstampel) |

#### Exempel

```bash
# Senaste 20 pressmeddelanden
curl -s "https://mfn.se/all/s/nordic.json?limit=20&compact=true" | jq '.items | length'

# Fritext-sok
curl -s "https://mfn.se/all/s/nordic.json?query=nyemission&limit=10" | jq '.items[].content.title'

# Paginering
curl -s "https://mfn.se/all/s/nordic.json?limit=20&offset=40&compact=true"

# Inkrementell polling (bara nya sedan en viss tidpunkt)
curl -s "https://mfn.se/all/s/nordic.json?after=2026-02-26T10:00:00Z&compact=true"
```

### 4.2 Bolagsspecifikt nyhetsflode

```
GET https://mfn.se/all/a/{slug}.json
```

Alla pressmeddelanden fran ett specifikt bolag, identifierat med slug.

```bash
# Volvos pressmeddelanden
curl -s "https://mfn.se/all/a/volvo.json?limit=10&compact=true" | jq '.items[].content.title'

# Ferroamps pressmeddelanden
curl -s "https://mfn.se/all/a/ferroamp.json?limit=5" | jq '.items[0]'
```

### 4.3 Enskilt pressmeddelande

```
GET https://mfn.se/a/{slug}/{news-slug}.json
```

Full data for ett enda pressmeddelande, inklusive komplett HTML-kropp.

```bash
curl -s "https://mfn.se/a/volvo/volvo-car-ab-publ---q4-report-2025-a5b3c1.json" | jq '.content.title'
```

### 4.4 Entity-baserat flode (feed.mfn.se)

```
GET https://feed.mfn.se/v1/feed/{entity_id}
```

Alternativt flode baserat pa entity UUID (istallet for slug). Denna URL fungerar ocksa som WebSub-topic.

```bash
curl -s "https://feed.mfn.se/v1/feed/81ca67a1-632b-450f-9db7-946963f337d1" | jq '.items | length'
```

### 4.5 Alternativa format

Samtliga feed-URLer stodjer multipla format — byt filandelse:

| Format  | Andelse | Exempel             |
| ------- | ------- | ------------------- |
| JSON    | `.json` | `/all/a/volvo.json` |
| RSS 2.0 | `.rss`  | `/all/a/volvo.rss`  |
| Atom    | `.atom` | `/all/a/volvo.atom` |
| XML     | `.xml`  | `/all/a/volvo.xml`  |

RSS-feeds innehaller tillags-element: `x:language`, `x:tag`, `x:scope`, `x:content` (HTML + text).

### 4.6 Svarsstruktur (JSON)

```json
{
  "version": "https://jsonfeed.org/version/1",
  "title": "Nordic Press Releases",
  "home_page_url": "https://mfn.se",
  "feed_url": "https://mfn.se/all/s/nordic.json",
  "description": "...",
  "next_url": "https://mfn.se/all/s/nordic.json?limit=20&offset=20",
  "items": [
    {
      "news_id": "abc123-def456",
      "group_id": "group-uuid",
      "url": "https://mfn.se/a/volvo/volvo-q4-2025-abc123",
      "author": {
        "entity_id": "entity-uuid",
        "slug": "volvo",
        "name": "Volvo Car AB (publ)",
        "tickers": ["XSTO:VOLCAR-B"],
        "isins": ["SE0016844831"],
        "local_refs": ["SE:556810-8988"],
        "brand_image_url": "https://storage.mfn.se/a/volvo/logo.png"
      },
      "subjects": [],
      "properties": {
        "lang": "sv",
        "type": "ir",
        "tags": [":regulatory", "sub:report:interim:q4"],
        "scopes": ["SE"]
      },
      "content": {
        "title": "Volvo Car AB (publ) — Bokslutskommunike 2025",
        "slug": "volvo-q4-2025-abc123",
        "publish_date": "2026-02-12T07:00:00+01:00",
        "preamble": "Volvos nettoomsattning okade med 12% under fjarde kvartalet...",
        "html": "<div class=\"mfn-preamble\">...</div><div class=\"mfn-body\">...</div>",
        "attachments": [
          {
            "file_title": "Volvo Cars Q4 2025 Report.pdf",
            "content_type": "application/pdf",
            "url": "https://storage.mfn.se/uuid/volvo-q4-2025.pdf",
            "tags": [":primary", "archive:report:pdf"]
          },
          {
            "file_title": "Press image",
            "content_type": "image/jpeg",
            "url": "https://storage.mfn.se/uuid/press-image.jpeg",
            "tags": ["image:primary"]
          }
        ]
      }
    }
  ]
}
```

### Nyhets-falt i detalj

| Falt                   | Typ      | Beskrivning                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `news_id`              | string   | Unikt ID for pressmeddelandet                                    |
| `group_id`             | string   | Grupp-ID (kopplar ihop sprakversioner av samma nyhet)            |
| `url`                  | string   | Fullstandig URL till nyheten pa mfn.se                           |
| `author`               | object   | Bolaget som publicerat (MfnCompany-objekt)                       |
| `subjects`             | object[] | Relaterade bolag (t.ex. vid M&A)                                 |
| `properties.lang`      | string   | Sprak: `"sv"`, `"en"`, `"no"`, `"fi"`, `"da"`                    |
| `properties.type`      | string   | Typ: `"ir"` (investor relations) eller `"pr"` (public relations) |
| `properties.tags`      | string[] | Innehallstaggar (se Filter DSL)                                  |
| `properties.scopes`    | string[] | Geografiskt omfang, t.ex. `["SE"]`                               |
| `content.title`        | string   | Rubrik                                                           |
| `content.slug`         | string   | URL-slug for nyheten                                             |
| `content.publish_date` | string   | ISO 8601 publikationsdatum                                       |
| `content.preamble`     | string?  | Ingress/sammanfattning                                           |
| `content.html`         | string?  | Full HTML-kropp (utelamnas vid `compact=true`)                   |
| `content.attachments`  | object[] | Bilagor (PDF, bilder)                                            |

---

## 5. Filter DSL

MFN anvander en egenutvecklad filter-syntax (Domain Specific Language) for att filtrera nyhetsfloden. Filtersträngen skickas som `filter`-parameter pa feed-URLer och WebSocket.

### Syntax

```
(and
  (or (villkor1) (villkor2))
  (or (villkor3))
)
```

- `and` — alla grupper maste matcha
- `or` — minst ett villkor i gruppen maste matcha
- Villkor har ingen mellanslag mellan `or`/`and` och parenteserna

### Komplett exempel

```
(and(or(.properties.tags@>[":regulatory"]))(or(.properties.lang="sv")))
```

Matchat: Regulatoriska nyheter pa svenska.

### Tillgangliga filterfalt

| Falt            | Syntax                       | Beskrivning                     |
| --------------- | ---------------------------- | ------------------------------- |
| Marknadssegment | `a.market_segment_ids@>[ID]` | Bolag pa en specifik borslista  |
| Sprak           | `.properties.lang="sv"`      | Pressmeddelanden pa visst sprak |
| Tagg            | `.properties.tags@>["tagg"]` | Nyheter med viss tagg           |
| Nyhetstyp       | `.properties.type="ir"`      | IR eller PR                     |

### Marknadssegment-ID

| ID   | Borslista                  |
| ---- | -------------------------- |
| `13` | Nasdaq Stockholm Large Cap |
| `14` | Nasdaq Stockholm Mid Cap   |
| `15` | Nasdaq Stockholm Small Cap |
| `5`  | First North Stockholm      |
| `9`  | Spotlight Stock Market     |
| `1`  | NGM Main Regulated         |
| `45` | NGM PepMarket              |
| `44` | Nordic SME                 |

### Tag-taxonomi

| Tagg                          | Beskrivning                               |
| ----------------------------- | ----------------------------------------- |
| `:regulatory`                 | Regulatoriskt pressmeddelande (MAR, etc.) |
| `:regulatory:mar`             | MAR-specifik insiderinformation           |
| `:regulatory:listing`         | Listrelaterad regulatorisk info           |
| `sub:report`                  | Finansiell rapport (generell)             |
| `sub:report:annual`           | Arsredovisning                            |
| `sub:report:interim`          | Delarsrapport (generell)                  |
| `sub:report:interim:q1`       | Q1-rapport                                |
| `sub:report:interim:q2`       | Q2-rapport / halvarsrapport               |
| `sub:report:interim:q3`       | Q3-rapport                                |
| `sub:report:interim:q4`       | Q4-rapport / bokslutskommunike            |
| `sub:ca`                      | Corporate action (generell)               |
| `sub:ca:ma`                   | M&A (forvarv, fusioner)                   |
| `sub:ca:other`                | Ovrig corporate action                    |
| `sub:ci`                      | Bolagsinformation (generell)              |
| `sub:ci:insider`              | Insidertransaktion                        |
| `sub:ci:gm:notice`            | Kallelse till bolagsstamma                |
| `sub:ci:staff`                | Personalforandringar (t.ex. ny VD)        |
| `sub:ci:other`                | Ovrig bolagsinformation                   |
| `ext:nq`                      | Nasdaq-borsmeddelande                     |
| `ext:nq:corporate-action`     | Nasdaq corporate action                   |
| `ext:nq:company-announcement` | Nasdaq bolagsmeddelande                   |
| `cus:equity-research`         | Aktieanalys (equity research)             |

### Filterbyggare — exempel

```bash
# Bara regulatoriska pressmeddelanden
FILTER='(and(or(.properties.tags@>[":regulatory"])))'

# Regulatoriska + svenska
FILTER='(and(or(.properties.tags@>[":regulatory"]))(or(.properties.lang="sv")))'

# Large Cap + Mid Cap Stockholm
FILTER='(and(or(a.market_segment_ids@>[13])(a.market_segment_ids@>[14])))'

# Delarsrapporter fran Small Cap pa svenska
FILTER='(and(or(a.market_segment_ids@>[15]))(or(.properties.tags@>["sub:report:interim"]))(or(.properties.lang="sv")))'

# Anvand filtret
curl -s "https://mfn.se/all/s/nordic.json?limit=10&compact=true&filter=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILTER'))")"
```

### TypeScript filterbyggare

```typescript
function buildMfnFilter(opts: {
  segments?: number[];
  languages?: string[];
  tags?: string[];
  types?: string[];
}): string | null {
  const clauses: string[] = [];

  if (opts.segments?.length) {
    const parts = opts.segments
      .map((id) => `(a.market_segment_ids@>[${id}])`)
      .join("");
    clauses.push(`(or${parts})`);
  }
  if (opts.languages?.length) {
    const parts = opts.languages
      .map((l) => `(.properties.lang="${l}")`)
      .join("");
    clauses.push(`(or${parts})`);
  }
  if (opts.tags?.length) {
    const parts = opts.tags.map((t) => `(.properties.tags@>["${t}"])`).join("");
    clauses.push(`(or${parts})`);
  }
  if (opts.types?.length) {
    const parts = opts.types.map((t) => `(.properties.type="${t}")`).join("");
    clauses.push(`(or${parts})`);
  }

  if (clauses.length === 0) return null;
  return `(and${clauses.join("")})`;
}
```

---

## 6. Realtidsuppdateringar (Real-time)

MFN erbjuder fyra metoder for realtidsuppdateringar, med olika lampliga anvandningsfall.

### 6.1 WebSocket

Den snabbaste metoden — server pushar HTML-fragment for varje nytt pressmeddelande.

#### Anslutning

```
wss://mfn.se/all/s/nordic
```

Med filter:

```
wss://mfn.se/all/s/nordic?filter=(and(or(.properties.lang="sv")))
```

#### Protokoll

- **Server skickar:** HTML-fragment (inte JSON) for varje nytt pressmeddelande
- **Close code 3000:** Servern ber om snabb ateranslutning (connect omedelbart)
- **Ovriga close codes:** Anvand exponentiell backoff, max 30 sekunders vantetid
- **Ingen heartbeat/ping:** Anslutningen kan droppa tyst — implementera alltid reconnect-logik

#### NTP-synkronisering

```
wss://mfn.se/_ntp
```

Skicka ett tomt meddelande, fa tillbaka `{ t1, t2 }` timestamps for tidssynkning.

#### Exempelkod (Node.js)

```javascript
import WebSocket from "ws";

function connectMfn(filter) {
  let reconnectDelay = 1000;
  const path = filter
    ? `/all/s/nordic?filter=${encodeURIComponent(filter)}`
    : "/all/s/nordic";

  function connect() {
    const ws = new WebSocket(`wss://mfn.se${path}`);

    ws.on("open", () => {
      console.log("Connected to MFN WebSocket");
      reconnectDelay = 1000; // Reset backoff on successful connect
    });

    ws.on("message", (data) => {
      const html = data.toString();
      // Parse HTML fragment to extract news data
      const titleMatch = html.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</);
      if (titleMatch) {
        console.log(`New: ${titleMatch[1].trim()}`);
      }
    });

    ws.on("close", (code) => {
      if (code === 3000) {
        // Fast reconnect requested by server
        connect();
        return;
      }
      console.log(
        `Disconnected (${code}), reconnecting in ${reconnectDelay}ms`
      );
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000); // Cap at 30s
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error: ${err.message}`);
    });
  }

  connect();
}
```

### 6.2 JSON Polling

Best for serversidan — anvand `after`-parametern for inkrementella uppdateringar.

```bash
# Forsta anropet — hamta senaste
curl -s "https://mfn.se/all/s/nordic.json?limit=20&compact=true" > initial.json

# Efterfoljande anrop — bara nya sedan senaste
LAST_DATE=$(jq -r '.items[0].content.publish_date' initial.json)
curl -s "https://mfn.se/all/s/nordic.json?after=${LAST_DATE}&compact=true"
```

#### Rekommendationer

- **Polling-intervall:** 30-60 sekunder
- **Dedup:** Anvand `news_id` for att undvika dubbletter
- **Rate limiting:** Ingen officiell dokumentation, men var forsiktig — hog frekvens kan resultera i blockering

### 6.3 WebSub (Programmatisk)

Standardiserad push via WebSub-protokollet (RFC 7572). Lamplig for server-till-server-integrationer.

#### Hub

```
https://feed.mfn.se/v1
```

#### Topics

```
https://feed.mfn.se/v1/feed/{entity_id}
```

Varje bolag har en unik topic-URL baserad pa dess `entity_id`.

#### Prenumerationsflode

1. **Subscribe:** POST till hubben med `hub.mode=subscribe`, `hub.topic`, `hub.callback`
2. **Verify:** Hubben skickar GET till din callback-URL med challenge
3. **Receive:** Hubben POSTar nya pressmeddelanden till din callback

### 6.4 E-postprenumerationer (hub.mfn.se)

En specialiserad WebSub-hub som skickar pressmeddelanden via e-post istallet for HTTP.

#### Prenumerera

```bash
# Skapa e-postprenumeration
curl -X POST "https://hub.mfn.se?lang=sv" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "hub.mode=subscribe&hub.topic=/all/a/volvo&hub.callback=smtp://user@example.com"
```

#### Topic-format

| Typ         | Format                     | Exempel                          |
| ----------- | -------------------------- | -------------------------------- |
| Bolag       | `/all/a/{slug}`            | `/all/a/volvo`                   |
| Hela flödet | `/all/s/nordic`            | `/all/s/nordic`                  |
| Filtrerat   | `/all/s/nordic?filter=...` | `/all/s/nordic?filter=(and...)`  |
| Nyckelord   | `/all/s/nordic?query=...`  | `/all/s/nordic?query=nyemission` |

#### Verifiera prenumeration

```bash
# Aktivera (lanken kommer i verifierings-mejlet)
curl "https://hub.mfn.se/verify/{subscriptionId}?hub.mode=subscribe"
```

#### Avsluta prenumeration

```bash
curl "https://hub.mfn.se/verify/{subscriptionId}?hub.mode=unsubscribe"
```

#### Ateraktivera

```bash
curl "https://hub.mfn.se/reactivate/{subscriptionId}"
```

#### Lista alla prenumerationer

```bash
# JWT-token fas fran "manage"-lanken i MFN-mejl
curl -s "https://hub.mfn.se/list?token={jwt}" | jq '.subscriptions'
```

JWT-payload: `{ iss: "hub.mfn.se", sub: subscriptionId, jti: email, iat: timestamp }`

#### Uppdatera filter

```bash
curl -X POST "https://hub.mfn.se/manage/{subscriptionId}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "entity_id={uuid}&langs=sv&langs=en&options=ir&options=pr"
```

### 6.5 Bolagsspecifik e-postprenumeration

Separat endpoint for bolagssidans prenumerationsfunktion (skiljer sig fran WebSub-hubben).

#### Prenumerera

```bash
# Med autentisering (cookie-session fran mfn.se)
curl -X POST "https://mfn.se/mail-subscription/{entityId}?mail-lang=sv" \
  -H "Content-Type: application/json" \
  -d '{
    "options": ["ir", "pr"],
    "languages": ["sv", "en"],
    "email": "user@example.com",
    "name": "Johan Svensson"
  }'
```

#### Programmatisk (utan inloggning)

```bash
# /no-auth-varianten kraver ingen session, men triggar verifierings-mejl
curl -X POST "https://mfn.se/mail-subscription/{entityId}/no-auth?mail-lang=sv" \
  -H "Content-Type: application/json" \
  -d '{
    "options": ["ir", "pr"],
    "languages": ["sv"],
    "email": "monitor@example.com",
    "name": ""
  }'
```

#### Options-varden

| Option      | Beskrivning                    |
| ----------- | ------------------------------ |
| `"ir"`      | Investor Relations-meddelanden |
| `"pr"`      | Public Relations-meddelanden   |
| `"reports"` | Finansiella rapporter          |

---

## 7. Kalender (Calendar)

MFN tillhandahaller en global kalender over finansiella handelser — rapportdatum, bolagsstammor, utdelningar, m.m.

### Endpoint

```
GET https://mfn.se/partials/global-calendar?scope={scope}&filter={filter}
```

**OBS:** Returnerar HTML, inte JSON. Maste parsas.

### Parametrar

| Parameter | Typ    | Standard | Beskrivning                                           |
| --------- | ------ | -------- | ----------------------------------------------------- |
| `scope`   | string | —        | `"SE"` (Sverige), `"nordic"` (Norden), `"all"` (alla) |
| `filter`  | string | —        | MFN filter DSL-strang (se sektion 5)                  |

### Exempel

```bash
# Svenska bolag
curl -s "https://mfn.se/partials/global-calendar?scope=SE"

# Nordiska Large Cap-bolag
curl -s "https://mfn.se/partials/global-calendar?scope=nordic&filter=$(python3 -c "import urllib.parse; print(urllib.parse.quote('(and(or(a.market_segment_ids@>[13])))'))")"
```

### Handelsetyper

| Typ (svenskt namn)            | Beskrivning                                                               |
| ----------------------------- | ------------------------------------------------------------------------- |
| **Kvartalsrapport**           | Q1/Q2/Q3-rapport (med kvartal: `2026-Q1`)                                 |
| **Bokslutskommunike**         | Arsresultatrapport (med rakenskapsar: `2025`)                             |
| **Arsredovisning**            | Annual report                                                             |
| **Arsstamma**                 | Ordinarie bolagsstamma (AGM)                                              |
| **Extra Bolagsstamma**        | Extraordinar bolagsstamma (EGM)                                           |
| **X-dag ordinarie utdelning** | Ex-datum for utdelning (med ticker + belopp, t.ex. `"VOLCAR B 2.50 SEK"`) |
| **Split**                     | Aktiesplit (t.ex. `"CLIME B 10:1"`)                                       |

### Parsning

Kalenderdata ar strukturerad i HTML med datumgrupper och bolagsposter. Varje post innehaller:

- Datum och beraknad publiceringstid
- Bolagsnamn + slug (for lankning)
- Handelseveranstalan (t.ex. kvartal, belopp)

Bolagssidorna (`/a/{slug}`) har ocksa en inbaddad kalendertabell i sidofanget med historiska och kommande rapportdatum.

---

## 8. Lagring (Storage CDN)

MFN:s fillagring for bilagor, bilder och varumärkesmaterial.

### Base URL

```
https://storage.mfn.se
```

### URL-monster

| Monster                           | Beskrivning                        | Exempel                          |
| --------------------------------- | ---------------------------------- | -------------------------------- |
| `/{uuid}/{slug}.pdf`              | PDF-bilagor (rapporter, PM)        | `/abc123/volvo-q4-2025.pdf`      |
| `/{uuid}/{slug}.jpeg`             | Bilder (nyhetsbilder)              | `/abc123/press-image.jpeg`       |
| `/a/{company-slug}/{uuid}/{slug}` | Varumärkesmaterial (loggor, foton) | `/a/volvo/abc123/volvo-logo.png` |

### Bildstorlek (resize)

Lagg till `?size=w-{bredd}` for att fa en skalad version:

| Parameter           | Storlek           | Typisk filstorlek |
| ------------------- | ----------------- | ----------------- |
| `?size=w-512`       | Liten (thumbnail) | ~50 KB            |
| `?size=w-1024`      | Medium            | ~150 KB           |
| `?size=w-2048`      | Stor              | ~340 KB           |
| _(ingen parameter)_ | Original          | ~6 MB (foton)     |

### Nedladdning

```bash
# Visa i webblasare (default)
curl -O "https://storage.mfn.se/abc123/rapport.pdf"

# Forcera nedladdning (Content-Disposition: attachment)
curl -O "https://storage.mfn.se/abc123/rapport.pdf?download=true"

# Resize + nedladdning
curl -O "https://storage.mfn.se/abc123/bild.jpeg?size=w-1024&download=true"
```

### Bilage-taggar (i JSON-feed)

Varje bilaga i `content.attachments` har en `tags`-array:

| Tagg                   | Beskrivning                           |
| ---------------------- | ------------------------------------- |
| `":primary"`           | Primar bilaga (t.ex. harsrapport-PDF) |
| `"archive:report:pdf"` | Arkiverad rapport-PDF                 |
| `"image:primary"`      | Primar nyhetsbild                     |

### Exempel — extrahera PDF-bilagor

```bash
# Hamta senaste rapporten fran ett bolag och ladda ner PDF-bilagan
curl -s "https://mfn.se/all/a/volvo.json?limit=1" | \
  jq -r '.items[0].content.attachments[] | select(.tags | index(":primary")) | .url'
```

---

## 9. Pressrum (PR Room)

Vissa bolag har ett dedikerat pressrum pa MFN med kurerade mediakollektioner.

### URL

```
https://mfn.se/pr/{slug}
```

### Query-parametrar

| Parameter           | Beskrivning                    |
| ------------------- | ------------------------------ |
| `collection={uuid}` | Visa en specifik kollektion    |
| `media-item={uuid}` | Visa ett specifikt mediaobjekt |

### Tillganglighet

Pressrummet ar tillgangligt nar `window.PR_ROOM = true` pa bolagets sida. Inte alla bolag har ett pressrum.

### Innehall

- **Kollektioner:** Namngivna grupper av media (t.ex. "Produktbilder", "Ledningsgruppen", "Logotyper")
- Varje kollektion har ett UUID och innehaller mediaobjekt
- Varje mediaobjekt har titel, bild, och nedladdningslänkar i flera upplösningar

### Begränsningar

- **Ingen JSON API** — maste parsas fran HTML
- Nedladdningsknappar med multipla upplösningar finns inbaddade i HTML
- Pressrummet visar ocksa bolagets logotyp och senaste pressmeddelanden

---

## 10. Aktiekursdata (Stock Price — embedded)

MFN visar handelsdata for den dag ett pressmeddelande publicerades, inbaddat i nyhetsartikelns HTML.

### Datapunkter

**Kurs:**
| Falt | Exempel |
|---|---|
| Kursförändring | `+16,12%` |
| Oppningskurs | `12,45 SEK` |
| Hogsta | `13,20 SEK` |
| Lagsta | `12,10 SEK` |
| Stangningskurs | `13,05 SEK` |

**Likviditet:**
| Falt | Exempel |
|---|---|
| Omsattning | `0,62 MSEK` |
| Relativ borsvardeomsattning | `0,56%` |
| Antal omsatta aktier | `183 943` |

### Begränsningar

- **Ingen JSON API** — data maste scrapas fran HTML pa nyhetsartikelns sida
- Visar enbart data for publiceringsdagen (inte historik)
- Kravningen identifieras via `mil_insref` pa bolagsobjektet
- Inte alla nyheter har kursdata (t.ex. om bolaget handlas pa en bors som ej stods)

---

## 11. Autentiserad API (Authenticated)

Dessa endpoints kraver en MFN-session (cookie-baserad auth via Twitter/X eller e-postinloggning).

### Inloggning

```bash
# E-post magic link
POST /authr/email/login?email=user@example.com

# Twitter/X OAuth
GET /authr/twitter/login?callback=https://mfn.se/...
```

### Prenumerationer (inloggad anvandare)

```bash
# Lista prenumerationer
GET /authr/subscriptions/default

# Lagg till prenumeration
POST /authr/subscriptions/default
Content-Type: application/json
{ "entity_id": "uuid", "name": "Volvo", "slug": "volvo" }

# Ta bort prenumeration
DELETE /authr/subscriptions/default/{entity_id}
```

### Web Push

```bash
# Skicka test-push
GET /authr/webpush/test
```

### Notering

Dessa endpoints anvands **inte** i var integration. Vi anvander istallet det publika WebSub-hubet och JSON-polling.

---

## 12. Ticker-prefix

MFN anvander formatet `PREFIX:SYMBOL` for tickersymboler (t.ex. `"XSTO:VOLV-B"`).

| Prefix | Bors                   | Notering                                        |
| ------ | ---------------------- | ----------------------------------------------- |
| `XSTO` | Nasdaq Stockholm       | Huvudlistan (Large/Mid/Small Cap)               |
| `FNSE` | First North Stockholm  | Nasdaq First North Growth Market                |
| `XSAT` | Spotlight Stock Market | Tidigare AktieTorget                            |
| `NSME` | Nordic SME             | Nordisk SME-marknad                             |
| `XOSL` | Oslo Bors              | Norska borsen                                   |
| `CAPA` | Capital IQ (referens)  | **Inte handelsplats** — S&P Capital IQ-referens |
| `XLON` | London Stock Exchange  | Londons bors                                    |

### Parsning av ticker

```typescript
function parseTicker(ticker: string): {
  prefix: string;
  symbol: string;
  exchange: string | null;
} {
  const [prefix, symbol] = ticker.split(":", 2);
  const exchanges: Record<string, string> = {
    XSTO: "Nasdaq Stockholm",
    FNSE: "First North Stockholm",
    XSAT: "Spotlight Stock Market",
    NSME: "Nordic SME",
    XOSL: "Oslo Börs",
    CAPA: "Capital IQ (reference)",
    XLON: "London Stock Exchange",
  };
  return {
    prefix: prefix ?? "",
    symbol: symbol ?? ticker,
    exchange: exchanges[prefix] ?? null,
  };
}
```

### Vanliga fall

```
XSTO:VOLV-B    → Volvo B-aktie, Nasdaq Stockholm
FNSE:CLIME     → Climeon, First North
XSAT:NATTA     → Nattaro Labs, Spotlight
CAPA:VOLVBs    → Volvo B, Capital IQ-referens (ej handel)
```

---

## 13. Sökbegränsningar

### Vad som INTE fungerar som sokterm

Folande falt ar **inte sokbara** via `GET /search/companies?query=`:

| Falt                                     | Exempel                  | Varfor                                                                 |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| **Organisationsnummer**                  | `556536-7488`            | Ej indexerat i sokfunktionen                                           |
| **Organisationsnummer med prefix**       | `SE:556536-7488`         | Ej indexerat                                                           |
| **Organisationsnummer utan bindestreck** | `5565367488`             | Ej indexerat                                                           |
| **LEI-kod**                              | `549300J7UWCFKN68GT48`   | Ej indexerat                                                           |
| **Entity ID (UUID)**                     | `81ca67a1-632b-450f-...` | Ej indexerat                                                           |
| **Slug**                                 | `duni`                   | Ej indexerat (kan i vissa fall ge resultat om slug matchar bolagsnamn) |

### Workaround: Lokal entity-cache

Eftersom sok-APIet inte stodjer organisationsnummer (det vanligaste identifieringssattet for svenska bolag), rekommenderas att bygga en lokal cache:

```bash
# Steg 1: Hamta alla ~2000 entiteter (en gang per dygn)
curl -s "https://mfn.se/search/companies?limit=2000&query=" > mfn-all-entities.json

# Steg 2: Bygg lokal lookup-tabell
```

```typescript
// TypeScript-implementation
interface MfnEntityCache {
  byOrgNumber: Map<string, MfnCompany>;
  byEntityId: Map<string, MfnCompany>;
  bySlug: Map<string, MfnCompany>;
  builtAt: Date;
  totalEntities: number;
}

async function buildMfnEntityCache(): Promise<MfnEntityCache> {
  const res = await fetch("https://mfn.se/search/companies?limit=2000&query=");
  const entities: MfnCompany[] = await res.json();

  const byOrgNumber = new Map<string, MfnCompany>();
  const byEntityId = new Map<string, MfnCompany>();
  const bySlug = new Map<string, MfnCompany>();

  for (const entity of entities) {
    byEntityId.set(entity.entity_id, entity);
    bySlug.set(entity.slug, entity);
    for (const ref of entity.local_refs ?? []) {
      if (ref.startsWith("SE:")) {
        // "SE:556536-7488" → "556536-7488"
        byOrgNumber.set(ref.slice(3), entity);
      }
    }
  }

  return {
    byOrgNumber,
    byEntityId,
    bySlug,
    builtAt: new Date(),
    totalEntities: entities.length,
  };
}

// Anvandning:
const cache = await buildMfnEntityCache();
const duni = cache.byOrgNumber.get("556536-7488"); // → MfnCompany
const byId = cache.byEntityId.get("81ca67a1-..."); // → MfnCompany
const bySlug = cache.bySlug.get("duni"); // → MfnCompany
```

### Matchning mot intern databas via namnsokning

Nar entity-cache inte ar tillganglig, kan man matcha med namnbaserad sokning + orgummer-verifiering:

```typescript
async function matchCompanyToMfn(
  name: string,
  orgNumber: string
): Promise<MfnCompany | null> {
  // Rensa bolagsnamnet — ta bort AB, Holding, etc.
  const clean = name
    .replace(
      /\b(AB|Aktiebolag|Sweden|Holding|Group|International|publ)\b/gi,
      ""
    )
    .replace(/[().]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3) // Max 3 ord for att undvika false negatives
    .join(" ");

  if (clean.length < 2) return null;

  const results = await searchMfnCompanies(clean, 5);
  const orgClean = orgNumber.replace("-", "");

  // Verifiera via organisationsnummer i local_refs
  for (const r of results) {
    if (
      r.local_refs?.some(
        (ref) => ref.replace("SE:", "").replace("-", "") === orgClean
      )
    ) {
      return r;
    }
  }

  return null;
}
```

### Ovriga begransningar

- **Rate limiting:** Ingen dokumenterad gransen, men hog frekvens (>1 req/s under lang tid) kan leda till temporar blockering
- **Kalender-API:** Returnerar enbart HTML — ingen JSON-variant finns
- **Pressrum:** Returnerar enbart HTML — ingen JSON-variant finns
- **Kursdata:** Inbaddad i HTML pa nyhetsartikelns sida — ingen dedicerad JSON-endpoint
- **WebSocket-format:** Server skickar HTML-fragment, inte JSON — kravver HTML-parsning for dataextraktion
- **Filtrering pa bolagssidor:** Filter-DSL fungerar bara pa det nordiska flodet (`/all/s/nordic`), inte pa bolagsspecifika floden (`/all/a/{slug}`)

---

## Appendix A: Komplett TypeScript-typning

```typescript
/** Company entity from MFN search or feed */
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
  list_id?: number;
  market_id?: number;
  market_mic?: string;
  primary_market_segment_id?: number;
  market_segment_ids?: number[];
}

/** News item properties */
interface MfnNewsProperties {
  lang: string;
  type?: string;
  tags: string[];
  scopes?: string[];
}

/** Attachment on a news item */
interface MfnAttachment {
  file_title: string;
  content_type: string;
  url: string;
  tags: string[];
}

/** News content block */
interface MfnNewsContent {
  title: string;
  slug: string;
  publish_date: string;
  preamble?: string;
  html?: string;
  attachments?: MfnAttachment[];
}

/** A single news item */
interface MfnNewsItem {
  news_id: string;
  group_id: string;
  url: string;
  author: MfnCompany;
  subjects: MfnCompany[];
  properties: MfnNewsProperties;
  content: MfnNewsContent;
}

/** JSON feed response */
interface MfnFeedResponse {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  next_url: string | null;
  items: MfnNewsItem[];
}

/** E-mail subscription */
interface MfnSubscription {
  subscription_id: string;
  verified: boolean;
  active: boolean;
  is_mail_group: boolean;
  company_specific: boolean;
  name: string;
  entity_id: string | null;
  filter: string;
  brand_image_url?: string;
  has_basic_filter: boolean;
  entity_languages: string[] | null;
  entity_options: string[] | null;
  entity_subject_ids: string[] | null;
  matcher: {
    author?: { entity_id?: string; slugs?: string[] };
    source?: string;
    properties?: Record<string, unknown>;
  };
}

/** Response from GET hub.mfn.se/list */
interface MfnSubscriptionList {
  email_id: string;
  is_searchable_contact: boolean;
  subscriptions: MfnSubscription[];
  entity_name_lookup: Record<string, string>;
}

/** Calendar event */
interface MfnCalendarEvent {
  date: string;
  time: string | null;
  type: string;
  detail: string | null;
  slug: string;
  name: string;
}
```

---

## Appendix B: HTML-struktur i pressmeddelanden

MFN-pressmeddelanden foljer en konsekvent HTML-struktur som gor det mojligt att extrahera strukturerad data:

```html
<!-- Ingress -->
<div class="mfn-preamble">Sammanfattning av pressmeddelandet...</div>

<!-- Kropp -->
<div class="mfn-body">
  <strong class="mfn-heading-1">Huvudrubrik</strong>
  <p>Brodtext...</p>
  <strong class="mfn-heading-2">Underrubrik</strong>
  <p>Mer text...</p>
</div>

<!-- Kontaktinformation -->
<div class="mfn-footer mfn-contacts ...">
  <p>
    <strong>For ytterligare information:</strong><br />
    Nicklas Westerholm, vd<br />
    nicklas.westerholm@example.com<br />
    +46 733 542 062
  </p>
</div>

<!-- Om bolaget -->
<div class="mfn-footer mfn-about ...">
  <p>
    <strong>Om Exempelbolaget AB</strong><br />
    Exempelbolaget ar en ledande...
  </p>
</div>

<!-- Regulatorisk information (MAR) -->
<div class="mfn-footer mfn-regulatory mfn-regulatory-mar">
  <p>Informationen lamnades for offentligorande den 2026-02-12 07:00 CET.</p>
</div>

<!-- PDF-bilagor -->
<div class="mfn-footer mfn-attachment-general">
  <a href="https://storage.mfn.se/...">Rapport Q4 2025.pdf</a>
</div>

<!-- Bildbilagor -->
<div class="mfn-footer mfn-attachment-image">
  <img src="https://storage.mfn.se/...?size=w-1024" />
</div>
```

### Certified Adviser (First North-bolag)

Bolag listade pa First North har en "Certified Adviser"-sektion:

```
Certified Adviser: FNCA Sweden AB, info@fnca.se, +46 8 528 00 399
```

---

## Appendix C: Snabbreferens — vanliga curl-kommandon

```bash
# Alla bolag (for lokal cache)
curl -s "https://mfn.se/search/companies?limit=2000&query=" | jq length

# Sok bolag pa namn
curl -s "https://mfn.se/search/companies?limit=5&query=volvo"

# Senaste 50 pressmeddelanden (kompakt)
curl -s "https://mfn.se/all/s/nordic.json?limit=50&compact=true"

# Regulatoriska nyheter pa svenska
curl -s 'https://mfn.se/all/s/nordic.json?limit=20&compact=true&filter=(and(or(.properties.tags@>[":regulatory"]))(or(.properties.lang="sv")))'

# Nyheter fran ett bolag
curl -s "https://mfn.se/all/a/volvo.json?limit=10&compact=true"

# Inkrementell polling
curl -s "https://mfn.se/all/s/nordic.json?after=2026-02-26T08:00:00Z&compact=true"

# Entity-feed via UUID
curl -s "https://feed.mfn.se/v1/feed/81ca67a1-632b-450f-9db7-946963f337d1"

# RSS-feed
curl -s "https://mfn.se/all/a/volvo.rss"

# Kalender
curl -s "https://mfn.se/partials/global-calendar?scope=SE"

# Bildstorlek
curl -O "https://storage.mfn.se/abc123/bild.jpeg?size=w-1024"
```
