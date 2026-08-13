# Riftbound Legend & Deck Randomiser — Build Plan

Plan doc for a Claude Code session. Goal: a no-login, single-page site that randomly rolls a Riftbound Legend (with flashy animation), then randomly picks one of the top 20 rated decks for that Legend from Piltover Archive, and hands the user a link + deck code they can take straight into Rift Atlas.

---

## 1. Product summary

**User flow:**
1. Land on page. One big **GO** button. No login, no settings (v1).
2. Click GO → "rolling" animation cycles through Legend art (~1.5–2.5s of fake suspense; the actual pick is instant).
3. Legend revealed with a hero animation (card flip / glow burst).
4. Behind the scenes: pick 1 of the top 20 rated decks for that Legend (Piltover Archive ratings/likes). Short secondary "shuffling" animation, then reveal deck name + author + card preview.
5. Reveal screen offers:
   - **View on Piltover Archive** → `https://piltoverarchive.com/decks/view/{deckId}` (new tab)
   - **Copy deck code** → clipboard (PA deck codes follow a LoR-deckcode-style format adapted for Riftbound)
   - **Play** → opens Rift Atlas in a new tab (`https://play.riftatlas.com/`), and copies the deck code to clipboard on click so the user can paste it into RA's deck import. Bonus goal: auto-load via URL param if RA supports one (see §3.2 discovery task).
6. **Re-roll** buttons: re-roll everything, or re-roll deck only (keep Legend).

**Constraints:**
- No accounts, no server-side user state.
- Must not hammer Piltover Archive on every page load — snapshot the data (see §4).
- Attribution footer: both PA and RA operate under Riot's "Legal Jibber Jabber" policy; this site should carry the same disclaimer and credit PA/RA as data/play sources.

---

## 2. External services — what actually exists

### 2.1 Piltover Archive (piltoverarchive.com)
- **No documented public API.** It's a modern SPA (Next.js-style) with internal JSON endpoints. The deck library (`/decks`) supports filtering by Legend, sorting by trending/likes, and shows like counts — exactly the data we need, but it's an *internal* API.
- Deck detail URLs: `https://piltoverarchive.com/decks/view/{uuid}`.
- Deck codes: PA exports deck codes (their patch notes state deck codes follow the LoR deckcode format adapted for Riftbound). Deck codes are available on deck pages and via export.
- Decks have visibility states (draft/private/public) — only public decks are usable. Some deck views return "private/unavailable"; the snapshot job must handle that.
- Card images: PA serves card art from its own CDN. Exact CDN base URL to be confirmed in discovery (§3.1). Alternative image source: the **Riftseer API** (riftseer.com) resolves Riftbound card data and images and is used by other community tools (e.g. the TTS Riftbound Importer Toolkit) — good fallback if PA's CDN is hostile to hotlinking.

### 2.2 Rift Atlas (riftatlas.com / play.riftatlas.com)
- Fan-made simulator. Play client at `https://play.riftatlas.com/` supports **pasting/importing decklists** before launching a match; deck builder at `https://riftatlas.com/decks`.
- **No documented API** and no confirmed URL parameter for pre-loading a deck code. Treat auto-load as a stretch goal pending discovery (§3.2). The guaranteed-to-work baseline: open RA in a new tab + deck code already on the clipboard + a one-line instruction toast ("Deck code copied — paste it into Rift Atlas's import").

### 2.3 Deck code compatibility — DO NOT ASSUME
PA deck codes are one format; other tools (RiftMana, Riftbound Zone, Riftbound Companion) reference "Piltover Archive V5 deck codes" as a distinct versioned format. **Verify during discovery that the code PA exports is the code RA's importer accepts.** If they differ, fall back to exporting the plain-text decklist (PA also exports text lists) or supporting both copy options.

---

## 3. Discovery tasks (do these FIRST in the Claude Code session)

### 3.1 Reverse-engineer PA's internal deck endpoints
1. Open `https://piltoverarchive.com/decks` with browser devtools (or fetch the page and inspect the JS bundle / network calls via Playwright).
2. Filter by a Legend, sort by rating/likes. Capture the XHR/fetch request: endpoint path, query params (legend id, sort, page size), response shape.
3. Open a deck view page; capture the deck-detail endpoint. Confirm the response includes: deck name, author, like count, deck code (or a separate export endpoint), card list with card IDs.
4. Capture a card image URL to identify the CDN base + naming scheme (likely keyed on card set/number, e.g. `OGN-123`).
5. Note any auth headers, CSRF tokens, or Cloudflare protection. If endpoints require browser context, the snapshot job uses Playwright instead of raw fetch.

### 3.2 Rift Atlas deck import
1. Open `https://play.riftatlas.com/`, walk through deck import manually. Note whether import accepts: deck code, text list, PA URL.
2. Check for URL params (`?deck=`, `?code=`, `?import=`) by inspecting the client bundle or just trying obvious ones. Also check their Discord/docs for a documented share link format.
3. If a param exists → wire the Play button to it. If not → clipboard + toast baseline, and optionally raise a feature request in their Discord.

### 3.3 Legend list
- Pull the canonical Legend list (name, champion, domains/colours, card image) from whatever card endpoint PA exposes, or from Riftseer. This drives the roll animation. There are enough Legends now (OGN/SFD/UNL/Vendetta sets) that this must be data-driven, not hardcoded.

**Record all confirmed endpoints in `docs/endpoints.md` as you find them.**

---

## 4. Architecture

**Recommendation: static frontend + scheduled data snapshot. No live calls to PA from the browser.**

Why: PA's internal API will almost certainly block cross-origin browser requests (CORS), it's undocumented and can change without notice, and hitting it live from every visitor is rude and fragile. A snapshot sidesteps all three.

### 4.1 Data pipeline (snapshot job)
- Node script (Playwright if Cloudflare/CSRF forces it, plain fetch if not) run on a schedule — GitHub Actions cron, daily or weekly.
- For each Legend: query PA's deck library endpoint, sorted by rating/likes, filtered to **public + legal** decks, take top 20.
- For each deck capture: `{ deckId, url, name, author, likes, deckCode, legendCardId, keyCardIds[] }`.
- Output a single `data/decks.json` (plus `data/legends.json`) committed to the repo / deployed as a static asset. Site reads only these files at runtime.
- Handle: private decks (skip), Legends with <20 public decks (take what exists), rate limiting (throttle, sequential requests, identify with a UA string + contact).

### 4.2 Frontend
- **Vite + React** (or Svelte if preferred — React default), TypeScript, static hosting (GitHub Pages / Cloudflare Pages / Netlify). Zero backend at runtime.
- Animation: **Framer Motion** (or Motion One) for the roll/reveal sequences; CSS keyframes for ambient glow/particles. Don't pull in a game engine for this.
- Images: hotlink PA's CDN initially per the brief ("pull from the same place as Piltover pulls them"). Add lazy loading + a local fallback card-back image for broken links. If hotlinking is blocked, switch image base to Riftseer.
- Clipboard: `navigator.clipboard.writeText(deckCode)` with a fallback + visible toast confirmation.
- New-tab opens must be triggered directly from the click handler (popup blockers).

### 4.3 Randomisation
- `crypto.getRandomValues` for the picks. Two-stage: uniform pick over Legends, then uniform pick over that Legend's ≤20 decks.
- Optional (v1.1): exclude-last-N-results memory in `localStorage` so re-rolls feel fresh. **Note: this is Claude Code building the real site — localStorage is fine there; it's only banned inside claude.ai artifacts.**

---

## 5. Animation spec

1. **Idle:** dark themed landing, subtle animated background (drifting rune particles), pulsing GO button.
2. **Roll (Legend):** ~1.8s. Legend cards blur-cycle like a slot reel, decelerating with an ease-out curve; final card snaps in with a flash + screen-shake-lite. Pick is determined *before* the animation starts; the reel is theatre.
3. **Reveal (Legend):** card flip from back to face, glow burst in the Legend's domain colours, name slam-in.
4. **Roll (deck):** ~1s. Deck names/thumbnails riffle like shuffling cards.
5. **Reveal (deck):** panel slides up with deck name, author, like count, a fanned preview of 3–5 key cards, and the three action buttons (View on PA / Copy code / Play).
6. **Reduced motion:** respect `prefers-reduced-motion` — skip reels, instant reveal.
7. Sound is out of scope for v1 (optional muted-by-default flourish later).

---

## 6. Build phases

**Phase 0 — Discovery** (§3). Output: `docs/endpoints.md`, confirmed deck-code compatibility verdict, image CDN scheme.

**Phase 1 — Data pipeline.** Snapshot script + GitHub Action cron + committed `decks.json` / `legends.json`. Validate: every Legend has ≥1 deck, every deck has a working URL and a deck code.

**Phase 2 — Core site.** GO button → random Legend → random deck → reveal screen with the three actions. No fancy animation yet; functional and deployed.

**Phase 3 — Animations.** Full §5 spec. Test on mobile — the reel animation is the likeliest jank source; use transform/opacity only, no layout-thrashing properties.

**Phase 4 — Polish.** Re-roll buttons, reduced-motion, error states (missing image, stale deck link), attribution footer, OG/social meta tags, favicon.

**Stretch:** RA auto-load param if discovered; exclude-recent-rolls; filter toggles (set legality, domain); share-your-roll link (`?legend=x&deck=y`).

---

## 7. Risks & fallbacks

| Risk | Likelihood | Fallback |
|---|---|---|
| PA internal API changes/breaks | Medium (undocumented) | Snapshot architecture means the site keeps working on stale data; fix the scraper, not the site. Playwright scraper as last resort. |
| PA blocks the snapshot job (Cloudflare) | Medium | Playwright with real browser context; slow the crawl; email PA management (management@piltoverarchive.com) — they're community-friendly and may hand over a sanctioned endpoint or data dump. |
| Deck code from PA not accepted by RA | Medium — formats are versioned ("V5") | Also copy plain-text decklist; offer both buttons. |
| Card image hotlinking blocked | Low–Medium | Switch to Riftseer API image URLs; last resort, cache images in the pipeline (mind bandwidth + Riot asset policy). |
| No RA URL param for auto-load | High | Clipboard + toast baseline is already the shipped behaviour; param is a bonus. |
| Set rotation / bans make snapped decks illegal | Ongoing | Snapshot job filters to "Legal" decks; weekly cron keeps it current. |

---

## 8. Repo layout

```
/
├── docs/
│   ├── plan.md            # this file
│   └── endpoints.md       # discovered endpoints (Phase 0 output)
├── scripts/
│   └── snapshot.ts        # PA data snapshot job
├── data/
│   ├── legends.json
│   └── decks.json
├── src/                   # Vite app
│   ├── components/        # GoButton, LegendReel, DeckReveal, ActionBar
│   ├── lib/               # random.ts, clipboard.ts, data.ts
│   └── App.tsx
└── .github/workflows/
    └── snapshot.yml       # cron: refresh data, commit, trigger deploy
```

---

## 9. Definition of done (v1)

- Visiting the site and clicking GO produces an animated Legend roll + reveal, then a deck reveal, in under 5 seconds total.
- The deck shown is genuinely one of the top-20 rated public decks for that Legend per the latest snapshot.
- "View on Piltover Archive" opens the correct deck page.
- "Copy deck code" puts a code on the clipboard that successfully imports into Rift Atlas (manually verified).
- "Play" opens play.riftatlas.com in a new tab with the code already on the clipboard.
- Works on mobile, respects reduced-motion, no login anywhere.
