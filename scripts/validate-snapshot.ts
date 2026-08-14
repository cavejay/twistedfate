/**
 * Sanity gate for the snapshot job's output, run in CI before the workflow
 * commits anything (see .github/workflows/snapshot.yml). A stale snapshot is
 * far better than a broken one, so this exits non-zero — and commits
 * nothing — on any failure.
 *
 *   npm run snapshot:validate
 */

import { readFile } from 'node:fs/promises'
import type { Legend, DeckEntry } from '../src/lib/types.ts'

const LEGENDS_PATH = new URL('../public/data/legends.json', import.meta.url)
const DECKS_PATH = new URL('../public/data/decks.json', import.meta.url)
const MIN_LEGENDS_WITH_DECKS = 40

const errors: string[] = []

function requireField(condition: boolean, message: string) {
  if (!condition) errors.push(message)
}

async function run() {
  const legendsFile = JSON.parse(await readFile(LEGENDS_PATH, 'utf8')) as { legends: Legend[] }
  const decksFile = JSON.parse(await readFile(DECKS_PATH, 'utf8')) as { decksByLegend: Record<string, DeckEntry[]> }

  requireField(Array.isArray(legendsFile.legends) && legendsFile.legends.length > 0, 'legends.json has no legends')

  for (const legend of legendsFile.legends) {
    const label = legend.id ?? '<missing id>'
    requireField(typeof legend.id === 'string' && legend.id.length > 0, `legend ${label}: missing id`)
    requireField(typeof legend.name === 'string' && legend.name.length > 0, `legend ${label}: missing name`)
    requireField(typeof legend.champion === 'string' && legend.champion.length > 0, `legend ${label}: missing champion`)
    requireField(Array.isArray(legend.domains) && legend.domains.length > 0, `legend ${label}: missing domains`)
    requireField(typeof legend.imageUrl === 'string' && legend.imageUrl.startsWith('http'), `legend ${label}: missing/invalid imageUrl`)
  }

  let legendsWithDecks = 0
  for (const [legendId, decks] of Object.entries(decksFile.decksByLegend)) {
    if (decks.length > 0) legendsWithDecks++
    for (const deck of decks) {
      const label = `${legendId} / ${deck.deckId ?? '<missing deckId>'}`
      requireField(typeof deck.deckId === 'string' && deck.deckId.length > 0, `deck ${label}: missing deckId`)
      requireField(typeof deck.url === 'string' && deck.url.startsWith('https://piltoverarchive.com/decks/view/'), `deck ${label}: missing/invalid url`)
      requireField(typeof deck.deckCode === 'string' && deck.deckCode.length > 0, `deck ${label}: missing deckCode`)
      requireField(
        !!deck.chosenChampion && typeof deck.chosenChampion.name === 'string' && deck.chosenChampion.name.length > 0,
        `deck ${label}: missing chosenChampion.name`,
      )
      requireField(
        !!deck.chosenChampion && typeof deck.chosenChampion.imageUrl === 'string' && deck.chosenChampion.imageUrl.startsWith('http'),
        `deck ${label}: missing chosenChampion.imageUrl`,
      )
    }
  }

  requireField(
    legendsWithDecks >= MIN_LEGENDS_WITH_DECKS,
    `only ${legendsWithDecks} legends have decks — expected at least ${MIN_LEGENDS_WITH_DECKS}`,
  )

  if (errors.length > 0) {
    console.error(`Snapshot validation failed with ${errors.length} error(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exitCode = 1
    return
  }

  console.log(`Snapshot valid: ${legendsFile.legends.length} legends, ${legendsWithDecks} with decks.`)
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
