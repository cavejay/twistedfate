/**
 * Thin, throttled client for Piltover Archive's public
 * `/api/external/v1` surface. See docs/endpoints.md for the API reference
 * this was built against.
 *
 * No CORS headers are sent by PA, so this can only ever run server-side
 * (the snapshot script) — never import this from src/.
 */

const BASE_URL = 'https://piltoverarchive.com/api/external/v1'
const USER_AGENT = 'riftbound-randomiser/0.1 (+https://github.com/cavejay/twistedfate)'
const THROTTLE_MS = 150
const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastRequestAt = 0

async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
  const wait = THROTTLE_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  let attempt = 0
  for (;;) {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init?.headers },
      })
    } catch (err) {
      attempt++
      if (attempt > MAX_RETRIES) throw err
      await sleep(500 * attempt)
      continue
    }

    if (response.ok) return response
    if (response.status < 500 || attempt >= MAX_RETRIES) {
      const body = await response.text().catch(() => '')
      throw new Error(`PA request failed: ${response.status} ${url}\n${body.slice(0, 500)}`)
    }
    attempt++
    await sleep(500 * attempt)
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await throttledFetch(`${BASE_URL}${path}`)
  return (await response.json()) as T
}

// ---- /cards -----------------------------------------------------------

export interface CardColor {
  id: string
  name: string
  imageUrl: string
}

export interface CardVariant {
  id: string
  variantNumber: string
  rarity: string
  imageUrl: string
  showInLibrary: boolean
  isCollectible: boolean
  card: {
    id: string
    name: string
    type: string
    super: string | null
    tags: string[] | null
    colors: CardColor[]
  }
}

interface CardsResponse {
  data: CardVariant[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }
}

export async function fetchAllCardVariants(): Promise<CardVariant[]> {
  const limit = 100
  const first = await getJson<CardsResponse>(`/cards?limit=${limit}&page=1`)
  const all = [...first.data]
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await getJson<CardsResponse>(`/cards?limit=${limit}&page=${page}`)
    all.push(...next.data)
  }
  return all
}

// ---- /decks -------------------------------------------------------------

export interface DeckSummary {
  id: string
  name: string
  authorName: string
  status: string
  views: number
  likes: number
  isLegal: boolean
  legend: { id: string; name: string; variantNumber: string; imageUrl: string }
  sets: { id: string; prefix: string; name: string }[]
}

interface DecksResponse {
  data: DeckSummary[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

/** Top decks for a legend, sorted by likes descending. `legendCardId` must be the card id, not the variant id — see docs/endpoints.md §3. */
export async function fetchTopDecksForLegend(legendCardId: string, limit = 100): Promise<DeckSummary[]> {
  const res = await getJson<DecksResponse>(
    `/decks?legendId=${legendCardId}&sort=likes&order=desc&limit=${limit}&page=1`,
  )
  return res.data
}

export interface ExpandedCard {
  cardId: string
  variantId: string
  variantNumber: string
  quantity?: number
  imageUrl: string
  rarity: string
  card: { id: string; name: string; type: string }
}

export interface DeckDetail {
  id: string
  name: string
  authorName: string
  likes: number
  legend: { id: string; name: string; variantNumber: string; imageUrl: string }
  // No `sets` field here — only the /decks list response (DeckSummary) has
  // it. Confirmed live: this endpoint's key set has no `sets` entry at all.
  expandedCards: {
    champions: ExpandedCard[]
    battlefields: ExpandedCard[]
    runes: ExpandedCard[]
    maindeck: ExpandedCard[]
    sideboard: ExpandedCard[]
    bench: ExpandedCard[]
  }
}

export async function fetchDeckDetail(deckId: string): Promise<DeckDetail> {
  return getJson<DeckDetail>(`/decks/${deckId}?expand=cards`)
}

// ---- /decks/export/text (verification oracle) ---------------------------

export async function exportDeckText(deckCode: string, chosenChampionId?: string): Promise<string> {
  const response = await throttledFetch(`${BASE_URL}/decks/export/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckCode, chosenChampionId }),
  })
  const json = (await response.json()) as { text: string }
  return json.text
}
