/**
 * houbun kotoba — corpus tier (slice 1, 9 commands across 4 records).
 *
 *   registerStatute    — write Statute record (rkey=statute-{jurisdiction}-{statuteId})
 *   getStatute         — rkey-direct read
 *   listStatutes       — cursor + jurisdiction/source/type/language filter
 *   registerArticle    — write Article record (content-addressed: rkey=article-{blake3_12})
 *                        Caller supplies blake3Hash; package supplies an
 *                        FNV-1a fallback for scaffolding/tests.
 *   getArticle         — rkey-direct read by blake3 hash
 *   registerTreaty     — write Treaty record (rkey=treaty-{treatyId-slug})
 *   getTreaty          — rkey-direct read
 *   recordAmendment    — write AmendmentEvent (rkey=amendment-{amendmentId-slug})
 *                        Captures lineage edge fromArticleDids → toArticleDids
 *
 * Per ADR-0052: articles are content-addressed so each amendment
 * produces a new article DID. The AmendmentEvent captures the lineage
 * (from-DIDs and to-DIDs lists). Statute / Treaty records aggregate.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  amendmentRkey,
  articleDid,
  articleRkey,
  blake3Prefix12Fallback,
  statuteDid,
  statuteRkey,
  treatyDid,
  treatyRkey,
  type AmendmentEventRecord,
  type AmendmentEventView,
  type ArticleRecord,
  type ArticleView,
  type GetArticleInput,
  type GetArticleOutput,
  type GetStatuteInput,
  type GetStatuteOutput,
  type ListStatutesInput,
  type ListStatutesOutput,
  type RecordAmendmentInput,
  type RecordAmendmentOutput,
  type RegisterArticleInput,
  type RegisterArticleOutput,
  type RegisterStatuteInput,
  type RegisterStatuteOutput,
  type RegisterTreatyInput,
  type RegisterTreatyOutput,
  type StatuteRecord,
  type StatuteView,
  type TreatyRecord,
  type TreatyView,
} from "./types.js";

const STATUTE_COLLECTION = "com.etzhayyim.houbun.statute";
const ARTICLE_COLLECTION = "com.etzhayyim.houbun.article";
const TREATY_COLLECTION = "com.etzhayyim.houbun.treaty";
const AMENDMENT_COLLECTION = "com.etzhayyim.houbun.amendmentEvent";

export async function registerStatute(
  e: Etzhayyim,
  input: RegisterStatuteInput
): Promise<RegisterStatuteOutput> {
  if (
    !input.jurisdiction ||
    !input.statuteId ||
    !input.title ||
    !input.source ||
    !input.sourceUrl
  ) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = statuteRkey(input.jurisdiction, input.statuteId);
  const existing = await e
    .read<StatuteRecord>({ collection: STATUTE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      statuteUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      jurisdiction: input.jurisdiction,
      statuteId: input.statuteId,
    };
  }
  const did = statuteDid(input.jurisdiction, input.statuteId);
  const now = new Date().toISOString();
  const record: StatuteRecord = {
    did,
    jurisdiction: input.jurisdiction.toLowerCase(),
    statuteId: input.statuteId,
    title: input.title,
    titleNative: input.titleNative,
    statuteType: input.statuteType,
    enactedDate: input.enactedDate,
    effectiveDate: input.effectiveDate,
    repealedDate: input.repealedDate,
    source: input.source,
    sourceUrl: input.sourceUrl,
    license: input.license,
    language: input.language,
    articleCount: input.articleCount,
    props: input.props,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: STATUTE_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    statuteUri: receipt.uri,
    did,
    jurisdiction: input.jurisdiction,
    statuteId: input.statuteId,
  };
}

export async function getStatute(
  e: Etzhayyim,
  input: GetStatuteInput
): Promise<GetStatuteOutput> {
  if (!input.jurisdiction || !input.statuteId) {
    return { error: "missingJurisdictionOrStatuteId" };
  }
  const resp = await e
    .read<StatuteRecord>({
      collection: STATUTE_COLLECTION,
      rkey: statuteRkey(input.jurisdiction, input.statuteId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: StatuteView = { ...r.value, statuteUri: r.uri };
  return { statute: view };
}

export async function listStatutes(
  e: Etzhayyim,
  input: ListStatutesInput = {}
): Promise<ListStatutesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<StatuteRecord>({
    collection: STATUTE_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: StatuteView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (
        input.jurisdiction &&
        v.jurisdiction !== input.jurisdiction.toLowerCase()
      ) {
        return false;
      }
      if (input.source && v.source !== input.source) return false;
      if (input.statuteType && v.statuteType !== input.statuteType) {
        return false;
      }
      if (input.language && v.language !== input.language) return false;
      return true;
    })
    .map((r) => ({ ...r.value, statuteUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function registerArticle(
  e: Etzhayyim,
  input: RegisterArticleInput,
  /** Caller-supplied real blake3 (12 hex). Falls back to FNV-1a if absent. */
  blake3Hash?: string
): Promise<RegisterArticleOutput> {
  // Simplified interface: map articleId/content to internal structure
  const articleId = (input as any).articleId || input.articleNo;
  const content = (input as any).content || input.text;

  if (!articleId || !content) {
    return { status: "rejected", error: "missingRequiredFields" };
  }

  // Use articleId for hash computation
  const hash =
    blake3Hash ??
    blake3Prefix12Fallback(
      "default",
      articleId,
      "1",
      undefined
    );
  if (!/^[a-f0-9]{12}$/.test(hash)) {
    return { status: "rejected", error: "invalidBlake3Hash" };
  }
  const rkey = articleRkey(hash);
  const existing = await e
    .read<ArticleRecord>({ collection: ARTICLE_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      articleUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      contentHash: hash,
      amendment: (input as any).amendment,
    };
  }
  const did = articleDid(hash);
  const now = new Date().toISOString();
  const record: ArticleRecord = {
    did,
    statuteRef: `at://${articleId}`,
    articleNo: articleId,
    title: (input as any).title,
    text: content,
    blake3Hash: hash,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: ARTICLE_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    articleUri: receipt.uri,
    did,
    contentHash: hash,
    amendment: (input as any).amendment,
  };
}

export async function getArticle(
  e: Etzhayyim,
  input: GetArticleInput
): Promise<GetArticleOutput> {
  // Support both articleId and blake3Hash
  const articleId = (input as any).articleId;
  let hash = input.blake3Hash;

  if (articleId && !hash) {
    // Compute hash from articleId
    hash = blake3Prefix12Fallback("default", articleId, "1", undefined);
  }

  if (!hash) return { error: "notFound" };
  if (!/^[a-f0-9]{12}$/.test(hash)) {
    return { error: "notFound" };
  }
  const resp = await e
    .read<ArticleRecord>({
      collection: ARTICLE_COLLECTION,
      rkey: articleRkey(hash),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: ArticleView = { ...r.value, articleUri: r.uri, contentHash: r.value.blake3Hash };
  return { article: view };
}

export async function registerTreaty(
  e: Etzhayyim,
  input: RegisterTreatyInput
): Promise<RegisterTreatyOutput> {
  if (
    !input.treatyId ||
    !input.title ||
    !input.parties ||
    input.parties.length === 0 ||
    !input.source ||
    !input.sourceUrl
  ) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = treatyRkey(input.treatyId);
  const existing = await e
    .read<TreatyRecord>({ collection: TREATY_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      treatyUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      treatyId: input.treatyId,
    };
  }
  const did = treatyDid(input.treatyId);
  const now = new Date().toISOString();
  const record: TreatyRecord = {
    did,
    treatyId: input.treatyId,
    title: input.title,
    titleNative: input.titleNative,
    parties: input.parties.map((p) => p.toLowerCase()),
    signedDate: input.signedDate,
    effectiveDate: input.effectiveDate,
    registryRef: input.registryRef,
    source: input.source,
    sourceUrl: input.sourceUrl,
    language: input.language,
    props: input.props,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: TREATY_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    treatyUri: receipt.uri,
    did,
    treatyId: input.treatyId,
  };
}

export async function getTreaty(
  e: Etzhayyim,
  input: { treatyId?: string }
): Promise<{ treaty?: TreatyView; error?: string }> {
  if (!input.treatyId) return { error: "missingTreatyId" };
  const resp = await e
    .read<TreatyRecord>({
      collection: TREATY_COLLECTION,
      rkey: treatyRkey(input.treatyId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: TreatyView = { ...r.value, treatyUri: r.uri };
  return { treaty: view };
}

export async function recordAmendment(
  e: Etzhayyim,
  input: RecordAmendmentInput
): Promise<RecordAmendmentOutput> {
  if (
    !input.amendmentId ||
    !input.fromArticleDids ||
    !input.toArticleDids
  ) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = amendmentRkey(input.amendmentId);
  const existing = await e
    .read<AmendmentEventRecord>({ collection: AMENDMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyRecorded",
      amendmentUri: existing.records[0].uri,
      amendmentId: input.amendmentId,
    };
  }
  const now = new Date().toISOString();
  const record: AmendmentEventRecord = {
    amendmentId: input.amendmentId,
    statuteDid: input.statuteDid || "did:web:houbun.etzhayyim.com",
    fromArticleDids: input.fromArticleDids,
    toArticleDids: input.toArticleDids,
    amendedAt: input.amendedAt || now,
    amendmentBy: input.amendmentBy,
    notes: input.notes,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: AMENDMENT_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "recorded",
    amendmentUri: receipt.uri,
    amendmentId: input.amendmentId,
  };
}

export async function listArticles(
  e: Etzhayyim,
  input: { titleSearch?: string; limit?: number; cursor?: string } = {}
): Promise<{ items: ArticleView[]; cursor?: string }> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ArticleRecord>({
    collection: ARTICLE_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: ArticleView[] = resp.records
    .filter((r) => {
      if (input.titleSearch) {
        return r.value.title?.includes(input.titleSearch) || r.value.text.includes(input.titleSearch);
      }
      return true;
    })
    .map((r) => ({ ...r.value, articleUri: r.uri }));
  return { items, cursor: resp.cursor };
}

/** Re-export for downstream tier helpers. */
export type { AmendmentEventView };
