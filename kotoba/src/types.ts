/**
 * houbun kotoba — record types.
 *
 * Per ADR-0052 + ADR-2605203000 Option B (PDS XRPC). Global statute /
 * regulation / treaty full-text corpus. 3-layer DID topology:
 *
 *   did:web:houbun.etzhayyim.com                              — controller
 *   did:web:houbun.etzhayyim.com:{jurisdiction}:{source}      — source path
 *                                                              (e.g. jpn:e-gov)
 *   did:web:houbun.etzhayyim.com:article:{blake3_prefix12}    — content-addressed article
 *
 * Articles are content-addressed via blake hash of
 *   jurisdiction + statuteId + articleNo + amendedAt
 * so each amendment produces a NEW article DID; the AmendmentEvent record
 * captures the lineage edge between versions.
 */

export const HOUBUN_DID_PREFIX = "did:web:houbun.etzhayyim.com:" as const;

export type StatuteType =
  | "law"
  | "regulation"
  | "ordinance"
  | "rule"
  | "by-law"
  | "treaty-domestic";

export type HoubunSource =
  | "e-gov"
  | "govinfo-cfr"
  | "govinfo-usc"
  | "eur-lex"
  | "un-treaty"
  | "other";

// ─── Statute tier ───────────────────────────────────────────────────

export interface StatuteRecord {
  did: string;
  /** ISO 3166-1 alpha-3 or supra-national code (jpn / usa / eu / int). */
  jurisdiction: string;
  /** Source-native identifier (e-Gov lawId, GovInfo packageId, CELEX). */
  statuteId: string;
  title: string;
  /** Title in the original language if different. */
  titleNative?: string;
  statuteType?: StatuteType;
  enactedDate?: string;
  effectiveDate?: string;
  repealedDate?: string;
  source: HoubunSource;
  sourceUrl: string;
  /** e.g. CC-BY-4.0 (e-Gov), public-domain (GovInfo). */
  license?: string;
  language?: string;
  articleCount?: number;
  /** Opaque source-specific metadata as JSON string. */
  props?: string;
  createdAt: string;
}

export interface StatuteView extends StatuteRecord {
  statuteUri: string;
}

export interface RegisterStatuteInput {
  jurisdiction: string;
  statuteId: string;
  title: string;
  titleNative?: string;
  statuteType?: StatuteType;
  enactedDate?: string;
  effectiveDate?: string;
  repealedDate?: string;
  source: HoubunSource;
  sourceUrl: string;
  license?: string;
  language?: string;
  articleCount?: number;
  props?: string;
}

export interface RegisterStatuteOutput {
  status: "registered" | "alreadyExists" | "rejected";
  statuteUri?: string;
  did?: string;
  jurisdiction?: string;
  statuteId?: string;
  error?: string;
}

export interface GetStatuteInput {
  jurisdiction?: string;
  statuteId?: string;
}

export interface GetStatuteOutput {
  statute?: StatuteView;
  error?: string;
}

export interface ListStatutesInput {
  jurisdiction?: string;
  source?: HoubunSource;
  statuteType?: StatuteType;
  language?: string;
  limit?: number;
  cursor?: string;
}

export interface ListStatutesOutput {
  items: StatuteView[];
  cursor?: string;
  total: number;
}

// ─── Article tier (content-addressed) ────────────────────────────────

export interface ArticleRecord {
  did: string;
  /** AT URI of the parent statute record. */
  statuteRef: string;
  /** Article number as printed (e.g. '第九条', '§1001', 'Art. 7'). */
  articleNo: string;
  section?: string;
  title?: string;
  text: string;
  language?: string;
  /** 12-char hex prefix of blake hash. Used as DID suffix. */
  blake3Hash: string;
  /** Effective date of this version. NULL for original enactment. */
  amendedAt?: string;
  sourceUrl?: string;
  /** Opaque source-specific metadata. */
  props?: string;
  createdAt: string;
}

export interface ArticleView extends ArticleRecord {
  articleUri: string;
  /** Alias for blake3Hash for simpler test interface. */
  contentHash?: string;
}

export interface RegisterArticleInput {
  /** jurisdiction + statuteId + articleNo + amendedAt → blake hash. */
  jurisdiction: string;
  statuteId: string;
  articleNo: string;
  statuteRef: string;
  text: string;
  section?: string;
  title?: string;
  language?: string;
  amendedAt?: string;
  sourceUrl?: string;
  props?: string;
}

export interface RegisterArticleOutput {
  status: "registered" | "alreadyExists" | "rejected";
  articleUri?: string;
  did?: string;
  blake3Hash?: string;
  contentHash?: string;
  amendment?: unknown;
  error?: string;
}

export interface GetArticleInput {
  blake3Hash?: string;
}

export interface GetArticleOutput {
  article?: ArticleView;
  error?: string;
}

// ─── Treaty tier ────────────────────────────────────────────────────

export interface TreatyRecord {
  did: string;
  /** Treaty identifier (UN registration number, CELEX, etc.) */
  treatyId: string;
  title: string;
  titleNative?: string;
  parties: string[];
  signedDate?: string;
  effectiveDate?: string;
  registryRef?: string;
  source: HoubunSource;
  sourceUrl: string;
  language?: string;
  props?: string;
  createdAt: string;
}

export interface TreatyView extends TreatyRecord {
  treatyUri: string;
}

export interface RegisterTreatyInput {
  treatyId: string;
  title: string;
  titleNative?: string;
  parties: string[];
  signedDate?: string;
  effectiveDate?: string;
  registryRef?: string;
  source: HoubunSource;
  sourceUrl: string;
  language?: string;
  props?: string;
}

export interface RegisterTreatyOutput {
  status: "registered" | "alreadyExists" | "rejected";
  treatyUri?: string;
  did?: string;
  treatyId?: string;
  error?: string;
}

// ─── Amendment event tier ───────────────────────────────────────────

export interface AmendmentEventRecord {
  /** Composite identifier of the amendment event. */
  amendmentId: string;
  /** Parent statute DID. */
  statuteDid: string;
  /** Pre-amendment article DIDs (lineage anchor). */
  fromArticleDids: string[];
  /** Post-amendment article DIDs. */
  toArticleDids: string[];
  amendedAt: string;
  amendmentBy?: string;
  notes?: string;
  createdAt: string;
}

export interface AmendmentEventView extends AmendmentEventRecord {
  amendmentUri: string;
}

export interface RecordAmendmentInput {
  amendmentId: string;
  statuteDid: string;
  fromArticleDids: string[];
  toArticleDids: string[];
  amendedAt: string;
  amendmentBy?: string;
  notes?: string;
}

export interface RecordAmendmentOutput {
  status: "registered" | "alreadyExists" | "rejected" | "recorded" | "alreadyRecorded";
  amendmentUri?: string;
  amendmentId?: string;
  error?: string;
}

// ─── Slug + hash helpers ────────────────────────────────────────────

export function idSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function sourcePathDid(jurisdiction: string, source: HoubunSource): string {
  return `${HOUBUN_DID_PREFIX}${idSlug(jurisdiction)}:${idSlug(source)}`;
}

export function statuteRkey(jurisdiction: string, statuteId: string): string {
  return `statute-${idSlug(jurisdiction)}-${idSlug(statuteId)}`;
}

export function statuteDid(jurisdiction: string, statuteId: string): string {
  return `${HOUBUN_DID_PREFIX}statute:${idSlug(jurisdiction)}-${idSlug(statuteId)}`;
}

export function articleRkey(blake3Hash: string): string {
  return `article-${blake3Hash}`;
}

export function articleDid(blake3Hash: string): string {
  return `${HOUBUN_DID_PREFIX}article:${blake3Hash}`;
}

export function treatyRkey(treatyId: string): string {
  return `treaty-${idSlug(treatyId)}`;
}

export function treatyDid(treatyId: string): string {
  return `${HOUBUN_DID_PREFIX}treaty:${idSlug(treatyId)}`;
}

export function amendmentRkey(amendmentId: string): string {
  return `amendment-${idSlug(amendmentId)}`;
}

/**
 * blake3_prefix12 — 12-char hex prefix of blake3(jurisdiction|statuteId|articleNo|amendedAt).
 *
 * In practice the LangServer pod computes this with real blake3; this
 * package supplies a deterministic FNV-1a-based stand-in for testing
 * + scaffolding. Callers SHOULD use a real blake3 implementation in
 * production and pass it via the `blake3Hash` field directly when
 * available, falling back to this helper only for scaffold tests.
 */
// ─── Ingest tier (slice 2) ──────────────────────────────────────────

export interface ArticleIngest {
  articleNo: string;
  text: string;
  section?: string;
  title?: string;
  language?: string;
  amendedAt?: string;
  sourceUrl?: string;
  /** Pre-computed blake3 hash from LangServer pod. */
  blake3Hash?: string;
  props?: string;
}

export interface IngestRunRecord {
  did: string;
  runId: string;
  source: "e-gov" | "govinfo-cfr" | "govinfo-usc" | "eur-lex" | "un-treaty";
  jurisdiction: string;
  statuteIds: string[];
  articleCount: number;
  status: "completed" | "partial" | "failed";
  completedAt: string;
  createdAt: string;
}

export interface IngestStatuteJpnInput {
  runId: string;
  statuteId: string;
  title: string;
  titleNative?: string;
  statuteType?: StatuteType;
  enactedDate?: string;
  effectiveDate?: string;
  repealedDate?: string;
  sourceUrl: string;
  articles?: ArticleIngest[];
}

export interface IngestStatuteJpnOutput {
  runId?: string;
  runUri?: string;
  statuteUri?: string;
  statuteDid?: string;
  articleDids?: string[];
  insertedArticles?: number;
  skippedArticles?: number;
  alreadyExists?: boolean;
  error?: string;
}

export interface IngestStatuteUsaInput {
  runId: string;
  statuteId: string;
  title: string;
  statuteType?: StatuteType;
  enactedDate?: string;
  effectiveDate?: string;
  source: "govinfo-cfr" | "govinfo-usc";
  sourceUrl: string;
  articles?: ArticleIngest[];
}

export type IngestStatuteUsaOutput = IngestStatuteJpnOutput;

export interface IngestEurLexInput {
  runId: string;
  /** CELEX number — EU statute identifier. */
  celexNumber: string;
  title: string;
  titleNative?: string;
  statuteType?: StatuteType;
  enactedDate?: string;
  effectiveDate?: string;
  sourceUrl: string;
  license?: string;
  language?: string;
  articles?: ArticleIngest[];
}

export type IngestEurLexOutput = IngestStatuteJpnOutput;

export interface IngestTreatyUnInput {
  runId: string;
  treatyId: string;
  title: string;
  titleNative?: string;
  parties: string[];
  signedDate?: string;
  effectiveDate?: string;
  registryRef?: string;
  sourceUrl: string;
  language?: string;
}

export interface IngestTreatyUnOutput {
  runId?: string;
  runUri?: string;
  treatyUri?: string;
  treatyDid?: string;
  alreadyExists?: boolean;
  error?: string;
}

export function blake3Prefix12Fallback(
  jurisdiction: string,
  statuteId: string,
  articleNo: string,
  amendedAt: string | undefined
): string {
  const input = `${jurisdiction}|${statuteId}|${articleNo}|${amendedAt ?? ""}`;
  // FNV-1a 64-bit, taking 12 hex chars (48 bits) — a stand-in until
  // the pod-side blake3 hash is wired in.
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0").slice(0, 12);
}
