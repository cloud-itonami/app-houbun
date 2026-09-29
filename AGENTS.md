# etzhayyim-project-houbun

houbun.etzhayyim.com — global statute / regulation / treaty full-text corpus. ADR-0052 が scope と DID topology の SSoT。

## Architecture: 3-Layer DID

| Layer | DID | 数 | 用途 |
|---|---|---|---|
| Primary | `did:web:houbun.etzhayyim.com` | 1 | App controller |
| Source (path) | `did:web:houbun.etzhayyim.com:{jurisdiction}:{source}` | O(10) | 法域 × source |
| Article (hash) | `did:web:houbun.etzhayyim.com:article:{blake3_prefix12}` | O(N) | 条文単位 content-addressed |

### Source path DID 例

```
did:web:houbun.etzhayyim.com:jpn:e-gov        — JPN e-Gov 法令 API v2 (Phase 1, live)
did:web:houbun.etzhayyim.com:usa:cfr           — USA CFR via GovInfo (planned)
did:web:houbun.etzhayyim.com:usa:usc           — USA U.S. Code via GovInfo (planned)
did:web:houbun.etzhayyim.com:eu:eur-lex       — EU EUR-Lex SPARQL (planned)
did:web:houbun.etzhayyim.com:int:un-treaty    — UN Treaty Collection (planned)
```

### Article DID 例

```
did:web:houbun.etzhayyim.com:article:a8b3f1e2c9d7
hash input: jurisdiction + statuteId + articleNo + amendedAt
→ blake2b-48 (12 hex chars)
```

改正で新 DID が生える。lineage は `edge_houbun_amends` + `vertex_houbun_amendmentEvent` が担う。

## Boundary vs 既存 actor

| Actor | 責務 | houbun との関係 |
|---|---|---|
| `social-contract.etzhayyim.com` | 契約類型 69 type DID (incorporation / asset-acquisition / labor …) | 抽象的分類 vs houbun = 法令本文 |
| `contracts.etzhayyim.com` | Organization DID projection + SocialContract (treaty / constitution の hub) | hub record は contracts、全文は houbun |
| `legal-entity.etzhayyim.com` | 法人 registry crawler (123.5M rows) | 法人 ≠ 法令。境界明確 |
| `bengoshi` / `lawfirm` / `legal-aid` / `sashiosae` | 法務サービス actor (ADR-0016/0035) | corpus ≠ service |

## Collections (`com.etzhayyim.houbun.*`)

| NSID | Kind | Description |
|---|---|---|
| `com.etzhayyim.houbun.statute` | record | 法令/規則メタ (title / jurisdiction / enacted / effective / repealed) |
| `com.etzhayyim.houbun.article` | record | 条文本体 — **quantum of citation** |
| `com.etzhayyim.houbun.amendmentEvent` | record | 改正イベント (insert / modify / delete / repeal) |
| `com.etzhayyim.houbun.treaty` | record | 国際条約 |
| `com.etzhayyim.houbun.ingestStatuteJpn` | procedure | e-Gov v2 crawl (Phase 1, live) |

Phase 2 (別 PR): `caseLaw` record + `ingestStatuteUsa` / `ingestEurLex` / `ingestUnTreaty` procedure.

## Runtime

- **Type**: Logical actor (ADR-0049 Mode A reactive)
- **Runtime placement**: `40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/handlers/houbun.py` — shared UDF pool on Vultr VKE (`mitama-udf-pool`)
- **No dedicated Worker**. PDS XRPC → UDF pool RPC 1 hop
- **Write path**: Hyperdrive direct (ADR-0036)
- **License compliance**: e-Gov CC-BY-4.0 / GovInfo public domain / EUR-Lex attribution

## Graph tables

| Table | Role |
|---|---|
| `vertex_houbun_statute` | 法令メタ — indexed by (jurisdiction, statute_id) |
| `vertex_houbun_article` | 条文本体 — indexed by (statute_ref) + (article_did) |
| `vertex_houbun_amendmentEvent` | 改正履歴 — indexed by (statute_ref, supersedes_article_did) |
| `vertex_houbun_treaty` | 国際条約 — indexed by (source, source_record_id) |
| `edge_houbun_statute_article` | (statute) → (article) ordered by article_no |
| `edge_houbun_amends` | (amendmentEvent) → (article), op ∈ insert/modify/delete/repeal |

Migration: `30-graph/graph-schema/migrations/20260422110000_vertex_houbun.ts`

## Phase 1 smoke (post-deploy)

```bash
# JPN: 民法 (Civil Code)
curl -X POST https://atproto.etzhayyim.com/xrpc/com.etzhayyim.houbun.ingestStatuteJpn \
  -H "Authorization: Bearer $etzhayyim_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lawId":"129AC0000000089"}'
# → {ok, source:"e-gov", statutesFetched:1, statutesInserted:1,
#    articlesInserted:1050, articlesSkipped:0, errors:0}
```

## References

- ADR-0052 — actor topology (SSoT)
- ADR-0049 — Python UDF shared pool runtime
- ADR-0044 — UDF language strategy (external IO = Python External UDF)
- ADR-0036 — Worker-direct Hyperdrive persistence
- e-Gov 法令 API v2: https://laws.e-gov.go.jp/apitop/
