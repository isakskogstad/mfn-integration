# MFN.se Integration — Komplett kartläggning

## Mappstruktur

```
mfn-integration/
├── README.md                      ← Du är här
├── docs/
│   ├── api-reference.md           — Komplett API-referens
│   ├── content-extraction.md      — HTML-extraktion och kontaktparsning
│   └── integration-guide.md       — Praktisk integrationsguide
├── data/
│   ├── mfn-matches.json           — 62 matchade bolag (DB ↔ MFN)
│   ├── matches-summary.md         — Sammanfattning av matchningar
│   └── mfn-entity-cache.json      — Genereras av fetch-entity-cache.ts
├── scripts/
│   ├── mfn-api.ts                 — Komplett API-klient (TypeScript)
│   ├── mfn-monitor.mjs            — Realtidsövervakning (WebSocket + polling)
│   ├── mfn-match-watched.mjs      — Matchar bevakade bolag mot MFN
│   ├── fetch-entity-cache.ts      — Hämtar alla entiteter → cache
│   ├── monitor-feed.ts            — Enkel nyhetsbevakning via polling
│   ├── extract-contacts.ts        — Extraherar kontakter från pressmeddelanden
│   ├── download-attachments.ts    — Laddar ner PDF-bilagor
│   └── lookup-company.ts          — Slår upp bolag via namn/ticker/ISIN/orgnr
```

## Snabbstart

### 1. Matcha bevakade bolag mot MFN

```bash
node scripts/mfn-match-watched.mjs
```

Scriptet hämtar alla bevakade bolag från Supabase och matchar dem mot MFN:s entitetslista. Resultatet sparas i `data/mfn-matches.json`.

### 2. Starta realtidsövervakning

```bash
node scripts/mfn-monitor.mjs
```

Övervakar nya pressmeddelanden i realtid via WebSocket och JSON-polling. Skickar Slack-notiser för matchade bolag.

### 3. Använda API-klienten

`scripts/mfn-api.ts` innehåller en komplett TypeScript-klient för MFN:s Feed API med stöd för:

- Sökning av nyheter per bolag, typ och tidsintervall
- Entitetsuppslag (namn, ticker, ISIN, organisationsnummer)
- Hämtning av fullständiga pressmeddelanden med HTML-innehåll
- Nedladdning av bilagor (PDF, bilder)

## Sammanfattning

- MFN.se distribuerar pressmeddelanden för ~2000 nordiska bolag
- Alla API:er är öppna utan autentisering
- 62 bolag i vår databas har matchats mot MFN
- Realtidsbevakning via JSON polling (rekommenderat), WebSocket, eller WebSub
- Komplett kontaktextraktion med 4 strategier och 4 parsningsmönster
- Storage CDN med bildstorlekar och PDF-nedladdning

## Viktiga URLer

| Tjänst      | URL                       |
| ----------- | ------------------------- |
| Huvudsida   | https://mfn.se            |
| Feed API    | https://feed.mfn.se/v1    |
| WebSub Hub  | https://hub.mfn.se        |
| Storage CDN | https://storage.mfn.se    |
| WebSocket   | wss://mfn.se/all/s/nordic |
