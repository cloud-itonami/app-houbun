/**
 * content-addressing.ts — demonstrate what registerArticle's article DID
 * actually depends on.
 *
 *   cd kotoba && npx vite-node probe/content-addressing.ts
 *
 * This is a probe, not a test. It asserts nothing and always exits 0; its
 * job is to print what the code does so a reader can compare that against
 * what kotoba/README.md and CLAUDE.md claim it does. The vitest suite is
 * green and does not exercise this path — see
 * docs/adr/0001-houbun-surface-discrepancies.md.
 */

import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import { ingestStatuteJpn, getArticle, registerArticle } from "../src/index.js";
import { blake3Prefix12Fallback } from "../src/types.js";

const e: any = new MockEtzhayyim({ did: "did:web:houbun.etzhayyim.com" });

console.log("=== A. two different statutes, each with 第一条 ===");
const minpou = await ingestStatuteJpn(e, {
  runId: "run-minpou",
  statuteId: "129AC0000000089",
  title: "民法",
  sourceUrl: "https://laws.e-gov.go.jp/law/129AC0000000089",
  articles: [{ articleNo: "第一条", text: "私権は、公共の福祉に適合しなければならない。" }],
});
console.log("民法  articleDids =", minpou.articleDids, "inserted =", minpou.insertedArticles);

const keihou = await ingestStatuteJpn(e, {
  runId: "run-keihou",
  statuteId: "140AC0000000045",
  title: "刑法",
  sourceUrl: "https://laws.e-gov.go.jp/law/140AC0000000045",
  articles: [{ articleNo: "第一条", text: "この法律は、日本国内において罪を犯したすべての者に適用する。" }],
});
console.log("刑法  articleDids =", keihou.articleDids, "inserted =", keihou.insertedArticles);
console.log("same DID for two different statutes? ", minpou.articleDids![0] === keihou.articleDids![0]);

const stored = await getArticle(e, { blake3Hash: minpou.articleDids![0].split(":").pop() });
console.log("text stored under that DID =", JSON.stringify(stored.article?.text));
console.log("刑法第一条 text retained anywhere?",
  JSON.stringify(stored.article?.text).includes("罪を犯した"));

console.log();
console.log("=== B. does an amendment produce a new article DID? ===");
const e2: any = new MockEtzhayyim({ did: "did:web:houbun.etzhayyim.com" });
const v1 = await registerArticle(e2, {
  jurisdiction: "jpn", statuteId: "129AC0000000089", articleNo: "第二条",
  statuteRef: "at://statute-jpn", text: "OLD TEXT", amendedAt: "2003-05-30",
} as any);
const v2 = await registerArticle(e2, {
  jurisdiction: "jpn", statuteId: "129AC0000000089", articleNo: "第二条",
  statuteRef: "at://statute-jpn", text: "NEW TEXT after the 2022 amendment", amendedAt: "2022-04-01",
} as any);
console.log("v1 =", v1.status, v1.did);
console.log("v2 =", v2.status, v2.did);
console.log("new DID on amendment?", v1.did !== v2.did);

console.log();
console.log("=== C. what the documented hash would produce ===");
console.log("blake3Prefix12Fallback('jpn','129AC0000000089','第一条',undefined) =",
  blake3Prefix12Fallback("jpn", "129AC0000000089", "第一条", undefined));
console.log("blake3Prefix12Fallback('usa','CFR-2024-title40','第一条',undefined) =",
  blake3Prefix12Fallback("usa", "CFR-2024-title40", "第一条", undefined));
console.log("registerArticle instead calls it as ('default', articleNo, '1', undefined)");

console.log();
console.log("=== D. does the stored article point at its statute? ===");
console.log("statute AT-URI the ingest computed =", minpou.statuteUri);
console.log("statuteRef on the article record    =", stored.article?.statuteRef);
console.log("linked?", stored.article?.statuteRef === minpou.statuteUri);
console.log("fields ArticleRecord declares but registerArticle never writes:",
  ["language", "amendedAt", "sourceUrl", "section"]
    .filter((k) => (stored.article as any)?.[k] === undefined)
    .join(", "));
