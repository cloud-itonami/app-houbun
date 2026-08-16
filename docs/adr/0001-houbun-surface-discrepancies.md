# ADR-0001 — houbun's six faces disagree; pin the state, route the decisions

- **Status**: accepted (findings) / open (the three decisions below)
- **Date**: 2026-08-16
- **Scope**: `cloud-itonami/app-houbun` at `6eee70d`

## Context

This repo describes itself in six places: `CLAUDE.md`, `kotodama.jsonld`,
`PROJECT.jsonld`, `kotoba/README.md`, `xrpc-adapter/README.md`, and the
TypeScript under `kotoba/src`. They do not agree, and the vitest suite is green
(10/10), so nothing in the repo notices.

The suite is green for a structural reason: it calls `registerArticle` with
`{articleId, title, content}`, while the only in-repo caller (`ingest.ts`) calls
it with `{jurisdiction, statuteId, articleNo, statuteRef, text, ...}`. A comment
in `corpus.ts` — *"Simplified interface: map articleId/content to internal
structure"* — records the moment the implementation was bent to fit the tests.
The bend broke the ingest path, and no test covers it.

## Findings

All measured 2026-08-16 and reproducible via `docs/operator-quickstart.md`.

### F1 — the article DID does not depend on the article

`types.ts` declares `blake3Prefix12Fallback(jurisdiction, statuteId, articleNo,
amendedAt)`, and both `kotoba/README.md` and `CLAUDE.md` document the hash input
as `jurisdiction + statuteId + articleNo + amendedAt`. `registerArticle` calls
it as:

```ts
blake3Prefix12Fallback("default", articleId, "1", undefined)
```

Jurisdiction is the literal `"default"`, `statuteId` receives the *article
number*, `articleNo` is the literal `"1"`, and `amendedAt` is dropped. Two
consequences, both fatal to the stated purpose:

- **Cross-statute collision.** 民法第一条 and 刑法第一条 both produce
  `did:web:houbun.etzhayyim.com:article:d65029f802c9`. The second ingest returns
  `insertedArticles: 0` and discards the text — while returning success with
  `articleDids` populated, so the caller cannot tell.
- **Amendment lineage is inert.** Re-registering an article with a new
  `amendedAt` returns `alreadyExists` on the same DID and never stores the new
  text. `kotoba/README.md`'s central claim — "each amendment produces a **new
  article DID**" — and `CLAUDE.md`'s「改正で新 DID が生える」are both false in
  code. Since `recordAmendment` links `fromArticleDids` to `toArticleDids`, and
  those are now the same DID, `edge_houbun_amends` degenerates to a self-loop.

The production path is unaffected *if* a caller supplies a real `blake3Hash`;
the defect is confined to the fallback, which is what runs otherwise.

### F2 — articles are not linked to their statutes

`registerArticle` writes `statuteRef: \`at://${articleId}\``, discarding the
statute AT-URI that `ingest.ts` computed from the statute write receipt. Stored
value is `at://第一条` against a real value of
`at://did:web:houbun.etzhayyim.com/com.etzhayyim.houbun.statute/statute-jpn-129ac0000000089`.
The `edge_houbun_statute_article` edge documented in `CLAUDE.md` cannot be built.

`ArticleRecord` declares `language`, `amendedAt`, `sourceUrl` and `section`;
`ingest.ts` passes all four; `registerArticle` writes none of them.

### F3 — the scheduler calls a namespace the worker does not serve

`kotodama.jsonld` has five cron `derive` entries dispatching
`com.etzhayyim.houbun.ingest*`. The worker route table is keyed
`com.etzhayyim.apps.houbun` (the only file in the repo using that namespace).
Driving the real worker module returns `404 MethodNotFound` for all four
dispatched NSIDs and `200` for the same command under the `apps.` base.
**Every scheduled ingest is structurally a 404.** All 12 endpoints in
`xrpc-adapter/README.md` are likewise unreachable.

### F4 — the actor's hostname does not resolve

`houbun.etzhayyim.com` is NXDOMAIN. The `etzhayyim.com` apex resolves (Cloudflare
172.67.179.128 / 104.21.51.111), as do `pds.` and `atproto.`. So
`did:web:houbun.etzhayyim.com` — the root of the documented 3-layer DID topology
— cannot be resolved by anyone, and the wrangler route has no record behind it.
This is a missing record, not a missing zone.

### F5 — documents contradicting themselves and each other

- `kotoba/README.md` opens with "Coverage: **12 of 12 (100%) canonical**" and
  its own sibling table records houbun as "8/8 (records), active (4 ingest procs
  pending)".
- `CLAUDE.md` states "**No dedicated Worker**. PDS XRPC → UDF pool RPC 1 hop"
  and places the runtime in a Python handler in another repo, while
  `xrpc-adapter/wrangler.jsonc` defines a dedicated Worker with a route.
- The `CLAUDE.md` smoke test posts to `atproto.etzhayyim.com/xrpc/...`; the
  worker is routed at `houbun.etzhayyim.com/xrpc/*`.
- `CLAUDE.md` names the UN procedure `ingestUnTreaty`; the code exports
  `ingestTreatyUn`, and `kotodama.jsonld` dispatches `ingestTreatyUn`.

## Decision

**Record the state; do not silently pick a winner.**

`scripts/verify-houbun-surface.cljs` asserts the current state of all 18
discrepancies. It deliberately encodes no opinion about which face is correct,
because nothing in the tree settles that. Pinning current state means a fix
turns the checker **red**, forcing the change to arrive as a recorded decision
rather than as drift. `scripts/mutate-houbun-surface.cljs` checks the checker:
16 mutations plus 3 floors, each required to flip exactly the assertions it
targets — exit 1 alone is not accepted as evidence, since breaking an unrelated
assertion also exits 1.

Also decided: **no deploy.** Publishing the worker as it stands would serve a
namespace nothing calls, on a hostname that does not resolve.

## Open — needs an owner decision

These are product questions. The tree does not answer them, and guessing would
convert an ambiguity into a silent commitment.

1. **Which NSID namespace is canonical** — `com.etzhayyim.houbun` (used by the
   scheduler, the record collections, and both READMEs) or
   `com.etzhayyim.apps.houbun` (used by the worker route table alone)? Five
   faces against one suggests the worker is wrong, but the worker is the only
   one that has ever served traffic, so this is not decidable from counts.

2. **Where does houbun actually run** — the Python UDF pool that `CLAUDE.md`
   describes, or the Cloudflare Worker that exists in the tree? These are not
   compatible; one of the two documents a system that is not there.

3. **What is the article identity function** — restore the documented
   `jurisdiction|statuteId|articleNo|amendedAt` hash, or accept the
   `{articleId, content}` model the tests encode and rewrite the topology docs?
   The first makes the existing tests fail; the second abandons content
   addressing, amendment lineage, and the statute→article edge. F1 and F2 are
   fixable in a few lines *once this is chosen*, and not before.

A follow-on question, only after (1): `houbun.etzhayyim.com` needs a DNS record
before any deploy, and which hostname to create depends on the answer.

## Consequences

- The repo now states its own condition in `README.md` rather than presenting
  five mutually inconsistent descriptions with no reader-visible warning.
- The discrepancies are machine-checked, so they cannot widen unnoticed, and a
  fix cannot land without someone updating this ADR.
- **The checker will go red when the bugs are fixed.** That is intended. A red
  run here is a prompt to read the diff, not evidence of a regression.
- Nothing is repaired. F1–F5 all remain, and this ADR does not authorise fixing
  them; it routes them.

## Notes

`npm install` fails on npm 11.16.0 with `EALLOWSCRIPTS` (measured: 10.9.8 ✓,
11.16.0 ✗, 11.17.0 ✓). That is the npm version, not this repo — recorded so the
next reader does not diagnose it as a repo defect. Both SDK dependencies resolve
through GitHub redirects (`etzhayyim/com-etzhayyim-sdk` → `kotoba-lang/sdk`);
the pinned commits resolve today.
