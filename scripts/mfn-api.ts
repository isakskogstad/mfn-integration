/**
 * MFN.se API Reference & Client
 *
 * MFN (Modular Finance News) distributes press releases for Nordic listed companies.
 * API surface reverse-engineered from mfn.se frontend JavaScript.
 *
 * Base URL: https://mfn.se
 * Feed API: https://feed.mfn.se/v1
 * WebSub Hub: https://hub.mfn.se (email subscriptions) / https://feed.mfn.se/v1 (WebSub topic)
 * WebSocket: wss://mfn.se
 *
 * No API key required — all endpoints are public.
 *
 * Data coverage (~2000 entities, Feb 2026):
 *   - Nasdaq Stockholm (XSTO): Full coverage
 *   - First North Stockholm (FNSE): Full coverage
 *   - Spotlight Stock Market (XSAT): Full coverage
 *   - Nordic SME (NSME): Full coverage
 *   - Oslo Börs (XOSL): Partial
 *   - Other Nordic exchanges: Partial
 *   - NOT covered: unlisted companies, foreign-listed Swedish companies (e.g. Oatly/NYSE)
 */

// =============================================================================
// TYPES
// =============================================================================

/** Company entity from MFN search or feed */
export interface MfnCompany {
  entity_id: string;
  slug: string;
  slugs: string[];
  name: string;
  /** ISIN codes, e.g. ["SE0006091997"] */
  isins: string[];
  /** LEI codes */
  leis: string[];
  /** Org numbers, e.g. ["SE:556012-5790"] */
  local_refs: string[];
  /** Ticker symbols, e.g. ["XSTO:VOLV-B"] */
  tickers: string[];
  /** Company logo URL */
  brand_image_url?: string;
  /** Millistream Instrument Reference (for price data) */
  mil_insref?: string;
  /** GICS sector ID */
  sector_id?: number;
  /** GICS industry ID */
  industry_id?: number;
  /** Exchange list ID */
  list_id?: number;
  /** Market ID */
  market_id?: number;
  /** Market MIC code, e.g. "XSTO" */
  market_mic?: string;
  /** Primary market segment ID */
  primary_market_segment_id?: number;
  /** All market segment IDs */
  market_segment_ids?: number[];
  /** Börsdata slug for linking */
  borsdata_slug?: string;
  /** Company address */
  address?: string;
}

/** News item properties */
export interface MfnNewsProperties {
  /** Language: "sv", "en", "no", "fi", "da" */
  lang: string;
  /** News type: "ir" (investor relations) or "pr" (public relations) */
  type?: string;
  /**
   * Content tags:
   *   ":regulatory"              — Regulatory (MAR etc.)
   *   ":regulatory:mar"          — MAR-specific
   *   ":regulatory:listing"      — Listing-related
   *   "sub:report"               — Financial report
   *   "sub:report:annual"        — Annual report
   *   "sub:report:interim"       — Interim report
   *   "sub:report:interim:q1-q4" — Specific quarter
   *   "sub:ca"                   — Corporate action
   *   "sub:ca:ma"                — M&A
   *   "sub:ca:other"             — Other corporate action
   *   "sub:ci"                   — Company info
   *   "sub:ci:insider"           — Insider transaction
   *   "sub:ci:gm:notice"         — General meeting notice
   *   "sub:ci:staff"             — Staff changes
   *   "sub:ci:other"             — Other company info
   *   "ext:nq"                   — Nasdaq exchange
   *   "ext:nq:corporate-action"  — Nasdaq corporate action
   *   "ext:nq:company-announcement" — Nasdaq announcement
   *   "cus:equity-research"      — Equity research
   */
  tags: string[];
  /** Scopes, e.g. ["SE"] */
  scopes?: string[];
}

/** Attachment on a news item */
export interface MfnAttachment {
  file_title: string;
  content_type: string;
  url: string;
  tags: string[];
}

/** News content block */
export interface MfnNewsContent {
  title: string;
  slug: string;
  publish_date: string; // ISO 8601
  preamble?: string;
  html?: string;
  attachments?: MfnAttachment[];
}

/** A single news item from the JSON feed */
export interface MfnNewsItem {
  news_id: string;
  group_id: string;
  url: string;
  author: MfnCompany;
  subjects: MfnCompany[];
  properties: MfnNewsProperties;
  content: MfnNewsContent;
}

/** JSON feed response */
export interface MfnFeedResponse {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  description: string;
  /** URL for next page, null if no more */
  next_url: string | null;
  items: MfnNewsItem[];
}

/** WebSub subscription in the manage list */
export interface MfnSubscription {
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
export interface MfnSubscriptionList {
  email_id: string;
  is_searchable_contact: boolean;
  subscriptions: MfnSubscription[];
  entity_name_lookup: Record<string, string>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MFN_BASE = "https://mfn.se";
const MFN_HUB = "https://hub.mfn.se";
/** Feed API base — used for WebSub topics and per-entity RSS feeds */
const MFN_FEED = "https://feed.mfn.se/v1";
const MFN_WS = "wss://mfn.se";

/**
 * Ticker prefix → exchange name mapping.
 * Tickers in MFN data use the format "PREFIX:SYMBOL" (e.g. "XSTO:VOLV-B").
 * CAPA entries are Capital IQ references, not actual trading venues.
 */
export const MFN_TICKER_PREFIXES: Record<string, string> = {
  XSTO: "Nasdaq Stockholm",
  FNSE: "First North Stockholm",
  XSAT: "Spotlight Stock Market",
  NSME: "Nordic SME",
  XOSL: "Oslo Börs",
  CAPA: "Capital IQ (reference)",
  XLON: "London Stock Exchange",
} as const;

/**
 * Market segment IDs for filter construction.
 * Used in filter string: (a.market_segment_ids@>[ID])
 */
export const MFN_SEGMENTS = {
  // Sweden
  LARGE_CAP_STOCKHOLM: 13,
  MID_CAP_STOCKHOLM: 14,
  SMALL_CAP_STOCKHOLM: 15,
  FIRST_NORTH: 5,
  SPOTLIGHT: 9,
  NGM: 1,
  NGM_PEPMARKET: 45,
  NORDIC_SME_SWEDEN: 44,
  // Nordic
  COPENHAGEN: 13, // same as Large Cap Sthlm in Nordic context
  HELSINKI: 14,
  ICELAND: 15,
  OSLO_BORS: 44,
} as const;

/** All Swedish market segments for the Nordic feed */
export const SWEDISH_SEGMENTS = [13, 14, 15, 5, 9, 1, 45, 44];

// =============================================================================
// COMPANY MATCH TYPES (from pre-computed matching against local DB)
// =============================================================================

/** How a local company was matched to an MFN entity */
export type MfnMatchType = "exact" | "normalized" | "fuzzy";

/** Source table in the local database */
export type MfnMatchSource = "WatchedCompany" | "VCCompany" | "FamilyOffice";

/** Pre-computed mapping between a local company and its MFN entity */
export interface MfnCompanyMatch {
  /** Company name in the local database */
  db_name: string;
  /** Swedish organization number (XXXXXX-XXXX) */
  orgNumber: string;
  /** Which database tables this company appears in */
  sources: MfnMatchSource[];
  /** How the match was determined */
  match_type: MfnMatchType;
  /** Fuzzy match score (only present when match_type is "fuzzy") */
  fuzzy_score?: number;
  /** Company name as it appears in MFN */
  mfn_name: string;
  /** MFN entity UUID */
  mfn_entity_id: string;
  /** URL-friendly slug for MFN feeds */
  mfn_slug: string;
  /** All ticker symbols (e.g. ["XSTO:VOLV-B", "CAPA:VOLVBs"]) */
  mfn_tickers: string[];
  /** ISIN codes */
  mfn_isins: string[];
}

// =============================================================================
// ENTITY CACHE (for org number lookup — org numbers are NOT searchable via API)
// =============================================================================

/**
 * In-memory cache of all MFN entities for fast lookup by org number, entity_id, or slug.
 *
 * The MFN search API does NOT support searching by org number, LEI, entity_id, or slug.
 * The recommended strategy is to fetch all ~2000 entities via an empty query and build
 * a local lookup table, refreshed daily.
 */
export interface MfnEntityCache {
  /** Lookup by Swedish org number (without "SE:" prefix, e.g. "556536-7488") */
  byOrgNumber: Map<string, MfnCompany>;
  /** Lookup by MFN entity UUID */
  byEntityId: Map<string, MfnCompany>;
  /** Lookup by URL slug */
  bySlug: Map<string, MfnCompany>;
  /** Timestamp when the cache was built */
  builtAt: Date;
  /** Total number of entities in the cache */
  totalEntities: number;
}

/**
 * Fetch ALL MFN entities (~2000 companies).
 *
 * This is the only way to build a comprehensive lookup table since the search
 * API does not support org number, LEI, entity_id, or slug as search terms.
 * Should be called once and cached (refresh daily).
 */
export async function fetchAllMfnEntities(): Promise<MfnCompany[]> {
  return searchMfnCompanies("", 2000);
}

/**
 * Build an in-memory cache for fast entity lookup by org number, entity_id, or slug.
 *
 * Usage:
 *   const cache = await buildMfnEntityCache();
 *   const duni = cache.byOrgNumber.get("556536-7488");
 *   const entity = cache.byEntityId.get("81ca67a1-632b-450f-9db7-946963f337d1");
 *   const bySlug = cache.bySlug.get("duni");
 */
export async function buildMfnEntityCache(): Promise<MfnEntityCache> {
  const entities = await fetchAllMfnEntities();
  const byOrgNumber = new Map<string, MfnCompany>();
  const byEntityId = new Map<string, MfnCompany>();
  const bySlug = new Map<string, MfnCompany>();

  for (const entity of entities) {
    byEntityId.set(entity.entity_id, entity);
    bySlug.set(entity.slug, entity);
    for (const ref of entity.local_refs ?? []) {
      if (ref.startsWith("SE:")) {
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

/**
 * Parse a ticker string like "XSTO:VOLV-B" into its components.
 */
export function parseMfnTicker(ticker: string): {
  prefix: string;
  symbol: string;
  exchange: string | null;
} {
  const [prefix, symbol] = ticker.split(":", 2);
  return {
    prefix: prefix ?? "",
    symbol: symbol ?? ticker,
    exchange: MFN_TICKER_PREFIXES[prefix] ?? null,
  };
}

// =============================================================================
// FILTER BUILDER
// =============================================================================

export interface MfnFilterOptions {
  /** Market segment IDs */
  segments?: number[];
  /** Language codes: "sv", "en", "no", "fi", "da" */
  languages?: string[];
  /** Tags to filter by, e.g. [":regulatory", "sub:report"] */
  tags?: string[];
  /** News type: "ir", "pr" */
  types?: string[];
}

/**
 * Build an MFN filter string from options.
 *
 * Filter syntax (reverse-engineered):
 *   (and
 *     (or (a.market_segment_ids@>[13]) (a.market_segment_ids@>[14]))
 *     (or (.properties.lang="sv") (.properties.lang="en"))
 *     (or (.properties.tags@>["sub:report"]))
 *     (or (.properties.type="ir"))
 *   )
 */
export function buildMfnFilter(opts: MfnFilterOptions): string | null {
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

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * GET /all/s/nordic.json — Fetch the Nordic press release feed.
 *
 * Supports pagination (offset), keyword search (query), and filtering.
 * Set compact=true for smaller payloads (omits full HTML body).
 */
export async function fetchMfnFeed(opts: {
  limit?: number;
  offset?: number;
  query?: string;
  filter?: string;
  compact?: boolean;
}): Promise<MfnFeedResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 20));
  if (opts.offset) params.set("offset", String(opts.offset));
  if (opts.query) params.set("query", opts.query);
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.compact !== false) params.set("compact", "true");

  const res = await fetch(`${MFN_BASE}/all/s/nordic.json?${params}`);
  if (!res.ok) throw new Error(`MFN feed error: HTTP ${res.status}`);
  return res.json();
}

/**
 * GET /all/a/{slug}.json — Fetch news for a specific company.
 */
export async function fetchMfnCompanyNews(
  slug: string,
  limit = 20
): Promise<MfnFeedResponse> {
  const res = await fetch(`${MFN_BASE}/all/a/${slug}.json?limit=${limit}`);
  if (!res.ok) throw new Error(`MFN company news error: HTTP ${res.status}`);
  return res.json();
}

/**
 * GET /search/companies — Search for companies by name, ticker, or ISIN.
 *
 * Returns company entities with entity_id, slug, tickers, ISINs, org numbers.
 *
 * Searchable fields:
 *   - Company name (partial matching supported, e.g. "fer" finds Ferroamp)
 *   - Ticker symbol without exchange prefix (e.g. "DUNI")
 *   - Full ISIN code (e.g. "SE0000616716")
 *
 * NOT searchable (use buildMfnEntityCache() instead):
 *   - Organization number (any format)
 *   - LEI codes
 *   - Entity ID (UUID)
 *   - Slug
 *
 * Pass query="" with limit=2000 to fetch ALL entities for local caching.
 */
export async function searchMfnCompanies(
  query: string,
  limit = 10
): Promise<MfnCompany[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const res = await fetch(`${MFN_BASE}/search/companies?${params}`);
  if (!res.ok) throw new Error(`MFN search error: HTTP ${res.status}`);
  return res.json();
}

// =============================================================================
// WEBSUB (Email Subscription) API
// =============================================================================

/**
 * POST hub.mfn.se — Subscribe to email notifications.
 *
 * Creates a WebSub subscription. MFN sends a verification email to the callback.
 * The email contains a verify link that must be clicked to activate.
 *
 * Two hub/topic systems exist:
 *   1. hub.mfn.se — Email subscriptions (smtp:// callback)
 *      Topics: /all/a/{slug}, /all/s/nordic, /all/s/nordic?filter=...
 *   2. feed.mfn.se/v1 — WebSub hub for programmatic subscriptions
 *      Topics: https://feed.mfn.se/v1/feed/{entity_id}
 *
 * Topic formats (for hub.mfn.se):
 *   - Company:  /all/a/{slug}             — Press releases from one company
 *   - Feed:     /all/s/nordic             — All Nordic press releases
 *   - Filtered: /all/s/nordic?filter=...  — Filtered feed (by segment, lang, etc.)
 *   - Query:    /all/s/nordic?query=...   — Keyword-filtered feed
 *
 * @param topic - The topic path (e.g. "/all/a/volvo")
 * @param email - Email address for notifications
 * @param lang  - Language for the verification email ("sv" or "en")
 */
export async function subscribeMfnEmail(
  topic: string,
  email: string,
  lang = "sv"
): Promise<boolean> {
  const res = await fetch(`${MFN_HUB}?lang=${lang}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.topic": topic,
      "hub.callback": `smtp://${email}`,
    }).toString(),
  });
  return res.ok;
}

/**
 * GET hub.mfn.se/verify/{subscriptionId}?hub.mode=subscribe
 *
 * Verify/activate a pending subscription.
 * The subscriptionId comes from the verification email link.
 */
export async function verifyMfnSubscription(
  subscriptionId: string
): Promise<boolean> {
  const res = await fetch(
    `${MFN_HUB}/verify/${subscriptionId}?hub.mode=subscribe`
  );
  return res.ok;
}

/**
 * GET hub.mfn.se/verify/{subscriptionId}?hub.mode=unsubscribe
 *
 * Unsubscribe / deactivate a subscription.
 */
export async function unsubscribeMfn(subscriptionId: string): Promise<boolean> {
  const res = await fetch(
    `${MFN_HUB}/verify/${subscriptionId}?hub.mode=unsubscribe`
  );
  return res.ok;
}

/**
 * GET hub.mfn.se/reactivate/{subscriptionId}
 *
 * Reactivate a previously deactivated subscription.
 */
export async function reactivateMfnSubscription(
  subscriptionId: string
): Promise<boolean> {
  const res = await fetch(`${MFN_HUB}/reactivate/${subscriptionId}`);
  return res.ok;
}

/**
 * GET hub.mfn.se/list?token={jwt}
 *
 * List all subscriptions for the email associated with the JWT token.
 * Token comes from manage-subscription links in MFN emails.
 *
 * JWT payload: { iss: "hub.mfn.se", sub: subscriptionId, jti: email, iat: timestamp }
 */
export async function listMfnSubscriptions(
  token: string
): Promise<MfnSubscriptionList> {
  const res = await fetch(`${MFN_HUB}/list?token=${token}`);
  if (!res.ok) throw new Error(`MFN list error: HTTP ${res.status}`);
  return res.json();
}

/**
 * POST hub.mfn.se/manage/{subscriptionId}
 *
 * Update a subscription's filters (languages, options, subject companies).
 * Requires the subscription to be active and verified.
 *
 * @param subscriptionId - The subscription to update
 * @param opts - Update options
 */
export async function updateMfnSubscription(
  subscriptionId: string,
  opts: {
    entity_id?: string;
    langs?: string[];
    options?: string[];
    subjects?: string[];
  }
): Promise<boolean> {
  const params = new URLSearchParams();
  if (opts.entity_id) params.set("entity_id", opts.entity_id);
  opts.langs?.forEach((l) => params.append("langs", l));
  opts.options?.forEach((o) => params.append("options", o));
  opts.subjects?.forEach((s) => params.append("subjects", s));

  const res = await fetch(`${MFN_HUB}/manage/${subscriptionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.ok;
}

// =============================================================================
// MAIL SUBSCRIPTION (Company-specific email subscriptions)
// =============================================================================

/** Options for company mail subscription */
export interface MfnMailSubscriptionOptions {
  /** News types: "ir" (investor relations), "pr" (public relations), "reports" */
  options: string[];
  /** Language codes: "sv", "en", etc. */
  languages: string[];
  /** Subscriber email address */
  email: string;
  /** Subscriber name (can be empty string) */
  name?: string;
}

/**
 * POST /mail-subscription/{entityId}?mail-lang=sv
 *
 * Subscribe to a specific company's press releases via email.
 * This is the company page subscription mechanism (different from WebSub hub).
 *
 * When authenticated (cookie session), creates the subscription immediately
 * and returns a subscription_id. When unauthenticated, sends a verification email.
 *
 * Use /no-auth variant for programmatic subscriptions without login session.
 *
 * @param entityId - The company's MFN entity_id (UUID)
 * @param opts - Subscription options (news types, languages, email)
 * @param mailLang - Language for verification email ("sv" or "en")
 * @param useNoAuth - Use the /no-auth endpoint (no login required, triggers verification email)
 */
export async function subscribeToCompanyMail(
  entityId: string,
  opts: MfnMailSubscriptionOptions,
  mailLang = "sv",
  useNoAuth = false
): Promise<{ subscription_id?: string; ok: boolean }> {
  const path = useNoAuth
    ? `/mail-subscription/${entityId}/no-auth`
    : `/mail-subscription/${entityId}`;
  const res = await fetch(`${MFN_BASE}${path}?mail-lang=${mailLang}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      options: opts.options,
      languages: opts.languages,
      email: opts.email,
      name: opts.name ?? "",
    }),
  });
  if (!res.ok) return { ok: false };
  try {
    const data = await res.json();
    return { subscription_id: data.subscription_id, ok: true };
  } catch {
    return { ok: res.ok };
  }
}

// =============================================================================
// WEBSOCKET (Real-time Push)
// =============================================================================

/**
 * WebSocket real-time feed.
 *
 * Connect to wss://mfn.se/all/s/nordic for all Nordic press releases.
 * Optional filter: wss://mfn.se/all/s/nordic?filter=...
 *
 * Protocol:
 *   - Server sends HTML fragments for each new press release
 *   - Close code 3000 = server requests fast reconnect
 *   - Use exponential backoff for other close codes (cap at 30s)
 *
 * NTP sync available via: wss://mfn.se/_ntp
 *   - Send empty message, receive { t1, t2 } timestamps
 *
 * Example:
 *   const ws = new WebSocket("wss://mfn.se/all/s/nordic");
 *   ws.on("message", (html) => { ... });
 */
export function getMfnWebSocketUrl(filter?: string): string {
  let url = `${MFN_WS}/all/s/nordic`;
  if (filter) url += `?filter=${encodeURIComponent(filter)}`;
  return url;
}

// =============================================================================
// ALTERNATIVE FEED FORMATS
// =============================================================================

/**
 * MFN provides feeds in multiple formats. All support pagination and filtering.
 *
 * JSON (primary — mfn.se):
 *   GET /all/a/{slug}.json?limit=N&offset=N&compact=true    — Company feed
 *   GET /all/s/nordic.json?limit=N&offset=N&filter=...      — Nordic feed
 *   GET /a/{slug}/{news-slug}.json                          — Single news item
 *
 * JSON (feed.mfn.se — entity_id based):
 *   GET https://feed.mfn.se/v1/feed/{entity_id}             — Company feed by entity UUID
 *
 * RSS 2.0:
 *   GET /all/a/{slug}.rss     — Company RSS feed (48 items default)
 *   GET /all/s/nordic.rss     — Nordic RSS feed
 *   Contains x:language, x:tag, x:scope, x:content (html + text) extensions
 *
 * Atom:
 *   GET /all/a/{slug}.atom    — Company Atom feed
 *   GET /all/s/nordic.atom    — Nordic Atom feed
 *   Contains x:language, x:tag extensions + alternate links to .json and .atom
 *
 * XML:
 *   GET /all/a/{slug}.xml     — Company XML feed
 *   GET /all/s/nordic.xml     — Nordic XML feed
 */

/**
 * Get the feed.mfn.se feed URL for a company by entity_id.
 * This is the WebSub topic URL used for push subscriptions.
 */
export function getMfnEntityFeedUrl(entityId: string): string {
  return `${MFN_FEED}/feed/${entityId}`;
}

/**
 * Get the RSS feed URL for a company by slug.
 */
export function getMfnRssFeedUrl(slug: string): string {
  return `${MFN_BASE}/all/a/${slug}.rss`;
}

/**
 * Get the Atom feed URL for a company by slug.
 */
export function getMfnAtomFeedUrl(slug: string): string {
  return `${MFN_BASE}/all/a/${slug}.atom`;
}

// =============================================================================
// CALENDAR (Financial report dates)
// =============================================================================

/**
 * Calendar event from MFN (report dates, AGMs, dividends, etc.)
 *
 * Types (Swedish labels):
 *   "Kvartalsrapport"         — Quarterly report (with quarter: 2026-Q1)
 *   "Bokslutskommuniké"       — Year-end report (with fiscal year: 2025)
 *   "Årsredovisning"          — Annual report
 *   "Årsstämma"               — Annual General Meeting
 *   "Extra Bolagsstämma"      — Extraordinary General Meeting
 *   "X-dag ordinarie utdelning" — Ex-dividend date (with ticker + amount)
 *   "Split"                   — Stock split (e.g. "CLIME B 10:1")
 */
export interface MfnCalendarEvent {
  date: string; // "2026-10-23"
  time: string | null; // "07:30" or null
  type: string; // "Kvartalsrapport", "Bokslutskommuniké", etc.
  detail: string | null; // "2026-Q3", "CLIME B 0.00 SEK", etc.
  slug: string; // Company slug
  name: string; // Company name
}

/**
 * GET /partials/global-calendar?scope={scope}&filter={filter}
 *
 * Returns HTML with upcoming report dates across all Nordic companies.
 * Must be parsed from HTML (no JSON equivalent available).
 *
 * Scope options: "SE", "nordic", "all", or omit for default.
 * Filter: MFN filter string (same as news feed filter).
 *
 * Response is HTML containing date groups with company entries showing:
 *   - Report date and estimated publish time
 *   - Company name + slug
 *   - Fiscal year
 *
 * The company page (/a/{slug}) also embeds a full calendar table
 * with historical and upcoming report dates in the sidebar.
 */
export async function fetchMfnGlobalCalendar(
  scope = "SE",
  filter?: string
): Promise<string> {
  const params = new URLSearchParams({ scope });
  if (filter) params.set("filter", filter);
  const res = await fetch(`${MFN_BASE}/partials/global-calendar?${params}`);
  if (!res.ok) throw new Error(`MFN calendar error: HTTP ${res.status}`);
  return res.text();
}

// =============================================================================
// STOCK PRICE & LIQUIDITY (embedded in news pages)
// =============================================================================

/**
 * Stock price and liquidity data for a specific press release.
 *
 * This data is embedded in the HTML of each news item page (/a/{slug}/{news-slug}).
 * Shows trading data for the DAY the press release was published.
 *
 * Price data:
 *   - Change percentage (e.g. "+16,12%")
 *   - Open, High, Low, Close (in SEK)
 *
 * Liquidity data:
 *   - Total turnover (e.g. "0,62 MSEK")
 *   - Relative market cap turnover (e.g. "0,56%")
 *   - Number of shares traded (e.g. "183 943")
 *
 * No JSON API available — must be scraped from HTML.
 */
export interface MfnNewsDayTrading {
  /** Price change on the news day, e.g. "+16,12%" */
  priceChange: string;
  open: string;
  high: string;
  low: string;
  close: string;
  /** Total turnover, e.g. "0,62 MSEK" */
  turnover: string;
  /** Relative market cap turnover */
  relMcap: string;
  /** Number of shares traded */
  sharesTraded: string;
}

// =============================================================================
// PR ROOM (Press Room with media collections)
// =============================================================================

/**
 * PR Room — Company press room with curated media collections.
 *
 * Page URL:
 *   GET /pr/{slug}                                      — PR room overview
 *   GET /pr/{slug}?collection={collectionId}            — Specific collection
 *   GET /pr/{slug}?collection={id}&media-item={itemId}  — Specific media item
 *
 * Available when `window.PR_ROOM = true` on the company page.
 * Not all companies have a PR room (many have PR_ROOM = false).
 *
 * Structure:
 *   - Collections: Named groups of media (e.g. "Climeon HeatPower 300", "Climeon Management")
 *   - Each collection has a UUID (collectionId) and contains media items
 *   - Each media item has a UUID (media-item) with title, image, and download links
 *
 * Media items include download buttons with multiple resolutions.
 * The PR room also shows the company logo and recent press releases.
 *
 * Must be parsed from HTML — no JSON API available for PR room.
 */

// =============================================================================
// STORAGE (File hosting)
// =============================================================================

/**
 * storage.mfn.se — File storage for attachments, images, and brand assets.
 * Hosted on Cloudflare CDN with caching.
 *
 * URL patterns:
 *   https://storage.mfn.se/{uuid}/{slug}.pdf                  — PDF attachments (reports, press releases)
 *   https://storage.mfn.se/{uuid}/{slug}.jpeg                  — Image attachments (per-news)
 *   https://storage.mfn.se/a/{company-slug}/{uuid}/{slug}      — Company brand assets (logos, VD-foton, produktbilder)
 *
 * Image resizing (query param):
 *   ?size=w-512    — Small (thumbnail, ~50 KB)
 *   ?size=w-1024   — Medium (~150 KB)
 *   ?size=w-2048   — Large (~340 KB)
 *   (no param)     — Original resolution (~6 MB for photos)
 *
 * Download (query param):
 *   ?download=true                   — Adds Content-Disposition: attachment header
 *   ?size=w-1024&download=true       — Resize + download combined
 *
 * All files are publicly accessible via direct URL. No authentication needed.
 * Files are referenced in:
 *   - JSON feed: content.attachments[].url
 *   - Company page: author.brand_image_url (logo)
 *   - PR room: collection items with download buttons
 *
 * Attachment tags (in JSON feed):
 *   ":primary"            — Primary attachment (e.g. the PDF report)
 *   "archive:report:pdf"  — Archived report PDF
 *   "image:primary"       — Primary image for the news item
 */

// =============================================================================
// AUTHENTICATED API (requires MFN account login)
// =============================================================================

/**
 * These endpoints require an MFN user session (cookie-based auth via
 * Twitter/X login or email login on mfn.se).
 *
 * Login:
 *   POST /authr/email/login?email=...       — Email magic link login
 *   GET  /authr/twitter/login?callback=...   — Twitter/X OAuth login
 *
 * Subscriptions (logged-in user's company watchlist):
 *   GET    /authr/subscriptions/default              — List subscriptions
 *   POST   /authr/subscriptions/default              — Add subscription
 *            Body: { entity_id, name, slug }
 *   DELETE /authr/subscriptions/default/{entity_id}  — Remove subscription
 *
 * Web Push Notifications (requires service worker):
 *   GET  /authr/webpush/test  — Send test push notification
 *
 * These are NOT used in our integration — we use the public WebSub hub instead.
 */

// =============================================================================
// CONTENT EXTRACTION (structured data from press release HTML/text)
// =============================================================================

/**
 * MFN press releases embed structured data in HTML content that can be
 * extracted programmatically. The HTML uses consistent CSS classes and
 * the text follows predictable patterns across companies.
 *
 * HTML STRUCTURE (content.html):
 * ─────────────────────────────────────────────────────────────────────
 * <div class="mfn-preamble">         — Ingress/summary (same as content.preamble)
 * <div class="mfn-body">             — Main article body
 *   <strong class="mfn-heading-1">   — Main section headings
 *   <strong class="mfn-heading-2">   — Sub-section headings
 * <div class="mfn-footer mfn-contacts ...">  — Contact information
 * <div class="mfn-footer mfn-about ...">     — About the company
 * <div class="mfn-footer mfn-regulatory ..."> — Regulatory disclosure (MAR)
 * <div class="mfn-footer mfn-attachment-general"> — PDF attachments
 * <div class="mfn-footer mfn-attachment-image">   — Image attachments
 *
 * CONTACT INFO PATTERNS:
 * ─────────────────────────────────────────────────────────────────────
 * Contact info appears in two locations:
 *
 * 1. Structured footer (best): <div class="mfn-footer mfn-contacts ...">
 *    Contains contact persons with name, title, email, phone.
 *    Example (Egetis):
 *      Nicklas Westerholm, vd
 *      nicklas.westerholm@egetis.com
 *      +46 (0) 733 542 062
 *
 * 2. Inline in body text (common): After a heading like
 *    "För ytterligare information, vänligen kontakta:" or
 *    "FOR MORE INFORMATION, PLEASE CONTACT:"
 *
 * Contact formats observed across companies:
 *   a) "Name, Title\nemail\nphone"        — Most common (Climeon, Egetis)
 *   b) "Name, Title, email, phone"         — Inline on one line (Flat Capital)
 *   c) "Title\nName\nCompany\nphone\nemail" — Reversed order (Nattaro Labs)
 *   d) "Department name\nemail"            — Department only (Hexicon)
 *   e) "Category\nName\nTitle\nphone\nemail" — With category like "Mediakontakt" (Sivers)
 *
 * Common Swedish titles: VD, CFO, CTO, COO, IR-ansvarig, Finansdirektör,
 *   Kommunikationschef, Chef för Investerarrelationer, Head of Investor Relations,
 *   Verkställande direktör, Styrelseordförande
 *
 * Common English titles: CEO, CFO, CTO, COO, Head of IR, VP Investor Relations,
 *   Chief Financial Officer, Communications Director
 *
 * REPORT SECTIONS (content.text, for quarterly/annual reports):
 * ─────────────────────────────────────────────────────────────────────
 * Sections are delimited by bold headings (<strong> in HTML).
 * Common section headings (Swedish):
 *   "Perioden [januari-mars/april-juni/...] YYYY"
 *   "Kassaflödesanalys"
 *   "Väsentliga händelser under kvartalet"
 *   "Väsentliga händelser efter kvartalets utgång"
 *   "Investeringar och avyttringar under kvartalet"
 *   "Övriga händelser"
 *   "Länk till rapporten på hemsidan:"
 *   "VD har ordet" / "VD-kommentar"
 *   "Utsikter" / "Framtidsutsikter"
 *
 * REGULATORY DISCLOSURE:
 * ─────────────────────────────────────────────────────────────────────
 * Found in <div class="mfn-footer mfn-regulatory mfn-regulatory-mar">
 * Contains MAR disclosure with exact publication timestamp:
 *   "Informationen lämnades [...] för offentliggörande den YYYY-MM-DD HH:MM CET"
 *
 * CERTIFIED ADVISER (for First North companies):
 * ─────────────────────────────────────────────────────────────────────
 * Found in text after "Certified Adviser:" heading. Contains adviser name,
 * email, phone. Example: "FNCA Sweden AB, info@fnca.se, +46 8 528 00 399"
 */

/** Extracted contact person from a press release */
export interface MfnContact {
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

/** Extracted sections from a press release */
export interface MfnExtractedContent {
  contacts: MfnContact[];
  aboutCompany: string | null;
  certifiedAdviser: string | null;
  regulatoryDisclosure: string | null;
  sections: { heading: string; text: string }[];
}

/**
 * Extract structured data from a press release's HTML content.
 *
 * Parses contact info, about section, regulatory disclosure,
 * and content sections from the MFN HTML format.
 */
export function extractMfnContent(html: string): MfnExtractedContent {
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
  // Strategy 2: generic mfn-footer with hash containing contact keywords (e.g. Climeon, Hexicon)
  const contactGenericFooter = html.match(
    /<div class="mfn-footer mfn-[a-f0-9]+">[^]*?(?:CONTACT|kontakta|INFORMATION)[^]*?<\/div>/i
  );
  // Strategy 3: bare mfn-footer (no subclass) containing contact keywords (e.g. Sivers)
  const contactBareFooter = html.match(
    /<div class="mfn-footer">\s*(?:<p>)?\s*(?:<span>)*\s*(?:<span>)*\s*(?:<strong>)?\s*(?:Mediakontakt|Företagskontakt|Investor Relations|Pressansvarig|Press\s*contact|Media\s*contact|CONTACT|kontakta|INFORMATION)[\s\S]*?<\/div>/i
  );
  // Strategy 4: inline in body — <strong> element whose text contains "kontakt" or "contact"
  // Handles nested <span> inside <strong> (e.g. Nattaro: <strong><span>kontakta:</span></strong>)
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

    // Track which lines have been consumed to avoid double-parsing
    const consumed = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      if (consumed.has(i)) continue;

      // Pattern A: "Name, Title" or "Name, Title, email, phone" (most common)
      // Skip lines that are too long (likely prose, not contact info)
      const nameTitle =
        lines[i].length <= 200
          ? lines[i].match(/^([A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]{1,50}),\s*(.+?)$/)
          : null;
      if (nameTitle) {
        const name = nameTitle[1].trim();
        let role = nameTitle[2].trim();
        let email: string | null = null;
        let phone: string | null = null;

        // Check if role contains email/phone inline (Flat Capital style)
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

        // Look ahead for email/phone on subsequent lines
        consumed.add(i);
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (!email && isEmail(lines[j])) {
            email = extractEmail(lines[j]);
            consumed.add(j);
          } else if (!phone && isPhone(lines[j])) {
            phone = extractPhone(lines[j]);
            consumed.add(j);
          } else if (/^(?:E-?mail|Phone|Tel):\s*$/i.test(lines[j])) {
            // Bare label like "Email:" on its own line — skip, value is on next line
            continue;
          } else if (
            lines[j].match(/^[A-ZÅÄÖ]/) &&
            !isEmail(lines[j]) &&
            !isPhone(lines[j])
          ) {
            break; // next person
          }
        }

        contacts.push({ name, role: role || null, email, phone });
        continue;
      }

      // Pattern B: Department/category style ("Mediakontakt\nName\nTitle\nphone\nemail")
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
            break; // next department block
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

      // Pattern C: Name on own line followed by Title, phone, email (Nattaro style)
      // "Fredrik Trulsson\nVerkställande direktör, Nattaro Labs AB\n+46-73 517 58 33\nemail"
      if (
        /^[A-ZÅÄÖÉÈÊ][\wéèêåäö\s.-]+$/.test(lines[i]) &&
        !isEmail(lines[i]) &&
        !isPhone(lines[i]) &&
        i + 1 < lines.length
      ) {
        const nextLine = lines[i + 1];
        // Next line should be a title/role (contains known title keywords or company name)
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

      // Pattern D: Standalone name/department line followed directly by email (Hexicon style)
      // "Hexicon's Communications Department\ncommunications@hexicongroup.com"
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
  // Try explicit mfn-about class first, then fall back to any mfn-footer with "Om "/"About " heading
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

  // --- Certified Adviser (from text) ---
  const text = stripHtml(html);
  const caMatch = text.match(
    /Certified Adviser[:\s]*\n(.*?)(?=\n\n|Om |About |$)/is
  );
  const certifiedAdviser = caMatch ? caMatch[1].trim() : null;

  // --- Sections (from headings) ---
  const sections: { heading: string; text: string }[] = [];
  const headingParts = html.split(/<strong class="mfn-heading-[12]">/);
  for (let i = 1; i < headingParts.length; i++) {
    const endTag = headingParts[i].indexOf("</strong>");
    if (endTag === -1) continue;
    const heading = headingParts[i].substring(0, endTag).trim();
    const rest = headingParts[i].substring(endTag);
    // Get text until next heading or footer
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

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get a resized image URL from storage.mfn.se.
 * @param url - Original storage URL
 * @param width - Target width: 512 (small), 1024 (medium), 2048 (large), or undefined for original
 */
export function getMfnImageUrl(url: string, width?: 512 | 1024 | 2048): string {
  if (!width) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}size=w-${width}`;
}

/**
 * Extract Swedish org number from MFN local_refs.
 * "SE:556012-5790" → "556012-5790"
 */
export function extractOrgNumber(localRefs: string[]): string | null {
  const se = localRefs.find((r) => r.startsWith("SE:"));
  return se ? se.replace("SE:", "") : null;
}

/**
 * Match a company against MFN by org number.
 * Searches MFN by name, then verifies org number match via local_refs.
 *
 * NOTE: For bulk matching, prefer buildMfnEntityCache() which fetches all entities
 * once and enables O(1) lookup by org number. This function makes a live API call
 * per invocation and relies on name search (org numbers are not searchable).
 */
export async function matchCompanyToMfn(
  name: string,
  orgNumber: string
): Promise<MfnCompany | null> {
  // Clean name for search
  const clean = name
    .replace(
      /\b(AB|Aktiebolag|Sweden|Holding|Group|International|publ|Private Equity|Ventures|Invest|Capital|Foundation)\b/gi,
      ""
    )
    .replace(/[().]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .trim();

  if (clean.length < 2) return null;

  const orgClean = orgNumber.replace("-", "");
  const results = await searchMfnCompanies(clean, 5);

  for (const r of results) {
    const refs = r.local_refs || [];
    if (
      refs.some((ref) => ref.replace("SE:", "").replace("-", "") === orgClean)
    ) {
      return r;
    }
  }

  return null;
}
