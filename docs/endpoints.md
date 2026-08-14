# Piltover Archive — discovered endpoints

Phase 0 output for [the build plan](../riftbound-randomiser-plan.md) §3. Everything below was
verified live on **2026-08-13** against `piltoverarchive.com`. Anything not confirmed is marked
**UNVERIFIED**.

> The plan assumed PA had "no documented public API" and would need Playwright/scraping. That is
> **wrong**. PA ships a clean, unauthenticated REST API at `/api/external/v1`. See
> [Plan corrections](#plan-corrections).

---

## 1. Base + access model

| Property | Value |
|---|---|
| Base URL | `https://piltoverarchive.com/api/external/v1` |
| Auth | **None** for the endpoints below (Clerk bearer token only for user-scoped routes) |
| Cloudflare challenge | **No.** Plain `curl` and Node `fetch` both get `200` with no special UA |
| CORS | **No `Access-Control-Allow-Origin` header.** Browsers cannot call this cross-origin |
| Unknown routes | `403 {"error":"Forbidden"}` (route allowlist) — not 404 |
| Bad params | `422` with a validation body that echoes the accepted param set — useful for probing |
| `cache-control` | `no-store` |

The missing CORS header is why the snapshot architecture in plan §4 is still correct: the browser
cannot talk to PA directly, so a build-time/cron snapshot is required, not merely polite.

`robots.txt` contains `Disallow: /api/`. That directive targets crawlers rather than API clients,
and the route is named `external`, but it is worth a courtesy note — see
[Rate limiting](#5-rate-limiting--etiquette).

---

## 2. Endpoints

### 2.1 `GET /decks` — deck library

```
GET /api/external/v1/decks?sort=likes&order=desc&limit=100&page=1&legendId={cardId}
```

| Param | Values | Notes |
|---|---|---|
| `sort` | `likes`, `views`, `trending`, `createdAt` | Anything else → `422`. Omitted → `trending`-ish default |
| `order` | `asc`, `desc` | Defaults to `desc` |
| `limit` | 1–100 | **Max 100**; `200` → `422`. `pageSize` is *ignored* |
| `page` | 1-based | |
| `legendId` | a **card** id (UUID) | See [the legendId trap](#3-the-legendid-trap) |
| `q` | free text | Fuzzy; reranks rather than strictly filtering. Avoid for the snapshot |

Response:

```jsonc
{
  "data": [{
    "id": "9075f870-…",              // deckId — use in /decks/view/{id}
    "name": "76.86% Win Rate Vex List",
    "description": "…",              // may be null
    "authorId": "834fb226-…",
    "authorName": "Ridere",
    "authorSubscriptionTier": null,
    "status": "public",              // only public decks are ever returned
    "views": 23847,
    "likes": 269,
    "videoUrl": null,
    "editedAt": "2026-04-16T…",
    "createdAt": "…",
    "legend": {
      "id": "26ea9b7f-…",            // ⚠ VARIANT id, not the card id
      "name": "Vex, Gloomist",
      "variantNumber": "UNL-193",
      "imageUrl": "https://cdn.piltoverarchive.com/cards/UNL-193.webp",
      "colors": [{ "id": "…", "name": "Calm", "imageUrl": "…/colors/Calm.webp" }]
    },
    "sets": [{ "id": "…", "prefix": "UNL", "name": "Unleashed" }],
    "contentFlags": { "hasVideo": false, "hasGuide": false, "hasMatchups": false },
    "isLegal": false,
    "bannedCardNames": ["The Arena's Greatest"],
    "upcomingBanCards": []
  }],
  "pagination": { "page": 1, "pageSize": 20, "total": 10000, "totalPages": 500 }
}
```

Notes:
- **Only `status: "public"` decks are returned.** No private/draft filtering needed (plan §4.1 can
  drop that concern).
- Unfiltered `total` is exactly `10000` — a cap, not a true count. Per-legend totals are real
  (e.g. Vex → `1718`).
- There is **no legality filter param**. Filter on the `isLegal` field client-side.
- `sets` is the set list the deck draws from — maps straight onto `DeckEntry.sets`. **This is the
  only place it appears** — see the note below.

### 2.2 `GET /decks/{deckId}` — deck detail

```
GET /api/external/v1/decks/{deckId}?expand=cards
```

> **`sets` is not present on this response at all** — confirmed live, it's simply absent from the
> key set. If you need it, keep the `DeckSummary` from the `/decks` list call around instead of
> re-deriving it from the detail card lists.

Without `expand=cards`, the card zones are bare UUID references and **useless on their own**:

```jsonc
"maindeck": [{ "cardId": "e2c3ee2e-…", "variantId": "75a001c5-…", "quantity": 3 }]
```

With `?expand=cards` you additionally get an `expandedCards` object keyed by zone
(`champions`, `battlefields`, `runes`, `maindeck`, `sideboard`, `bench`), each entry hydrated:

```jsonc
"expandedCards": {
  "champions": [{
    "cardId": "1f7859e2-…", "variantId": "f98c1679-…",
    "variantNumber": "UNL-113",
    "quantity": 1,
    "imageUrl": "https://cdn.piltoverarchive.com/cards/UNL-113.webp",
    "rarity": "Rare",
    "card": {
      "id": "…", "name": "Master Yi, Tempered",
      "types": ["Unit"], "type": "Unit", "super": "Champion",
      "description": "…", "energy": 4, "might": 4, "power": 0,
      "tags": ["Master Yi", "Ionia"], "maxCopies": null,
      "banEffectiveDate": null,
      "colors": [{ "name": "Body", "imageUrl": "…" }]
    }
  }]
}
```

**Always use `?expand=cards`.** It is one request and removes any need to join against a card index.

Top-level keys: `id, name, description, authorId, authorName, authorAvatar,
authorSubscriptionTier, legend, status, views, likes, videoUrl, featured, featuredAt, champions,
battlefields, runes, maindeck, sideboard, bench, expandedCards, hasGuide, hasMatchups, createdAt,
editedAt, updatedAt`.

> **There is no deck code field anywhere in this response.** See [§4](#4-deck-codes).

### 2.3 `GET /cards` — card index

```
GET /api/external/v1/cards?limit=100&page=1
```

- `limit` max 100, `total` **1231** variants → 13 pages for a full sweep.
- Pagination shape differs from `/decks`: `{ page, limit, total, totalPages, hasNext, hasPrevious }`.
- `q` works. **`type`, `super`, and `supertype` are silently ignored** — filter client-side.
- Entry shape: `id` (variant id), `variantNumber`, `rarity`, `variantType`, `foilMode`,
  `variantTypes`, `imageUrl`, `flavorText`, `artist`, `releaseDate`, `variantLabel`,
  `showInLibrary`, `isCollectible`, `cardmarketId`, `tcgplayerId`, `parentVariantId`, `set`,
  and nested `card` (the base card: `id`, `name`, `type`, `super`, `colors`, `tags`, …).

**Legends** are entries where `card.type === "Legend"`. A full sweep yields **49 unique legends**
across **121 variants** (deduped on `card.id`).

### 2.4 `POST /decks/export/*` — export helpers

All take a **deck code as input** and are unauthenticated:

| Route | Body | Returns |
|---|---|---|
| `/decks/export/text` | `{ deckCode, chosenChampionId? }` | `{ text: "Legend:\n1 Vex…" }` |
| `/decks/export/tts` | `{ deckCode }` | `{ tts: … }` |
| `/decks/export/image` | `{ deckCode, options }` | image blob (bearer token for premium options) |
| `/decks/export/proxies` | `{ deckCode, … }` | **UNVERIFIED** |
| `/decks/export/registration` | `{ deckCode, … }` | **UNVERIFIED** |

`/decks/export/text` is the **correctness oracle** for our own encoder — see §4.

### 2.5 Other routes seen in the client bundle

Not needed for v1, listed so nobody re-derives them: `/decks/featured`, `/decks/{id}/price`,
`/decks/{id}/likes`, `/decks/{id}/views`, `/decks/{id}/guide`, `/decks/{id}/matchups`,
`/decks/bulk-user-data` (POST — prices/collection), `/profiles/*`, `/collection/*` (auth),
`/notifications/*` (auth), `/admin/*` (auth).

---

## 3. The `legendId` trap

`deck.legend.id` is the **variant** id. `?legendId=` expects the **card** id. Passing the former
returns `total: 0` with no error, which looks exactly like "this legend has no decks".

```
Vex, Gloomist
  card.id    36e91a0c-088c-4222-89c0-5b7c64dcfc43   ← use this for ?legendId=
  variants   UNL-193   26ea9b7f-…
             UNL-232   0f411e0f-…
             UNL-232*  203fc58a-…
```

Filtering by the card id correctly returns decks across **all three art variants** (1718 Vex decks).
This matters for the randomiser: roll on the **49 card ids**, not the 121 variant numbers, or Vex
shows up three times and its decks get split across those entries.

Variant number suffixes: `*` denotes an alternate/"signed" art whose image filename uses `s`
(`UNL-232*` → `.../cards/UNL-232s.webp`).

---

## 4. Deck codes

**No PA endpoint returns a deck code.** The website generates codes **client-side** and passes them
*into* the export endpoints. To ship the "Copy deck code" action we must generate them ourselves.

The codec is plain, unobfuscated logic in PA's public JS bundle. A copy is saved at
[`reference/pa-deckcode-chunk.js`](reference/pa-deckcode-chunk.js) — the live URL
(`/_next/static/chunks/44c_wv8w-tn2_.js`) is content-hashed and **will rotate**, so work from the
saved copy.

### 4.1 Format

LoR-deckcode-style, exactly as plan §2.3 guessed: base32 over a varint byte stream.

```
alphabet    ABCDEFGHIJKLMNOPQRSTUVWXYZ234567   (RFC 4648, no padding)
header byte (format << 4) | version           format = 1, version 3–5 in the wild
SET_MAP     { OGN:0, OGS:1, ARC:2, SFD:3, UNL:4, VEN:5, RAD:6 }
VARIANT_MAP { "":0, a:1, s:2, "*":2, b:3 }
```

Encoder entry point: `getCodeFromDeck(mainDeck, sideboard = [], chosenChampionCardCode?)`
where each entry is `{ cardCode: "UNL-193", count: 3 }`.
Decoder: `getDeckFromCode(code, { signedSuffix = "s" })`.

Version is chosen automatically by the encoder:
- **5** if any main count > 12, any sideboard count > 3, or any `SP`-prefixed card number
- **4** else if any `R`-prefixed card number
- **3** otherwise

v5 encodes counts as explicit `(count, groups…)` pairs; v3/v4 walk fixed buckets from max count
down to 1. v4+ prefixes each card number with a flag byte (`0` plain / `1` `R##` / `2` `SP#`).

`cleanVariantNumber()` must be applied to every card code first: it strips `-Foil` / `-Nexus` /
`-Release` suffixes and remaps SFD reprints to their OGN originals (`SFD-R03` → `OGN-089`, etc.).

### 4.2 Zone mapping — verified

The encoder's `mainDeck` argument is **every non-sideboard zone flattened together**: legend,
runes, battlefields, champions and maindeck. Confirmed by decoding a known-good code:

```
UNL-193 ×1   ← the Legend itself
OGN-042 ×6   ← Rune
OGN-166 ×6   ← Rune
…            ← 3 battlefields ×1, champions, maindeck
chosen = UNL-150 (Vex, Apathetic)
```

`chosenChampion` is passed **in addition** to appearing in the `mainDeck` list, not instead of it.
Round-tripping that code through `POST /decks/export/text` returns a text list whose `MainDeck`
section has exactly 19 entries = 26 decoded entries − 1 legend − 2 runes − 3 battlefields −
1 chosen champion. The mapping holds.

**Open:** where the `bench` zone belongs in the encoding — it was empty on every deck sampled.
Treat a non-empty `bench` as a case to verify before trusting the generated code.

### 4.3 Verification oracle

Because `POST /decks/export/text` accepts any deck code, generated codes can be checked for free:

```bash
curl -s https://piltoverarchive.com/api/external/v1/decks/export/text \
  -H 'content-type: application/json' \
  -d '{"deckCode":"<generated>"}'
```

Compare the returned card names/quantities against the `expandedCards` the code was built from.
Any mismatch means the encoder is wrong. This should be a test, not a manual step.

A verified reference decoder (used to confirm all of the above) is saved at
[`reference/deckcode-decoder.reference.mjs`](reference/deckcode-decoder.reference.mjs).

### 4.4 Card data quirk: not every `variantNumber` is encodable

Encountered building the real snapshot (`scripts/snapshot.ts`), not from manual discovery — worth
recording since it will recur. Some cards carry a `variantNumber` that PA's own `cleanVariantNumber`
doesn't clean and the codec therefore can't encode. Example hit live: the deck
[`de3553de-0389-44d7-9944-4ad9b9bda062`](https://piltoverarchive.com/decks/view/de3553de-0389-44d7-9944-4ad9b9bda062)
records its Legend as `variantNumber: "OGN-263-Worlds"` — a promo art whose `/cards` entry has
`showInLibrary: false` and `imageUrl: "https://cdn.piltoverarchive.com/missing/TeemoWorlds.webp"`
(a placeholder path). `-Worlds` isn't in PA's known-suffix list (`-Foil` / `-Nexus` / `-Release`),
so `cleanVariantNumber("OGN-263-Worlds")` returns it unchanged, and it fails `SET-NUMBERvariant`
parsing (two dashes). PA's own client would presumably hit the same wall — this reads as an
incomplete/broken data row on PA's side, not something to special-case by string suffix.

**Fix:** every `ExpandedCard` (and, one hop via `deck.legend.id` → the `/cards` index, the top-level
`deck.legend` too) carries a stable `cardId` alongside its display `variantNumber`. When a card's
cleaned `variantNumber` doesn't parse as a valid `SET-NUMBERvariant` with a known set/variant (see
`isValidCardCode` in `scripts/lib/deckcode.ts`), resolve it to a sibling variant sharing the same
`cardId` with `showInLibrary: true` instead — implemented as `CardIndex.resolve()` in
`scripts/snapshot.ts`. This is more robust than extending the suffix list: it handles *any* future
promo/preview variant the same way, using identity (`cardId`) rather than string-matching.

---

## 5. Rate limiting & etiquette

No `RateLimit-*` or `Retry-After` headers were observed, and no throttling was hit at ~15 sequential
requests. That is not permission to hammer it. For the snapshot job:

- Sequential requests with a ~150 ms delay (a full run is ~60–120 requests).
- A descriptive `User-Agent` with a contact URL.
- Run on a daily/weekly cron, never per page view.
- `robots.txt` disallows `/api/` for crawlers. Given the `external` naming and the total absence of
  auth this reads as an intentionally public surface, but a courtesy email to
  `management@piltoverarchive.com` before scheduling a recurring job is cheap insurance and may get
  the usage sanctioned outright. **This is a call for the repo owner to make.**

---

## 6. Images

Card art is served from `https://cdn.piltoverarchive.com/cards/{variantNumber}.webp`
(`*` variants use an `s` suffix: `UNL-232s.webp`). Domain/colour icons live at
`https://cdn.piltoverarchive.com/colors/{Domain}.webp`.

The `?width=640` query param currently in `public/data/*.json` was **invented** and is not part of
any observed URL. Use the `imageUrl` the API returns verbatim.

Hotlinking was not load-tested; PA also serves some assets from `piltoverarchive.b-cdn.net`
(BunnyCDN), so a hotlink policy could change. The Riftseer fallback in plan §7 stands.

---

## 7. Rift Atlas

**Not investigated.** Plan §3.2 is still open. The clipboard + toast baseline in plan §2.2 remains
the shipped behaviour, and nothing in this document depends on Rift Atlas.

---

## Plan corrections

| Plan said | Reality |
|---|---|
| §2.1 "No documented public API… internal API" | Public unauthenticated REST API at `/api/external/v1` |
| §3.1 "reverse-engineer… Playwright if Cloudflare forces it" | Plain `fetch` works; no Cloudflare challenge, no auth, no CSRF |
| §2.1 "PA exports deck codes… available on deck pages and via export" | **No endpoint returns a deck code.** We must generate them (§4) |
| §3.1 step 3 "confirm the response includes… deck code" | It does not. Everything else on that list is present via `?expand=cards` |
| §4.1 "filter to public + legal decks" | Public is automatic; legal must be filtered on the `isLegal` field |
| §4.1 "handle private decks (skip)" | Not needed — never returned |
| §3.3 "pull the canonical Legend list" | 49 legends, from `/cards` filtered on `card.type === "Legend"`, deduped on `card.id` |
| §7 "PA blocks the snapshot job (Cloudflare)" — Medium | Low. No protection observed on this API |
| §7 "Deck code from PA not accepted by RA" — Medium | Unchanged, but now *we* own the encoder, so a format mismatch is ours to fix |
