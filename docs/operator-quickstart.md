# Operator quickstart

Every command below was walked on 2026-08-16 and the output pasted here is the
output it produced. If a step does not reproduce, that is a finding — say so
rather than adjusting the doc to match.

Two machines are named because one step does not work everywhere: see
[npm](#a-note-on-npm) below.

---

## 1. Check what the repo currently claims

No install needed. This is the fastest way to see the repo's state.

```bash
nbb scripts/verify-houbun-surface.cljk .
```

Expected today — 18 assertions, all held, exit 0:

```
ASSERTIONS	18	held=18 changed=0 skipped=0 unreadable=0

All assertions held: the repo still says six different things.
```

Offline (skips the one DNS lookup; a skip is counted apart from a hold, never
folded into it):

```bash
nbb scripts/verify-houbun-surface.cljk . --no-net
```

```
SKIPPED   actor-host-nxdomain — --no-net: did not query DNS for houbun.etzhayyim.com

ASSERTIONS	17	held=17 changed=0 skipped=1 unreadable=0
```

Exit codes: `0` all held · `1` something CHANGED · `2` could not answer
(missing input, or fewer than 15 assertions ran). `2` exists so that "I could
not look" never returns the same value as "I looked and it was fine".

**A red run is not automatically a regression.** These assertions pin the
*current* state of known discrepancies, so fixing one turns the checker red.
That is the design — read the CHANGED lines and update
`docs/adr/0001-houbun-surface-discrepancies.md` in the same commit.

> The `<dir>` argument must come **first**. Several gates in this workspace have
> been misdiagnosed because a flag was parsed as the tree path.

## 2. Check the checker

A check that cannot go red is theatre. This breaks the tree one edit at a time,
in a throwaway copy, and requires the checker to notice — and to flip *exactly*
the assertions each mutation targets, since breaking some other assertion also
exits 1.

```bash
nbb scripts/mutate-houbun-surface.cljk .
```

Takes about three minutes (19 subprocesses). Expected:

```
DEMONSTRATIONS	19	ok=19 failed=0

The checker went red on every mutation, and flipped exactly the
assertions each mutation targeted.
```

Three of the nineteen are floors rather than mutations: an unmodified control
must exit 0 with no CHANGED, a deleted `corpus.ts` must exit **2** (not 0, not
1), and `--no-net` must report the DNS assertion as skipped.

## 3. Install and run the test suite

```bash
cd kotoba
npm install
npx vitest run
```

```
 ✓ test/houbun.test.ts (10 tests) 3ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**10/10 green — and that number should not reassure you.** The suite calls
`registerArticle` with `{articleId, title, content}`. The only in-repo caller,
`kotoba/src/ingest.ts`, calls it with `{jurisdiction, statuteId, articleNo,
statuteRef, text, ...}`. The tests exercise a shape nothing else uses, so the
ingest path is untested. Step 4 shows what it does.

### A note on npm

`npm install` fails on npm **11.16.0** with `EALLOWSCRIPTS` while preparing the
git dependencies:

```
npm error code EALLOWSCRIPTS
npm error --allow-scripts is not allowed in project-scoped installs.
```

This is the npm version, not this repo. Measured 2026-08-16:

| npm | result |
|---|---|
| 10.9.8 | installs |
| 11.16.0 | `EALLOWSCRIPTS` |
| 11.17.0 | installs |

`npx npm@11.17.0 install` does **not** work around it — the inner git-dependency
preparation re-enters the outer npm. Use a machine whose npm is not 11.16.x.
The outputs in steps 3 and 4 were produced on `judah` (node v26.4.0, npm
11.17.0). Steps 1 and 2 need only `nbb` and run anywhere.

Both dependencies resolve through GitHub redirects
(`etzhayyim/com-etzhayyim-sdk` → `kotoba-lang/sdk`, and likewise `-sdk-mock`).
The pinned commits resolve today; the redirect is a dependency worth knowing
about.

## 4. See what an article DID actually depends on

```bash
cd kotoba
npx vite-node probe/content-addressing.ts
```

This asserts nothing and always exits 0. It prints what the code does so you can
compare it against `kotoba/README.md` and `CLAUDE.md`:

```
=== A. two different statutes, each with 第一条 ===
民法  articleDids = [ 'did:web:houbun.etzhayyim.com:article:d65029f802c9' ] inserted = 1
刑法  articleDids = [ 'did:web:houbun.etzhayyim.com:article:d65029f802c9' ] inserted = 0
same DID for two different statutes?  true
text stored under that DID = "私権は、公共の福祉に適合しなければならない。"
刑法第一条 text retained anywhere? false

=== B. does an amendment produce a new article DID? ===
v1 = registered did:web:houbun.etzhayyim.com:article:c732a4450dc9
v2 = alreadyExists did:web:houbun.etzhayyim.com:article:c732a4450dc9
new DID on amendment? false

=== D. does the stored article point at its statute? ===
statute AT-URI the ingest computed = at://did:web:houbun.etzhayyim.com/com.etzhayyim.houbun.statute/statute-jpn-129ac0000000089
statuteRef on the article record    = at://第一条
linked? false
fields ArticleRecord declares but registerArticle never writes: language, amendedAt, sourceUrl, section
```

Note `inserted = 0` on the second statute: the ingest call **returns success**,
with `articleDids` populated, while discarding the article body. A caller cannot
tell from the response that anything was lost.

## 5. Check whether the deployed surface answers what the scheduler calls

`kotodama.jsonld` has five cron `derive` entries dispatching
`com.etzhayyim.houbun.ingest*`. The worker's route table is keyed
`com.etzhayyim.apps.houbun`. Confirm the mismatch without deploying:

```bash
grep -n 'NSID_BASE' xrpc-adapter/src/index.ts | head -1
grep -o '"nsid": "[^"]*"' kotodama.jsonld | sort -u
```

```
22:const NSID_BASE = "com.etzhayyim.apps.houbun";
"nsid": "com.etzhayyim.houbun.ingestEurLex"
"nsid": "com.etzhayyim.houbun.ingestStatuteJpn"
"nsid": "com.etzhayyim.houbun.ingestStatuteUsa"
"nsid": "com.etzhayyim.houbun.ingestTreatyUn"
```

Driving the real worker module with those NSIDs returns
`404 {"error":"MethodNotFound"}` for every one, and `200` for the same command
under `com.etzhayyim.apps.houbun`. Every scheduled ingest is a 404. The
`cron-dispatch-unreachable` assertion in step 1 pins this.

## 6. Check DNS before deploying anything

```bash
dig +short houbun.etzhayyim.com A     # empty — NXDOMAIN
dig +short etzhayyim.com A            # 172.67.179.128, 104.21.51.111 (Cloudflare)
dig +short pds.etzhayyim.com A        # resolves
```

The actor's own hostname does not exist, so `did:web:houbun.etzhayyim.com` cannot
be resolved by anyone, and the wrangler route `houbun.etzhayyim.com/xrpc/*` has
no record behind it. The zone itself is healthy — this is a missing record, not
a missing zone.

**Do not deploy to fix this.** Which hostname is correct depends on the same
unresolved question as everything else here: see
`docs/adr/0001-houbun-surface-discrepancies.md`.

---

## What is deliberately not here

No "deploy the worker" step. `wrangler deploy` would publish a worker that
answers a namespace nothing calls, on a hostname that does not resolve. The
prerequisite is a decision, not a command.
