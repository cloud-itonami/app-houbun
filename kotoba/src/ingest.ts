/**
 * houbun kotoba — ingest tier (slice 2, +4 → 12/12 canonical complete).
 *
 *   ingestStatuteJpn   — JPN e-Gov: persist 1 Statute + N Article records
 *   ingestStatuteUsa   — USA GovInfo (CFR or USC): persist 1 Statute + N Articles
 *   ingestEurLex       — EU EUR-Lex: persist 1 Statute (regulation) + N Articles
 *   ingestTreatyUn     — UN Treaty Collection: persist 1 Treaty record
 *
 * All 4 are orchestration wrappers over slice 1's building blocks
 * (registerStatute / registerArticle / registerTreaty). They take an
 * already-parsed payload (from the LangServer pod that fetched and
 * normalized the upstream source) and persist it via PDS in one
 * idempotent pass.
 *
 * A CollectRun record per ingest call provides provenance + retry
 * idempotency. rkey=ingestrun-{runId-slug}.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  registerArticle,
  registerStatute,
  registerTreaty,
} from "./corpus.js";
import {
  HOUBUN_DID_PREFIX,
  idSlug,
  type ArticleIngest,
  type IngestEurLexInput,
  type IngestEurLexOutput,
  type IngestRunRecord,
  type IngestStatuteJpnInput,
  type IngestStatuteJpnOutput,
  type IngestStatuteUsaInput,
  type IngestStatuteUsaOutput,
  type IngestTreatyUnInput,
  type IngestTreatyUnOutput,
} from "./types.js";

const INGEST_RUN_COLLECTION = "com.etzhayyim.houbun.ingestRun";

function ingestRunRkey(runId: string): string {
  return `ingestrun-${idSlug(runId)}`;
}

function ingestRunDid(runId: string): string {
  return `${HOUBUN_DID_PREFIX}ingestrun:${idSlug(runId)}`;
}

async function writeIngestRun(
  e: Etzhayyim,
  runId: string,
  source: IngestRunRecord["source"],
  jurisdiction: string,
  statuteIds: string[],
  articleCount: number,
  status: IngestRunRecord["status"]
) {
  const rkey = ingestRunRkey(runId);
  const existing = await e
    .read<IngestRunRecord>({ collection: INGEST_RUN_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { runUri: existing.records[0].uri, alreadyExists: true };
  }
  const record: IngestRunRecord = {
    did: ingestRunDid(runId),
    runId,
    source,
    jurisdiction: jurisdiction.toLowerCase(),
    statuteIds,
    articleCount,
    status,
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: INGEST_RUN_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { runUri: receipt.uri, alreadyExists: false };
}

async function ingestStatuteWithArticles(
  e: Etzhayyim,
  args: {
    jurisdiction: string;
    statuteId: string;
    title: string;
    titleNative?: string;
    statuteType?: "law" | "regulation" | "ordinance" | "rule" | "by-law" | "treaty-domestic";
    enactedDate?: string;
    effectiveDate?: string;
    repealedDate?: string;
    source:
      | "e-gov"
      | "govinfo-cfr"
      | "govinfo-usc"
      | "eur-lex";
    sourceUrl: string;
    license?: string;
    language?: string;
    articles: ArticleIngest[];
    runId: string;
  }
): Promise<{
  statuteUri?: string;
  statuteDid?: string;
  articleDids: string[];
  insertedArticles: number;
  skippedArticles: number;
}> {
  const statuteRes = await registerStatute(e, {
    jurisdiction: args.jurisdiction,
    statuteId: args.statuteId,
    title: args.title,
    titleNative: args.titleNative,
    statuteType: args.statuteType,
    enactedDate: args.enactedDate,
    effectiveDate: args.effectiveDate,
    repealedDate: args.repealedDate,
    source: args.source,
    sourceUrl: args.sourceUrl,
    license: args.license,
    language: args.language,
    articleCount: args.articles.length,
  });
  const statuteRef = statuteRes.statuteUri;
  if (!statuteRef) {
    return {
      statuteUri: undefined,
      statuteDid: undefined,
      articleDids: [],
      insertedArticles: 0,
      skippedArticles: args.articles.length,
    };
  }
  const articleDids: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const a of args.articles) {
    const r = await registerArticle(
      e,
      {
        jurisdiction: args.jurisdiction,
        statuteId: args.statuteId,
        articleNo: a.articleNo,
        statuteRef,
        text: a.text,
        section: a.section,
        title: a.title,
        language: a.language ?? args.language,
        amendedAt: a.amendedAt,
        sourceUrl: a.sourceUrl,
        props: a.props,
      },
      a.blake3Hash
    );
    if (r.status === "registered" && r.did) {
      articleDids.push(r.did);
      inserted += 1;
    } else if (r.status === "alreadyExists" && r.did) {
      articleDids.push(r.did);
    } else {
      skipped += 1;
    }
  }
  return {
    statuteUri: statuteRes.statuteUri,
    statuteDid: statuteRes.did,
    articleDids,
    insertedArticles: inserted,
    skippedArticles: skipped,
  };
}

export async function ingestStatuteJpn(
  e: Etzhayyim,
  input: IngestStatuteJpnInput
): Promise<IngestStatuteJpnOutput> {
  if (!input.runId || !input.statuteId || !input.title) {
    return { error: "missingRequiredFields" };
  }
  const result = await ingestStatuteWithArticles(e, {
    jurisdiction: "jpn",
    statuteId: input.statuteId,
    title: input.title,
    titleNative: input.titleNative ?? input.title,
    statuteType: input.statuteType ?? "law",
    enactedDate: input.enactedDate,
    effectiveDate: input.effectiveDate,
    repealedDate: input.repealedDate,
    source: "e-gov",
    sourceUrl: input.sourceUrl,
    license: "CC-BY-4.0",
    language: "ja",
    articles: input.articles ?? [],
    runId: input.runId,
  });
  const run = await writeIngestRun(
    e,
    input.runId,
    "e-gov",
    "jpn",
    [input.statuteId],
    result.insertedArticles,
    result.statuteUri ? "completed" : "failed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    statuteUri: result.statuteUri,
    statuteDid: result.statuteDid,
    articleDids: result.articleDids,
    insertedArticles: result.insertedArticles,
    skippedArticles: result.skippedArticles,
    alreadyExists: run.alreadyExists,
  };
}

export async function ingestStatuteUsa(
  e: Etzhayyim,
  input: IngestStatuteUsaInput
): Promise<IngestStatuteUsaOutput> {
  if (!input.runId || !input.statuteId || !input.title || !input.source) {
    return { error: "missingRequiredFields" };
  }
  const result = await ingestStatuteWithArticles(e, {
    jurisdiction: "usa",
    statuteId: input.statuteId,
    title: input.title,
    titleNative: input.title,
    statuteType:
      input.statuteType ??
      (input.source === "govinfo-cfr" ? "regulation" : "law"),
    enactedDate: input.enactedDate,
    effectiveDate: input.effectiveDate,
    source: input.source,
    sourceUrl: input.sourceUrl,
    license: "public-domain",
    language: "en",
    articles: input.articles ?? [],
    runId: input.runId,
  });
  const run = await writeIngestRun(
    e,
    input.runId,
    input.source,
    "usa",
    [input.statuteId],
    result.insertedArticles,
    result.statuteUri ? "completed" : "failed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    statuteUri: result.statuteUri,
    statuteDid: result.statuteDid,
    articleDids: result.articleDids,
    insertedArticles: result.insertedArticles,
    skippedArticles: result.skippedArticles,
    alreadyExists: run.alreadyExists,
  };
}

export async function ingestEurLex(
  e: Etzhayyim,
  input: IngestEurLexInput
): Promise<IngestEurLexOutput> {
  if (!input.runId || !input.celexNumber || !input.title) {
    return { error: "missingRequiredFields" };
  }
  const result = await ingestStatuteWithArticles(e, {
    jurisdiction: "eu",
    statuteId: input.celexNumber,
    title: input.title,
    titleNative: input.titleNative,
    statuteType: input.statuteType ?? "regulation",
    enactedDate: input.enactedDate,
    effectiveDate: input.effectiveDate,
    source: "eur-lex",
    sourceUrl: input.sourceUrl,
    license: input.license,
    language: input.language,
    articles: input.articles ?? [],
    runId: input.runId,
  });
  const run = await writeIngestRun(
    e,
    input.runId,
    "eur-lex",
    "eu",
    [input.celexNumber],
    result.insertedArticles,
    result.statuteUri ? "completed" : "failed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    statuteUri: result.statuteUri,
    statuteDid: result.statuteDid,
    articleDids: result.articleDids,
    insertedArticles: result.insertedArticles,
    skippedArticles: result.skippedArticles,
    alreadyExists: run.alreadyExists,
  };
}

export async function ingestTreatyUn(
  e: Etzhayyim,
  input: IngestTreatyUnInput
): Promise<IngestTreatyUnOutput> {
  if (
    !input.runId ||
    !input.treatyId ||
    !input.title ||
    !input.parties ||
    input.parties.length === 0
  ) {
    return { error: "missingRequiredFields" };
  }
  const treatyRes = await registerTreaty(e, {
    treatyId: input.treatyId,
    title: input.title,
    titleNative: input.titleNative,
    parties: input.parties,
    signedDate: input.signedDate,
    effectiveDate: input.effectiveDate,
    registryRef: input.registryRef,
    source: "un-treaty",
    sourceUrl: input.sourceUrl,
    language: input.language,
  });
  const run = await writeIngestRun(
    e,
    input.runId,
    "un-treaty",
    "int",
    [input.treatyId],
    0,
    treatyRes.treatyUri ? "completed" : "failed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    treatyUri: treatyRes.treatyUri,
    treatyDid: treatyRes.did,
    alreadyExists: run.alreadyExists,
  };
}
