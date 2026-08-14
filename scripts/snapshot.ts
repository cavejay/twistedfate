/**
 * Phase 1 data pipeline: pulls the current Legend list and each Legend's
 * top-20 legal decks from Piltover Archive and writes
 * public/data/legends.json + public/data/decks.json in the envelope shape
 * src/lib/data.ts expects. See docs/endpoints.md for the API this is built
 * against and docs/piltover-integration-brief.md for the task this fulfils.
 *
 *   npm run snapshot
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  fetchAllCardVariants,
  fetchTopDecksForLegend,
  fetchDeckDetail,
  type CardVariant,
  type ExpandedCard,
  type DeckSummary,
} from './lib/pa-client.ts'
import { getCodeFromDeck, cleanVariantNumber, isValidCardCode, type CardEntry } from './lib/deckcode.ts'
import type { Legend, DeckEntry } from '../src/lib/types.ts'

const LEGENDS_PATH = new URL('../public/data/legends.json', import.meta.url)
const DECKS_PATH = new URL('../public/data/decks.json', import.meta.url)
const DECKS_PER_LEGEND = 20
const KEY_CARDS_PER_DECK = 5

// Same priority PA's deck-code codec uses (docs/endpoints.md §4.1) — reused
// here only to pick a stable "canonical" art variant per legend, not for
// encoding.
const SET_PRIORITY = ['OGN', 'OGS', 'ARC', 'SFD', 'UNL', 'VEN', 'RAD']
const RARITY_PRIORITY = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Showcase']

interface LegendGroup {
  cardId: string
  name: string
  champion: string
  domains: string[]
  variants: CardVariant[]
}

function groupLegends(variants: CardVariant[]): LegendGroup[] {
  const groups = new Map<string, LegendGroup>()
  for (const variant of variants) {
    if (variant.card.type !== 'Legend') continue
    const cardId = variant.card.id
    if (!groups.has(cardId)) {
      groups.set(cardId, {
        cardId,
        name: variant.card.name,
        champion: variant.card.tags?.[0] ?? variant.card.name.split(',')[0].trim(),
        domains: variant.card.colors.map((c) => c.name),
        variants: [],
      })
    }
    groups.get(cardId)!.variants.push(variant)
  }
  return Array.from(groups.values())
}

/** Lowest-priority set, lowest non-signed, library-visible variant number — stable across runs. */
function canonicalVariant(group: LegendGroup): CardVariant {
  const inLibrary = group.variants.filter((v) => v.showInLibrary)
  const nonSigned = (inLibrary.length > 0 ? inLibrary : group.variants).filter((v) => !v.variantNumber.endsWith('*'))
  const pool = nonSigned.length > 0 ? nonSigned : inLibrary.length > 0 ? inLibrary : group.variants
  return [...pool].sort((a, b) => {
    const setA = SET_PRIORITY.indexOf(a.variantNumber.split('-')[0])
    const setB = SET_PRIORITY.indexOf(b.variantNumber.split('-')[0])
    if (setA !== setB) return setA - setB
    return a.variantNumber.localeCompare(b.variantNumber, undefined, { numeric: true })
  })[0]
}

function toLegend(group: LegendGroup): Legend {
  const variant = canonicalVariant(group)
  return {
    id: group.cardId,
    name: group.name,
    champion: group.champion,
    domains: group.domains,
    imageUrl: variant.imageUrl,
  }
}

function keyCardImageUrls(maindeck: ExpandedCard[]): string[] {
  return [...maindeck]
    .sort((a, b) => {
      const qtyDiff = (b.quantity ?? 0) - (a.quantity ?? 0)
      if (qtyDiff !== 0) return qtyDiff
      return RARITY_PRIORITY.indexOf(b.rarity) - RARITY_PRIORITY.indexOf(a.rarity)
    })
    .slice(0, KEY_CARDS_PER_DECK)
    .map((c) => c.imageUrl)
}

/**
 * Looks up cards by cardId (the stable game-card identity, present on every
 * ExpandedCard and — one hop via variant id — on deck.legend too) so an
 * unencodable display variant can be swapped for a library-legal sibling.
 * See docs/endpoints.md's card-quirks note: some promo/preview variants
 * (e.g. a "-Worlds" suffix PA's own client doesn't clean either, on a
 * showInLibrary:false entry with a placeholder image) aren't valid deck-code
 * inputs at all, even though PA returns them as a deck's card of record.
 */
class CardIndex {
  private byCardId = new Map<string, CardVariant[]>()
  private byVariantId = new Map<string, CardVariant>()

  constructor(variants: CardVariant[]) {
    for (const variant of variants) {
      this.byVariantId.set(variant.id, variant)
      const siblings = this.byCardId.get(variant.card.id) ?? []
      siblings.push(variant)
      this.byCardId.set(variant.card.id, siblings)
    }
  }

  cardIdForVariantId(variantId: string): string | undefined {
    return this.byVariantId.get(variantId)?.card.id
  }

  /** A library-legal sibling for a card that has no valid one of its own. */
  private librarySibling(cardId: string): CardVariant | undefined {
    const siblings = this.byCardId.get(cardId) ?? []
    return siblings.find((v) => v.showInLibrary) ?? siblings[0]
  }

  /** Resolves to an encodable card code, falling back to a library sibling by cardId if the raw variant number isn't one. */
  resolve(rawVariantNumber: string, cardId: string): string {
    const cleaned = cleanVariantNumber(rawVariantNumber)
    if (isValidCardCode(cleaned)) return cleaned
    const fallback = this.librarySibling(cardId)
    if (!fallback) {
      throw new Error(`No encodable variant for card ${cardId} (raw variantNumber: ${rawVariantNumber})`)
    }
    const fallbackCleaned = cleanVariantNumber(fallback.variantNumber)
    console.warn(`  ! resolved unencodable variant '${rawVariantNumber}' -> '${fallbackCleaned}' via cardId ${cardId}`)
    return fallbackCleaned
  }
}

function toCardEntries(cards: ExpandedCard[], index: CardIndex): CardEntry[] {
  return cards.map((c) => ({ cardCode: index.resolve(c.variantNumber, c.cardId), count: c.quantity ?? 1 }))
}

async function buildDeckEntry(summary: DeckSummary, index: CardIndex): Promise<DeckEntry | null> {
  const deckId = summary.id
  // A deck listed a moment ago by the /decks search can 404 on detail fetch —
  // observed live: deleted (or made private) between the two calls. Any
  // failure here — that included — should drop this one deck, not the run.
  let deck: Awaited<ReturnType<typeof fetchDeckDetail>>
  let deckCode: string
  try {
    deck = await fetchDeckDetail(deckId)
    const ec = deck.expandedCards
    const champion = ec.champions[0]
    if (!champion) throw new Error('no champion')

    const legendCardId = index.cardIdForVariantId(deck.legend.id)
    if (!legendCardId) throw new Error(`Legend variant ${deck.legend.id} not found in card index`)

    const mainDeck: CardEntry[] = [
      { cardCode: index.resolve(deck.legend.variantNumber, legendCardId), count: 1 },
      ...toCardEntries(ec.champions, index),
      ...toCardEntries(ec.battlefields, index),
      ...toCardEntries(ec.runes, index),
      ...toCardEntries(ec.maindeck, index),
    ]
    const sideboard = toCardEntries(ec.sideboard, index)
    const chosenChampionCode = index.resolve(champion.variantNumber, champion.cardId)

    deckCode = getCodeFromDeck(mainDeck, sideboard, chosenChampionCode)
  } catch (err) {
    console.warn(`  ! skipping deck ${deckId} — ${(err as Error).message}`)
    return null
  }

  const ec = deck.expandedCards
  const champion = ec.champions[0]!

  return {
    deckId: deck.id,
    url: `https://piltoverarchive.com/decks/view/${deck.id}`,
    name: deck.name,
    author: deck.authorName,
    likes: deck.likes,
    deckCode,
    textList: null,
    keyCardImageUrls: keyCardImageUrls(ec.maindeck),
    chosenChampion: { name: champion.card.name, imageUrl: champion.imageUrl },
    // deck detail (?expand=cards) has no `sets` field — only the /decks list
    // response does, hence pulling it from `summary` here, not `deck`.
    sets: summary.sets.map((s) => s.prefix),
  }
}

async function run() {
  console.log('Fetching card index…')
  const variants = await fetchAllCardVariants()
  const cardIndex = new CardIndex(variants)
  const legendGroups = groupLegends(variants)
  console.log(`Found ${legendGroups.length} unique legends across ${legendGroups.reduce((n, g) => n + g.variants.length, 0)} variants.`)

  const legends = legendGroups.map(toLegend)
  const decksByLegend: Record<string, DeckEntry[]> = {}

  for (const group of legendGroups) {
    console.log(`Legend: ${group.name}`)
    const summaries = await fetchTopDecksForLegend(group.cardId)
    const legal = summaries.filter((d) => d.isLegal).slice(0, DECKS_PER_LEGEND)
    console.log(`  ${summaries.length} public decks, ${legal.length} legal (top ${DECKS_PER_LEGEND})`)
    if (legal.length === 0) continue

    const entries: DeckEntry[] = []
    for (const summary of legal) {
      const entry = await buildDeckEntry(summary, cardIndex)
      if (entry) entries.push(entry)
    }
    if (entries.length > 0) decksByLegend[group.cardId] = entries
  }

  const generatedAt = new Date().toISOString()
  const legendsFile = { generatedAt, legends }
  const decksFile = { generatedAt, source: 'piltoverarchive.com', decksByLegend }

  await writeFile(LEGENDS_PATH, JSON.stringify(legendsFile, null, 2) + '\n')
  await writeFile(DECKS_PATH, JSON.stringify(decksFile, null, 2) + '\n')

  const legendsWithDecks = Object.keys(decksByLegend).length
  const totalDecks = Object.values(decksByLegend).reduce((n, d) => n + d.length, 0)
  console.log(`\nWrote ${legends.length} legends (${legendsWithDecks} with decks) and ${totalDecks} decks.`)
}

// Only run when executed directly (`node scripts/snapshot.ts`), not on import (tests import from this module's siblings, not this file, but this guard keeps it side-effect-free either way).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

export { run }
