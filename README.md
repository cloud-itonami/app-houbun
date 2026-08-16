# app-houbun

**houbun (法文) — a global corpus of statutes, regulations and treaties, addressed
at the level of the individual article.**

The unit this repo exists to serve is the *article*, not the statute: a citation
should resolve to one provision, and amending that provision should mint a new
identity while the old one stays resolvable. Statute and treaty records
aggregate; `amendmentEvent` records carry lineage between article versions.

Boundaries against the neighbouring actors (from `CLAUDE.md`): contract *types*
live at `social-contract.etzhayyim.com`, organisation records at
`contracts.etzhayyim.com`, the company registry at `legal-entity.etzhayyim.com`,
and legal *services* at `bengoshi` / `lawfirm` / `legal-aid` / `sashiosae`.
houbun holds the law's full text, and nothing else.

## Read this before trusting anything else in the repo

This repository describes itself in six places — `CLAUDE.md`,
`kotodama.jsonld`, `PROJECT.jsonld`, `kotoba/README.md`,
`xrpc-adapter/README.md`, and the TypeScript under `kotoba/src` — **and they do
not agree with each other.** The vitest suite is green (10/10), so nothing in
the repo currently notices.

Measured 2026-08-16, all reproducible via `docs/operator-quickstart.md`:

| What a reader would conclude | What the code does |
|---|---|
| Articles are content-addressed on `jurisdiction\|statuteId\|articleNo\|amendedAt` | `registerArticle` calls the hash as `("default", articleNo, "1", undefined)` — jurisdiction, statuteId and amendedAt are **not inputs** |
| "each amendment produces a **new article DID**" | Re-registering an article with a new `amendedAt` returns `alreadyExists` on the **same** DID, and the new text is never stored |
| Two statutes have distinct articles | 民法第一条 and 刑法第一条 both hash to `d65029f802c9`; the second ingest reports `insertedArticles: 0` and silently discards the text |
| The cron jobs in `kotodama.jsonld` run the ingest | All four dispatch `com.etzhayyim.houbun.*`, which the worker's route table (keyed `com.etzhayyim.apps.houbun`) answers **404 MethodNotFound** |
| `xrpc-adapter/README.md` lists 12 callable endpoints | All 12 use the namespace the worker does not serve; all 404 |
| `did:web:houbun.etzhayyim.com` resolves | `houbun.etzhayyim.com` is **NXDOMAIN** (the `etzhayyim.com` apex, `pds.` and `atproto.` all resolve) |
| Articles link to their statute | The stored `statuteRef` is `at://第一条`, not the statute's AT-URI, so the documented `edge_houbun_statute_article` edge cannot be built |

**None of these are fixed here, on purpose.** Each fix requires choosing which
face is canonical, and that is a product decision the tree does not settle —
see `docs/adr/0001-houbun-surface-discrepancies.md`, which records the evidence
and names the open questions.

What this repo *does* now have is a check that keeps the disagreements from
drifting silently:

```bash
nbb scripts/verify-houbun-surface.cljs .
```

It pins the current state of all 18 discrepancies. It goes **red when someone
fixes one** — which is the intent: a fix should be a recorded decision, not an
unnoticed edit. `scripts/mutate-houbun-surface.cljs` checks the checker (19
demonstrations; each mutation must flip exactly the assertions it targets).

## Layout

| Path | What it is |
|---|---|
| `kotoba/src/` | The reference implementation: `corpus.ts` (8 record commands), `ingest.ts` (4 ingest wrappers), `types.ts` (records + the hash helper) |
| `kotoba/test/` | vitest suite — 10 tests, green, exercising a `{articleId, title, content}` shape **no in-repo caller uses** |
| `kotoba/probe/` | `content-addressing.ts` — prints what the article DID actually depends on |
| `xrpc-adapter/` | Cloudflare Worker exposing the commands over XRPC |
| `scripts/` | The surface checker and its mutation harness |
| `docs/adr/` | Recorded findings and open decisions |

## Status

Honest summary: the record layer is written and the ingest wrappers exist, but
the article identity scheme does not implement the topology the docs describe,
the deployed surface answers a different namespace than the scheduler calls, and
the actor's own hostname does not resolve. Treat it as **not yet serving**.

`kotoba/README.md` opens with "Coverage: **12 of 12 (100%) canonical**" and, in
its own sibling table further down, records houbun as "8/8 (records), active (4
ingest procs pending)". Both sentences are in the same file. That contradiction
is itself one of the pinned assertions.
