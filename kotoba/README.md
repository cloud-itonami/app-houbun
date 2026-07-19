# houbun kotoba

Phase E Option B reference implementation of houbun (global statute / regulation / treaty full-text corpus) on the etzhayyim substrate.

Per [ADR-0052](../../../90-docs/adr/0052-houbun-global-statute-corpus.md) + [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md), houbun migrates from vendor's `createKyselyDb` pattern to **Option B** — PDS XRPC writes via `@etzhayyim/sdk e.write()`.

Coverage: **12 of 12 (100%) canonical** houbun lexicons ported (8 records + 4 ingest procs).

| Tier | Commands | Slice |
|---|---|---|
| Statute | registerStatute, getStatute, listStatutes | 1 |
| Article | registerArticle, getArticle | 1 |
| Treaty | registerTreaty, getTreaty | 1 |
| Amendment | recordAmendment | 1 |
| Ingest | ingestStatuteJpn, ingestStatuteUsa, ingestEurLex, ingestTreatyUn | **2** |

houbun kotoba Option B reference impl is now complete at canonical surface.

## 3-Layer DID topology (per ADR-0052)

```
did:web:houbun.etzhayyim.com                            — App controller
did:web:houbun.etzhayyim.com:{jurisdiction}:{source}    — Source path
                                                          (e.g. jpn:e-gov)
did:web:houbun.etzhayyim.com:statute:{jur}-{statuteId}  — Statute record
did:web:houbun.etzhayyim.com:article:{blake3_12}        — Content-addressed article
did:web:houbun.etzhayyim.com:treaty:{treatyId-slug}     — Treaty record
```

## Content-addressed articles

Article DIDs are hashed from `jurisdiction|statuteId|articleNo|amendedAt`, so each amendment produces a **new article DID**. Lineage between versions is captured by `recordAmendment(fromArticleDids[], toArticleDids[])`.

The package supplies a deterministic FNV-1a fallback hash (`blake3Prefix12Fallback`) for scaffolding/tests; production callers SHOULD pre-compute real blake3 in the LangServer pod and pass it as the optional `blake3Hash` arg to `registerArticle`.

## Source-native identifiers

| Source | statuteId format |
|---|---|
| `e-gov` (JPN) | e-Gov lawId (e.g. `416AC0000000061`) |
| `govinfo-cfr` (USA) | GovInfo packageId (e.g. `CFR-2024-title40-vol1`) |
| `govinfo-usc` (USA) | GovInfo packageId for U.S. Code |
| `eur-lex` (EU) | CELEX number (e.g. `32016R0679` for GDPR) |
| `un-treaty` (INT) | UN Treaty Series number |

## Usage

```ts
import { Etzhayyim } from "@etzhayyim/sdk";
import {
  registerStatute,
  registerArticle,
  recordAmendment,
} from "@etzhayyim/houbun-kotoba";

const e = new Etzhayyim({
  did: "did:web:houbun.etzhayyim.com",
  pdsUrl: "https://pds.etzhayyim.com",
  l2RpcUrl: "https://mainnet.base.org",
});

const s = await registerStatute(e, {
  jurisdiction: "jpn",
  statuteId: "416AC0000000061",
  title: "個人情報の保護に関する法律",
  titleNative: "個人情報の保護に関する法律",
  statuteType: "law",
  enactedDate: "2003-05-30",
  effectiveDate: "2017-05-30",
  source: "e-gov",
  sourceUrl: "https://laws.e-gov.go.jp/law/415AC0000000057",
  license: "CC-BY-4.0",
  language: "ja",
});

// Pod-side LLM computes blake3; we pass it in.
const a = await registerArticle(e, {
  jurisdiction: "jpn",
  statuteId: "416AC0000000061",
  articleNo: "第二条",
  statuteRef: s.statuteUri!,
  text: "この法律において...",
  language: "ja",
  amendedAt: "2022-04-01",
  sourceUrl: "https://laws.e-gov.go.jp/law/415AC0000000057#Mp-At_2",
}, /* blake3Hash */ "a8b3f1e2c9d7");

// Capture amendment lineage between two article versions.
const amend = await recordAmendment(e, {
  amendmentId: "jpn-pp-2022-04",
  statuteDid: s.did!,
  fromArticleDids: ["did:web:houbun.etzhayyim.com:article:b1c2d3e4f5a6"],
  toArticleDids: ["did:web:houbun.etzhayyim.com:article:a8b3f1e2c9d7"],
  amendedAt: "2022-04-01",
  notes: "GDPR equivalence amendment",
});
```

## Sibling reference impls (14 actors)

| Actor | Coverage | Status |
|---|---|---|
| hanrei | 31/31 | complete |
| ipaddress | 37/37 | complete |
| sbom | 17/N (canonical 4/4) | canonical complete |
| kiyo | 12/12 | complete |
| ki | 4/4 | complete |
| otakiage | 13 (10/10 canonical) | complete |
| houki | 9 (8/8 canonical) | complete |
| open-banking | 5/5 | complete |
| open-denki | 12/12 | complete |
| koke | 4/4 | complete |
| hakkou | 3 (2/2 canonical) | complete |
| isbn | 4/4 | complete |
| gtin | 3/3 | complete |
| **houbun** | **8/8 (records)** | **active (4 ingest procs pending)** |
