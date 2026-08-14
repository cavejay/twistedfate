# Work order — hook the app up to Piltover Archive

**For:** the implementing session (Sonnet).
**Status of the world:** Phase 0 discovery is **done**. Read [`endpoints.md`](endpoints.md) first —
it is the verified API reference, and it corrects several wrong assumptions in
[`../riftbound-randomiser-plan.md`](../riftbound-randomiser-plan.md). Where the plan and
`endpoints.md` disagree, **`endpoints.md` wins**; it was checked against the live API on
2026-08-13.

Right now `public/data/legends.json` and `public/data/decks.json` are hand-authored mocks: 4 legends
and a handful of decks. The deck codes in them are real and valid, but the `imageUrl`s carry an
invented `?width=640` param and the legend ids are variant numbers rather than card ids. All of it
gets replaced by generated output.

---

## Scope

**In scope — build the Phase 1 data pipeline.**

1. A deck-code encoder/decoder ported from PA's bundle.
2. A snapshot script that pulls real legends and top-rated decks and writes the two JSON files.
3. Tests for the codec, verified against PA's own export endpoint.
4. A GitHub Actions cron to refresh the data.

**Out of scope — do not touch:**

- Any component in `src/components/`, any animation, any styling. **The schema below is chosen so
  the frontend needs zero changes.** If you think a component must change, stop and say so instead.
- Rift Atlas (plan §3.2 is still unexplored — leave it).
- Deploy/hosting config.

---

## Constraint that shapes everything

`/api/external/v1` sends **no CORS headers**, so the browser cannot call PA directly. The site stays
a static frontend reading two committed JSON files. Nothing you write may add a runtime call to PA
from `src/`.

---

## Deliverables

```
scripts/
  snapshot.ts              # the job: PA → public/data/*.json
  lib/deckcode.ts          # getCodeFromDeck / getDeckFromCode, ported
  lib/pa-client.ts         # thin typed fetch wrapper (throttle, retry, UA)
  deckcode.test.ts         # node --test
.github/workflows/
  snapshot.yml             # weekly cron + workflow_dispatch
public/data/
  legends.json             # regenerated
  decks.json               # regenerated
```

Node 22.19 runs `.ts` directly with no loader and `node --test` works on `.ts` files — **add no new
dependencies.** Wire up:

```jsonc
"scripts": {
  "snapshot": "node scripts/snapshot.ts",
  "test": "node --test scripts/*.test.ts"
}
```

---

## Task 1 — `scripts/lib/deckcode.ts`

Port `getCodeFromDeck` and `getDeckFromCode` from
[`reference/pa-deckcode-chunk.js`](reference/pa-deckcode-chunk.js) (a saved copy of PA's bundle
chunk — the live URL is content-hashed and will rotate). The format is fully documented in
[`endpoints.md` §4](endpoints.md#4-deck-codes); a **working, verified decoder** is at
[`reference/deckcode-decoder.reference.mjs`](reference/deckcode-decoder.reference.mjs) — start from
it rather than re-deriving.

Export:

```ts
type CardEntry = { cardCode: string; count: number }

export function getCodeFromDeck(
  mainDeck: CardEntry[], sideboard?: CardEntry[], chosenChampion?: string
): string

export function getDeckFromCode(
  code: string, opts?: { signedSuffix?: string }
): { mainDeck: CardEntry[]; sideboard: CardEntry[]; chosenChampion?: string }

export function cleanVariantNumber(variantNumber: string): string
```

Port `cleanVariantNumber` too — it strips `-Foil` / `-Nexus` / `-Release` and remaps the SFD reprint
table (`SFD-R03` → `OGN-089`, …) that is inlined near the top of the chunk. **Every card code must
pass through it before encoding.**

Do not simplify the version-selection logic (v3/v4/v5 — see §4.1). Getting it wrong produces codes
that decode fine in your own decoder and are rejected or silently wrong in PA's.

## Task 2 — `scripts/deckcode.test.ts`

Two layers:

1. **Round-trip, offline.** `getDeckFromCode(getCodeFromDeck(x)) === x` over fixtures that exercise
   each version: counts > 12 or `SP` numbers (v5), `R##` rune numbers (v4), plain (v3). Include the
   known-good v3 code in [`endpoints.md` §4.2](endpoints.md#42-zone-mapping--verified) and assert it
   decodes to the documented card list.
2. **Oracle, networked.** For a couple of real decks: build the code from `expandedCards`, POST it
   to `/decks/export/text`, and assert the returned names and quantities match the deck you built it
   from. Guard these behind an env flag (e.g. `PA_LIVE=1`) so the default `npm test` stays offline
   and CI-safe.

Layer 2 is the one that actually proves correctness — see
[§4.3](endpoints.md#43-verification-oracle). Do not skip it.

## Task 3 — `scripts/lib/pa-client.ts`

Thin wrapper over `fetch` for `https://piltoverarchive.com/api/external/v1`:

- Sequential requests, ~150 ms delay between them.
- `User-Agent: riftbound-randomiser/0.1 (+<repo url>)`.
- Retry with backoff on 5xx and network errors; **do not retry 4xx** (a 422 means a bad param — fail
  loudly, it echoes the accepted params).
- Typed responses. Note the two pagination shapes differ: `/decks` returns
  `{page,pageSize,total,totalPages}`, `/cards` returns `{page,limit,total,totalPages,hasNext,hasPrevious}`.

## Task 4 — `scripts/snapshot.ts`

**Legends.** Sweep `GET /cards?limit=100&page=1..13` (1231 variants), keep entries where
`card.type === "Legend"`, **dedupe on `card.id`** → 49 legends. For each:

```jsonc
{
  "id":       "36e91a0c-…",        // card.id — NOT the variant id. See endpoints.md §3
  "name":     "Vex, Gloomist",     // card.name
  "champion": "Vex",               // card.tags[0]
  "domains":  ["Calm", "Chaos"],   // card.colors[].name
  "imageUrl": "https://cdn.piltoverarchive.com/cards/UNL-193.webp"
}
```

For `imageUrl` pick a deterministic variant — prefer the lowest-numbered non-`*` variant so the art
does not churn between runs. Use the API's `imageUrl` **verbatim**; do not append `?width=640`.

**Decks.** For each legend: `GET /decks?legendId={card.id}&sort=likes&order=desc&limit=100&page=1`,
then keep the **top 20 after filtering to `isLegal === true`**. Only public decks are ever returned,
so no status filtering is needed. One page of 100 is plenty to find 20 legal decks; if a legend
yields fewer than 20, take what exists — and if it yields **zero**, omit the legend from
`decksByLegend` entirely (`rollableLegends()` in `src/lib/data.ts` already drops legends with no
decks, so this degrades cleanly).

Then `GET /decks/{id}?expand=cards` per kept deck and build:

```jsonc
{
  "deckId":  "9075f870-…",
  "url":     "https://piltoverarchive.com/decks/view/9075f870-…",
  "name":    "76.86% Win Rate Vex List",
  "author":  "Ridere",                    // authorName
  "likes":   269,
  "deckCode": "<generated — Task 1>",
  "textList": null,                       // leave null; the frontend does not use it
  "keyCardImageUrls": ["…"],              // 5 highest-quantity maindeck cards, then by rarity
  "chosenChampion": { "name": "Vex, Apathetic", "imageUrl": "…" },
  "sets": ["UNL", "SFD", "OGN"]           // deck.sets[].prefix
}
```

Encoder input, per [§4.2](endpoints.md#42-zone-mapping--verified): `mainDeck` is **every
non-sideboard zone flattened** — legend + runes + battlefields + champions + maindeck, each as
`{cardCode: cleanVariantNumber(variantNumber), count: quantity}`. `sideboard` is its own argument.
`chosenChampion` is the champion's card code, passed **in addition to** its presence in `mainDeck`.

Write `public/data/legends.json` and `public/data/decks.json` in the exact envelopes
`src/lib/data.ts` already parses (`{generatedAt, legends}` and `{generatedAt, source, decksByLegend}`).
Keep key order and 2-space indent stable so the committed diffs stay readable.

Budget: ~13 + 49 + ~600 requests. At 150 ms that is a few minutes. Fine for a weekly cron.

## Task 5 — `.github/workflows/snapshot.yml`

Weekly cron + `workflow_dispatch`. Run the snapshot, and **commit only if the output changed and is
valid**. Validation gate before committing:

- every legend in `legends.json` has the five required fields;
- every deck has a non-empty `deckCode` and a `chosenChampion` with a name and image;
- at least 40 of the 49 legends have ≥1 deck.

If the gate fails, fail the job and commit nothing — a stale snapshot is much better than a broken
one. Do not add a deploy step.

---

## Traps

Each of these cost real time to find. They are all documented in `endpoints.md`; this is the short
list.

1. **`legendId` takes `card.id`, not `deck.legend.id`.** `deck.legend.id` is the *variant* id, and
   passing it returns `total: 0` with a `200` — indistinguishable from "no decks". If a legend comes
   back empty, suspect this first. ([§3](endpoints.md#3-the-legendid-trap))
2. **One legend has many art variants** (Vex → `UNL-193`, `UNL-232`, `UNL-232*`). Key everything on
   `card.id` or Vex appears three times in the roll and its decks split across the entries.
3. **No endpoint returns a deck code.** If you find yourself looking for a `deckCode` field, stop —
   generating it is Task 1. ([§4](endpoints.md#4-deck-codes))
4. **`?expand=cards` is mandatory** on deck detail. Without it, the zones are bare UUIDs with no
   names, images or variant numbers.
5. **`limit` caps at 100**, and `pageSize` is silently ignored — passing `pageSize=50` gets you 20
   rows and a confusing debugging session.
6. **`type` / `super` / `supertype` on `/cards` are silently ignored.** Filter legends client-side.
7. **`isLegal` is a field, not a filter.** There is no `isLegal=true` param.
8. **`RevealPanel` dereferences `deck.chosenChampion.imageUrl` unconditionally** — a deck with an
   empty `champions` zone would crash the reveal. Skip such decks in the snapshot rather than
   emitting a null. If they turn out to be common, say so instead of quietly dropping many decks.
9. **`bench` zone:** empty on every deck sampled, so its place in the encoding is unverified. If you
   hit a deck with a non-empty `bench`, verify the generated code against the oracle before trusting
   it. ([§4.2](endpoints.md#42-zone-mapping--verified))

---

## Done when

- `npm run snapshot` produces both files with **49 legends** and up to 20 legal decks each.
- `npm test` passes offline; `PA_LIVE=1 npm test` passes against the oracle.
- `npm run build` and `npm run lint` are clean.
- The app runs against the generated data with **no changes under `src/`**, and rolling produces a
  legend + deck whose "View on Piltover Archive" link resolves to a real deck page.
- At least one generated deck code has been round-tripped through `/decks/export/text` and the
  output matches the deck.

## Flag, don't guess

Report back rather than deciding alone if: the oracle disagrees with a generated code and the cause
is not obvious; many decks lack a chosen champion; PA starts rate-limiting or returns 403s; or the
`?expand=cards` response shape differs from `endpoints.md`.

One judgement call is explicitly the repo owner's, not yours: `robots.txt` disallows `/api/`, and
scheduling a recurring job may warrant a courtesy note to `management@piltoverarchive.com`
([§5](endpoints.md#5-rate-limiting--etiquette)). Build the workflow, but do not send any email.
