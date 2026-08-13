import type { DeckEntry, Legend, SnapshotData } from './types'

interface LegendsFile {
  generatedAt: string
  legends: Legend[]
}

interface DecksFile {
  generatedAt: string
  source: string
  decksByLegend: Record<string, DeckEntry[]>
}

const DATA_BASE = import.meta.env.BASE_URL + 'data'

export async function loadSnapshot(): Promise<SnapshotData> {
  const [legendsRes, decksRes] = await Promise.all([
    fetch(`${DATA_BASE}/legends.json`),
    fetch(`${DATA_BASE}/decks.json`),
  ])

  if (!legendsRes.ok || !decksRes.ok) {
    throw new Error('Failed to load roll data')
  }

  const legendsFile = (await legendsRes.json()) as LegendsFile
  const decksFile = (await decksRes.json()) as DecksFile

  if (!Array.isArray(legendsFile.legends) || typeof decksFile.decksByLegend !== 'object') {
    throw new Error('Roll data is malformed')
  }

  return {
    generatedAt: legendsFile.generatedAt,
    legends: legendsFile.legends,
    decksByLegend: decksFile.decksByLegend,
  }
}

/** Legends with at least one deck — the only Legends eligible for the roll. */
export function rollableLegends(data: SnapshotData): Legend[] {
  return data.legends.filter((legend) => (data.decksByLegend[legend.id]?.length ?? 0) > 0)
}

export function decksFor(data: SnapshotData, legendId: string): DeckEntry[] {
  return data.decksByLegend[legendId] ?? []
}
