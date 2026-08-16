#!/usr/bin/env nbb
;; verify-houbun-surface.cljs — pin what this repo's six faces currently say.
;;
;;   nbb scripts/verify-houbun-surface.cljs <dir> [--no-net]
;;
;; <dir> MUST be the first argument (the fleet passes it that way, and several
;; gates in this workspace have been misdiagnosed because a flag was read as
;; the tree path — CLAUDE.md, 2026-08-10).
;;
;; WHAT THIS IS FOR
;; ----------------
;; houbun describes itself in six places — CLAUDE.md, kotodama.jsonld,
;; PROJECT.jsonld, kotoba/README.md, xrpc-adapter/README.md, and the code.
;; They do not agree with each other, and the vitest suite is green, so
;; nothing in the repo currently notices. This script asserts the CURRENT
;; state of each disagreement.
;;
;; It deliberately does NOT encode which face is correct. That is a product
;; decision (see docs/adr/0001-houbun-surface-discrepancies.md) and nothing in
;; the tree settles it. Pinning current state means a fix turns this script
;; RED, which forces the change to be a recorded decision rather than silent
;; drift. A red run here is not automatically a regression — read the diff.
;;
;; EXIT CODES
;;   0  every assertion held
;;   1  at least one assertion CHANGED (something moved — read which)
;;   2  could not answer (missing input, or too few assertions ran)
;;
;; Exit 2 exists because "I could not look" and "I looked and it was fine"
;; must not be the same value (ADR-2608136000).

(require '["fs" :as fs]
         '["path" :as path]
         '["child_process" :as cp]
         '[clojure.string :as str])

;; nbb's js/process.argv is [node, nbb, script, ...args] — use *command-line-args*
;; rather than dropping a hard-coded count off the front.
(def argv (vec *command-line-args*))
(def flags (set (filter #(str/starts-with? % "--") argv)))
(def root (or (first (remove #(str/starts-with? % "--") argv)) "."))
(def no-net? (contains? flags "--no-net"))

;; Floors. If we ever run fewer than this, we did not actually check the repo
;; and must not report a pass.
(def min-assertions 15)

(defn slurp* [rel]
  (let [p (path/join root rel)]
    (when (fs/existsSync p)
      (str (fs/readFileSync p "utf8")))))

(def state (atom {:held [] :changed [] :skipped [] :unreadable []}))

(defn- record! [k id msg] (swap! state update k conj {:id id :msg msg}))

(defn check!
  "Assert `pred` about the current tree. `inputs` are the files the assertion
   reads; if any is missing we cannot answer, which is neither held nor changed."
  [id inputs expect-msg pred]
  (let [missing (remove #(fs/existsSync (path/join root %)) inputs)]
    (if (seq missing)
      (record! :unreadable id (str "missing input: " (str/join ", " missing)))
      (try
        (if (pred)
          (record! :held id expect-msg)
          (record! :changed id expect-msg))
        (catch :default e
          (record! :unreadable id (str "threw: " (.-message e))))))))

(defn skip! [id why] (record! :skipped id why))

;; ── the six faces ────────────────────────────────────────────────────────────

(def worker-src   (slurp* "xrpc-adapter/src/index.ts"))
(def wrangler     (slurp* "xrpc-adapter/wrangler.jsonc"))
(def adapter-doc  (slurp* "xrpc-adapter/README.md"))
(def kotodama     (slurp* "kotodama.jsonld"))
(def claude-md    (slurp* "CLAUDE.md"))
(def kotoba-doc   (slurp* "kotoba/README.md"))
(def corpus-ts    (slurp* "kotoba/src/corpus.ts"))
(def types-ts     (slurp* "kotoba/src/types.ts"))
(def ingest-ts    (slurp* "kotoba/src/ingest.ts"))
(def test-ts      (slurp* "kotoba/test/houbun.test.ts"))

;; NOTE: this pattern has no capturing group, so re-seq yields strings, not
;; vectors — do not `map first` over it (that yields the first character).
(defn nsids-in [s] (set (re-seq #"com\.etzhayyim\.(?:apps\.)?houbun\.[A-Za-z]+" (or s ""))))

(def expected-worker-base "com.etzhayyim.apps.houbun")
(def declared-base "com.etzhayyim.houbun")

;; Extract a TypeScript function's source so an assertion about one function
;; cannot be satisfied by an identical-looking line in another. corpus.ts calls
;; the fallback hash from BOTH registerArticle and getArticle; without this,
;; a claim about registerArticle silently holds on getArticle's call.
(defn fn-body [src fname]
  (when src
    (let [start (.indexOf src (str "export async function " fname "("))]
      (when (>= start 0)
        (let [rest- (subs src (+ start 1))
              nxt (.indexOf rest- "\nexport ")]
          (if (>= nxt 0) (subs rest- 0 nxt) rest-))))))

(def register-article-src (fn-body corpus-ts "registerArticle"))

;; NSIDs the kotodama cron `derive` block actually dispatches.
(def cron-nsids
  (set (map second (re-seq #"\"nsid\"\s*:\s*\"([^\"]+)\"" (or kotodama "")))))

;; The base the worker ACTUALLY uses — read from the file, never assumed.
;; Deriving this from a constant would make the disjointness assertions below
;; blind to the very change they exist to catch.
(def worker-base
  (second (re-find #"NSID_BASE\s*=\s*\"([^\"]+)\"" (or worker-src ""))))

;; NSIDs the worker route table actually registers.
(def worker-nsids
  (when worker-base
    (set (map #(str worker-base "." (second %))
              (re-seq #"\$\{NSID_BASE\}\.([A-Za-z]+)" worker-src)))))

;; ── A. routing: what the cron dispatches vs what the worker answers ──────────

(check! "worker-nsid-base" ["xrpc-adapter/src/index.ts"]
        (str "worker route table is keyed on " expected-worker-base)
        #(= worker-base expected-worker-base))

(check! "cron-dispatch-namespace" ["kotodama.jsonld"]
        (str "every kotodama cron dispatch uses " declared-base ".*")
        #(and (>= (count cron-nsids) 4)
              (every? (fn [n] (str/starts-with? n (str declared-base "."))) cron-nsids)))

(check! "cron-dispatch-unreachable" ["kotodama.jsonld" "xrpc-adapter/src/index.ts"]
        "no cron-dispatched NSID exists in the worker route table (all 404)"
        #(and (seq cron-nsids) (seq worker-nsids)
              (empty? (clojure.set/intersection cron-nsids worker-nsids))))

(check! "adapter-readme-unreachable" ["xrpc-adapter/README.md" "xrpc-adapter/src/index.ts"]
        "every endpoint in xrpc-adapter/README.md is absent from the route table"
        #(let [doc-nsids (nsids-in adapter-doc)]
           (and (>= (count doc-nsids) 10)
                (empty? (clojure.set/intersection doc-nsids worker-nsids)))))

;; ── B. content addressing: the hash does not consume what the docs say ───────

;; All three are scoped to registerArticle's own body — see fn-body above.
(check! "hash-call-literals" ["kotoba/src/corpus.ts"]
        "registerArticle calls the fallback hash with literals \"default\" and \"1\""
        #(re-find #"blake3Prefix12Fallback\(\s*\"default\",\s*articleId,\s*\"1\""
                  (or register-article-src "")))

(check! "hash-drops-statute-identity" ["kotoba/src/corpus.ts"]
        "registerArticle's hash call passes neither input.jurisdiction nor input.statuteId"
        #(let [call (re-find #"blake3Prefix12Fallback\([^)]*\)" (or register-article-src ""))]
           (and call
                (not (str/includes? call "input.jurisdiction"))
                (not (str/includes? call "input.statuteId")))))

(check! "hash-drops-amendedat" ["kotoba/src/corpus.ts"]
        "registerArticle's hash call passes no amendedAt, so an amendment cannot change the DID"
        #(let [call (re-find #"blake3Prefix12Fallback\([^)]*\)" (or register-article-src ""))]
           (and call (not (str/includes? call "amendedAt")))))

(check! "fallback-signature-documented" ["kotoba/src/types.ts"]
        "blake3Prefix12Fallback still declares (jurisdiction, statuteId, articleNo, amendedAt)"
        #(re-find #"blake3Prefix12Fallback\(\s*\n\s*jurisdiction: string,\s*\n\s*statuteId: string,\s*\n\s*articleNo: string,\s*\n\s*amendedAt: string \| undefined,?\s*\n\s*\)" types-ts))

(check! "docs-claim-content-addressing" ["kotoba/README.md" "CLAUDE.md"]
        "both docs still claim each amendment produces a new article DID"
        #(and (re-find #"each amendment produces a \*\*new article DID\*\*" kotoba-doc)
              (re-find #"改正で新 DID が生える" claude-md)))

;; ── C. what registerArticle actually stores ─────────────────────────────────

(check! "article-statuteref-synthetic" ["kotoba/src/corpus.ts"]
        "the stored article's statuteRef is at://${articleId}, not the caller's statuteRef"
        #(re-find #"statuteRef:\s*`at://\$\{articleId\}`" corpus-ts))

(check! "article-record-drops-fields" ["kotoba/src/corpus.ts" "kotoba/src/types.ts"]
        "ArticleRecord declares language/amendedAt/sourceUrl/section but registerArticle writes none"
        ;; NOT [^}]* — the literal contains `at://${articleId}`, whose brace would
        ;; truncate the match after two fields and hide every later addition.
        #(let [record-lit (re-find #"const record: ArticleRecord = \{[\s\S]*?\n  \};" corpus-ts)]
           (and record-lit
                (every? (fn [f] (re-find (re-pattern (str "\\n\\s+" f "\\?: ")) types-ts))
                        ["language" "amendedAt" "sourceUrl" "section"])
                (not-any? (fn [f] (str/includes? record-lit (str f ":")))
                          ["language" "amendedAt" "sourceUrl" "section"]))))

(check! "ingest-passes-dropped-fields" ["kotoba/src/ingest.ts"]
        "ingest.ts does pass those fields to registerArticle (so the loss is in corpus.ts)"
        #(every? (fn [f] (str/includes? ingest-ts f))
                 ["language:" "amendedAt:" "sourceUrl:" "section:"]))

;; ── D. the docs disagree with themselves and with the code ──────────────────

(check! "kotoba-readme-self-contradiction" ["kotoba/README.md"]
        "kotoba/README.md claims 12/12 complete at the top and 4 procs pending in its own table"
        #(and (re-find #"(?i)Coverage:\s*\*\*12 of 12 \(100%\) canonical\*\*" kotoba-doc)
              (re-find #"(?i)4 ingest procs pending" kotoba-doc)))

(check! "claude-md-denies-the-worker" ["CLAUDE.md" "xrpc-adapter/wrangler.jsonc"]
        "CLAUDE.md says 'No dedicated Worker' while wrangler.jsonc defines one with a route"
        #(and (re-find #"(?i)\*\*No dedicated Worker\*\*" claude-md)
              (re-find #"\"routes\"\s*:\s*\[\s*\{\s*\"pattern\"" wrangler)))

(check! "claude-md-smoke-wrong-host" ["CLAUDE.md" "xrpc-adapter/wrangler.jsonc"]
        "the CLAUDE.md smoke curl targets a different host than the worker route"
        #(and (str/includes? claude-md "atproto.etzhayyim.com/xrpc/")
              (str/includes? wrangler "houbun.etzhayyim.com/xrpc/*")))

(check! "un-treaty-proc-name-split" ["CLAUDE.md" "kotoba/src/ingest.ts"]
        "CLAUDE.md calls it ingestUnTreaty; the code exports ingestTreatyUn"
        #(and (str/includes? claude-md "ingestUnTreaty")
              (str/includes? ingest-ts "export async function ingestTreatyUn")
              (not (str/includes? ingest-ts "ingestUnTreaty"))))

;; ── E. the test suite exercises a shape no caller uses ──────────────────────

(check! "test-shape-has-no-caller" ["kotoba/test/houbun.test.ts" "kotoba/src/ingest.ts"]
        "tests call registerArticle with {articleId, content}; the only in-repo caller uses {articleNo, text}"
        #(and (str/includes? test-ts "articleId:")
              (str/includes? test-ts "content:")
              (str/includes? ingest-ts "articleNo: a.articleNo")
              (not (str/includes? ingest-ts "articleId:"))))

;; ── F. does the actor's own hostname resolve? (network) ─────────────────────

;; A failed lookup is NOT evidence of NXDOMAIN — if dig cannot run we did not
;; answer the question, and that must surface as unreadable (exit 2) rather
;; than as a held or changed assertion.
(if no-net?
  (skip! "actor-host-nxdomain" "--no-net: did not query DNS for houbun.etzhayyim.com")
  (let [out (try (str (cp/execSync "dig +short houbun.etzhayyim.com A"
                                   #js {:encoding "utf8" :timeout 8000}))
                 (catch :default e (do (record! :unreadable "actor-host-nxdomain"
                                                (str "dig could not run: " (.-message e)))
                                       ::failed)))]
    (when (not= out ::failed)
      (check! "actor-host-nxdomain" []
              "houbun.etzhayyim.com does not resolve, so did:web cannot be fetched"
              #(str/blank? (str/trim out))))))

;; ── report ──────────────────────────────────────────────────────────────────

(let [{:keys [held changed skipped unreadable]} @state
      ran (+ (count held) (count changed))]
  (doseq [{:keys [id msg]} (sort-by :id held)]    (println (str "HELD      " id " — " msg)))
  (doseq [{:keys [id msg]} (sort-by :id changed)] (println (str "CHANGED   " id " — " msg)))
  (doseq [{:keys [id msg]} (sort-by :id skipped)] (println (str "SKIPPED   " id " — " msg)))
  (doseq [{:keys [id msg]} (sort-by :id unreadable)] (println (str "UNREADABLE " id " — " msg)))
  (println)
  ;; Evidence floor, printed whether or not it trips, so a reader can tell
  ;; "checked 16 things" from "checked nothing and found nothing wrong".
  (println (str "ASSERTIONS\t" ran "\theld=" (count held)
                " changed=" (count changed)
                " skipped=" (count skipped)
                " unreadable=" (count unreadable)))
  (cond
    (seq unreadable)
    (do (println (str "\nRefusing to report a result: " (count unreadable)
                      " assertion(s) could not read their inputs."))
        (js/process.exit 2))

    (< ran min-assertions)
    (do (println (str "\nRefusing to report a result: only " ran " assertion(s) ran, floor is "
                      min-assertions ". A shrinking check is not a passing check."))
        (js/process.exit 2))

    (seq changed)
    (do (println (str "\n" (count changed) " assertion(s) CHANGED. The tree no longer matches what"
                      "\ndocs/adr/0001-houbun-surface-discrepancies.md recorded. If this was"
                      "\nintentional, update that ADR in the same commit."))
        (js/process.exit 1))

    :else
    (do (println "\nAll assertions held: the repo still says six different things.")
        (js/process.exit 0))))
