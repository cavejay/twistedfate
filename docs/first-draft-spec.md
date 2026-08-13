# Riftbound Randomiser — First Draft Spec (v0.1)

Companion to [`riftbound-randomiser-plan.md`](../riftbound-randomiser-plan.md). This spec defines exactly what the **first draft** builds, locks the decisions the plan left open, and quarantines everything that depends on discovery (§3 of the plan) so none of it blocks the draft.

**Architecture: fully static website.** No backend, no server-side rendering, no runtime API calls to Piltover Archive or Rift Atlas. The site is HTML/JS/CSS plus two committed JSON files, deployable to any static host.

---

## 1. First-draft scope

### In scope (draft 1)

- Single-page static app: landing screen, GO button, two-stage random pick (Legend → deck), reveal screen.
- The three actions on reveal: **View on Piltover Archive** (new tab), **Copy deck code** (clipboard + toast), **Play** (copy code, then open `https://play.riftatlas.com/` in a new tab, with instruction toast).
- Re-roll everything / re-roll deck only.
- Lightweight animation: CSS-keyframe reel cycle (~1.5s) and card-flip reveal. Enough to prove the sequence and timings; the full §5 animation spec (particles, glow bursts, screen shake) comes later.
- `prefers-reduced-motion` support from day one (skip reels, instant reveal).
- Attribution footer with Riot "Legal Jibber Jabber" disclaimer, crediting Piltover Archive and Rift Atlas.
- **Fixture data**: `data/legends.json` and `data/decks.json` in the final production schema (§3), hand-populated with a small real sample (3–5 Legends, a few decks each) captured manually from PA. The snapshot script consumes and produces the same schema later, so swapping fixtures for real data is a data change, not a code change.

### Out of scope (deferred, with the phase that owns it)

| Deferred item | Owner |
|---|---|
| Automated snapshot script + GitHub Actions cron | Phase 1 |
| Full animation polish (Framer Motion, particles, domain-colour glow) | Phase 3 |
| RA auto-load URL param | Stretch (pending §3.2 discovery) |
| Exclude-recent-rolls memory, filters, share links | Stretch |
| OG/social meta, favicon polish | Phase 4 |

---

## 2. Stack decisions (locked for draft 1)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Vite + React + TypeScript** | Plan's default; no reason to deviate. |
| Styling/animation | **Plain CSS modules + keyframes** for draft 1 | Framer Motion adds a dependency the draft doesn't need yet; the reel and flip are achievable with `transform`/`opacity` keyframes, which is also the mobile-jank-safe subset. Introduce Framer Motion in Phase 3 only if the choreography outgrows CSS. |
| Hosting | **GitHub Pages** via `gh-pages`-style deploy from Actions | Free, static, pairs naturally with the Phase-1 snapshot cron committing data to the same repo. Repo needs `git init` (not yet a repository). |
| Randomness | `crypto.getRandomValues` with rejection sampling (no modulo bias) | Per plan §4.3. |
| Data loading | `fetch('./data/*.json')` at app start, cached in memory | Keeps JSON out of the JS bundle so the cron can update data without a rebuild. |
| Images | Hotlink PA CDN URLs stored in the JSON; `onerror` → local card-back fallback | Per plan §4.2; image base URL lives in the data, not the code, so switching to Riftseer is a pipeline change. |

---

## 3. Data contract

These schemas are the interface between the future snapshot pipeline and the site. Draft 1 ships fixtures conforming to them.

### `data/legends.json`

```json
{
  "generatedAt": "2026-08-13T00:00:00Z",
  "legends": [
    {
      "id": "string — stable ID, PA's legend/card identifier",
      "name": "string — display name",
      "champion": "string",
      "domains": ["string — domain/colour identifiers, drives reveal theming"],
      "imageUrl": "string — full card art URL"
    }
  ]
}
```

### `data/decks.json`

```json
{
  "generatedAt": "2026-08-13T00:00:00Z",
  "source": "piltoverarchive.com",
  "decksByLegend": {
    "<legendId>": [
      {
        "deckId": "string — PA uuid",
        "url": "https://piltoverarchive.com/decks/view/<uuid>",
        "name": "string",
        "author": "string",
        "likes": 0,
        "deckCode": "string — PA export code",
        "textList": "string | null — plain-text decklist fallback (deck-code compat hedge, plan §2.3)",
        "keyCardImageUrls": ["string — 3–5 card art URLs for the fan preview"]
      }
    ]
  }
}
```

Rules the site enforces regardless of data quality:

- A Legend present in `legends.json` but with zero decks in `decksByLegend` is **excluded from the roll pool** (never rolled, never an error).
- Arrays may have fewer than 20 decks; the picker is uniform over whatever exists.
- `keyCardImageUrls` may be empty → reveal renders without the card fan.
- `textList` null → the copy action offers deck code only.

### TypeScript types (`src/lib/types.ts`)

```ts
interface Legend {
  id: string; name: string; champion: string;
  domains: string[]; imageUrl: string;
}
interface DeckEntry {
  deckId: string; url: string; name: string; author: string;
  likes: number; deckCode: string; textList: string | null;
  keyCardImageUrls: string[];
}
interface SnapshotData {
  generatedAt: string;
  legends: Legend[];
  decksByLegend: Record<string, DeckEntry[]>;
}
```

---

## 4. App flow — state machine

One top-level state drives the whole page:

```
idle ──GO──▶ rollingLegend ──(~1.5s)──▶ legendRevealed
                                             │ (auto, ~0.6s pause)
                                             ▼
             deckRevealed ◀──(~0.8s)── rollingDeck
```

- Both picks are computed **synchronously at GO-click time**; animations are pure theatre replaying a foregone result (plan §5.2).
- `deckRevealed` shows the action bar and two re-roll buttons:
  - **Re-roll all** → back to `rollingLegend` with fresh picks.
  - **New deck, same Legend** → `rollingDeck` with a fresh deck pick (uniform over that Legend's decks; if the Legend has only 1 deck, this button is hidden).
- **Error state**: data fetch failure at load → GO button replaced by a retry message. There is no other runtime failure mode (all picks operate on already-loaded data).
- Reduced motion: `rollingLegend`/`rollingDeck` durations drop to 0; states still transition so the code path is identical.

---

## 5. Components

```
App                     — state machine, data loading, pick logic
├── GoButton            — idle screen CTA, pulse animation
├── LegendReel          — cycling card images during rollingLegend
├── LegendReveal        — flipped card, name, domain-colour accent
├── DeckReveal          — deck name, author, likes, key-card fan
│   └── ActionBar       — View on PA / Copy code / Play + re-roll buttons
├── Toast               — clipboard confirmations & instructions
└── Footer              — attribution + Riot disclaimer
```

Library modules: `src/lib/random.ts` (unbiased pick), `src/lib/clipboard.ts` (write + fallback + result signal for the toast), `src/lib/data.ts` (fetch, validate shape, expose roll pool).

---

## 6. Behaviour details

- **Clipboard**: `navigator.clipboard.writeText()`; on rejection (permissions, non-secure context) fall back to a visible read-only `<textarea>` with the code selected and a "copy manually" toast. Every copy attempt yields a toast (success or fallback) — silent failure is the worst outcome for this app.
- **Play button**: copy first, then `window.open('https://play.riftatlas.com/', '_blank', 'noopener')` **synchronously in the click handler** (popup blockers), then toast: "Deck code copied — paste it into Rift Atlas's deck import."
- **New-tab links**: all external links `rel="noopener noreferrer"`.
- **Images**: `loading="lazy"` everywhere except the currently-revealed Legend; `onerror` swaps to bundled `card-back.png`.

## 7. Accessibility

- `prefers-reduced-motion` as above.
- Reveal announcements via an `aria-live="polite"` region ("Rolled: <Legend> — <deck name> by <author>").
- All actions are real `<button>`/`<a>` elements, keyboard-reachable; focus moves to the action bar when the deck reveals.
- Reel animation is `aria-hidden` (it's decorative theatre).

---

## 8. Open questions — parked, not blocking

Each has a fallback already baked into this draft, so discovery can happen in parallel or after:

1. **PA deck code ↔ RA importer compatibility** (plan §2.3). Draft hedge: schema carries `textList`; if discovery says codes differ, ActionBar grows a second copy option — no structural change.
2. **PA CDN base + hotlink tolerance** (plan §3.1). Draft hedge: URLs live in data; card-back fallback covers breakage; Riftseer swap is pipeline-side.
3. **RA auto-load URL param** (plan §3.2). Draft ships the clipboard+toast baseline, which is the plan's guaranteed behaviour anyway.
4. **PA internal endpoint shapes** — only matters for the Phase-1 snapshot script; draft fixtures are hand-captured.

---

## 9. Draft-1 acceptance criteria

1. `npm run build` produces a fully static `dist/` that works served from any static file server, no environment variables, no backend.
2. Click GO → animated Legend roll → Legend reveal → deck reveal, end-to-end under 5 seconds.
3. Deck shown always belongs to the rolled Legend and comes from the fixture data.
4. All three action buttons behave per §6 (PA link correct, copy confirmed by toast, Play opens RA with code on clipboard).
5. Both re-roll paths work; "same Legend" re-roll never changes the Legend.
6. With OS reduced-motion enabled, results appear instantly with no reel.
7. Broken image URL renders the card-back fallback, not a broken-image icon.
8. Footer carries PA/RA credit and the Riot disclaimer.
