export interface Legend {
  id: string
  name: string
  champion: string
  domains: string[]
  imageUrl: string
}

export interface DeckEntry {
  deckId: string
  url: string
  name: string
  author: string
  likes: number
  deckCode: string
  textList: string | null
  keyCardImageUrls: string[]
}

export interface SnapshotData {
  generatedAt: string
  legends: Legend[]
  decksByLegend: Record<string, DeckEntry[]>
}

export interface Roll {
  legend: Legend
  deck: DeckEntry
}
