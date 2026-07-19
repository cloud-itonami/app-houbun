/**
 * houbun kotoba — barrel.
 *
 * Per ADR-0052 + ADR-2605203000 Option B Phase E reference impl.
 * Global statute / regulation / treaty full-text corpus.
 *
 * Slice 1: 8 commands across 4 record types (statute / article /
 * treaty / amendmentEvent). Maps to the 4 vendor record lexicons +
 * 4 ingest procedures (the ingest procs ship in slice 2 as
 * orchestration wrappers over these 8 building blocks).
 *
 *   registerStatute + getStatute + listStatutes
 *   registerArticle + getArticle   (content-addressed via blake3_12)
 *   registerTreaty + getTreaty
 *   recordAmendment                 (lineage edge fromArticleDids → toArticleDids)
 *
 * Follow-up slice: ingestEurLex / ingestStatuteJpn / ingestStatuteUsa /
 * ingestTreatyUn (orchestration helpers that wrap external upstream
 * fetches into single idempotent passes).
 */

export * from "./types.js";
export {
  registerStatute,
  getStatute,
  listStatutes,
  registerArticle,
  getArticle,
  listArticles,
  registerTreaty,
  getTreaty,
  recordAmendment,
} from "./corpus.js";
export {
  ingestStatuteJpn,
  ingestStatuteUsa,
  ingestEurLex,
  ingestTreatyUn,
} from "./ingest.js";
