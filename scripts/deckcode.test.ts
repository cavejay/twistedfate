import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getCodeFromDeck, getDeckFromCode, cleanVariantNumber, type CardEntry } from './lib/deckcode.ts'
import { fetchDeckDetail, exportDeckText } from './lib/pa-client.ts'

const LIVE = process.env.PA_LIVE === '1'

function sortEntries(entries: CardEntry[]): CardEntry[] {
  return [...entries].sort((a, b) => a.cardCode.localeCompare(b.cardCode) || a.count - b.count)
}

function assertSameCards(actual: CardEntry[], expected: CardEntry[], label: string) {
  assert.deepEqual(sortEntries(actual), sortEntries(expected), label)
}

// ---- cleanVariantNumber ---------------------------------------------------

test('cleanVariantNumber strips suffixes', () => {
  assert.equal(cleanVariantNumber('OGN-123-Foil'), 'OGN-123')
  assert.equal(cleanVariantNumber('OGN-123-Nexus'), 'OGN-123')
  assert.equal(cleanVariantNumber('OGN-123-Release'), 'OGN-123')
})

test('cleanVariantNumber remaps SFD reprints to their OGN originals', () => {
  assert.equal(cleanVariantNumber('SFD-R01'), 'OGN-007')
  assert.equal(cleanVariantNumber('SFD-R03a'), 'OGN-089a')
  assert.equal(cleanVariantNumber('SFD-R06'), 'OGN-214')
})

test('cleanVariantNumber passes through anything else unchanged', () => {
  assert.equal(cleanVariantNumber('UNL-193'), 'UNL-193')
  assert.equal(cleanVariantNumber('UNL-232*'), 'UNL-232*')
})

// ---- offline round-trip, one fixture per encoder version -------------------

test('round-trips a v3 deck (plain numbers, small counts)', () => {
  const mainDeck: CardEntry[] = [
    { cardCode: 'UNL-193', count: 1 }, // legend
    { cardCode: 'OGN-042', count: 6 }, // rune
    { cardCode: 'OGN-166', count: 6 }, // rune
    { cardCode: 'UNL-141', count: 3 },
    { cardCode: 'OGN-073', count: 3 },
    { cardCode: 'OGN-066', count: 2 },
  ]
  const sideboard: CardEntry[] = [
    { cardCode: 'SFD-032', count: 2 },
    { cardCode: 'UNL-143', count: 2 },
  ]
  const code = getCodeFromDeck(mainDeck, sideboard, 'UNL-150')
  const decoded = getDeckFromCode(code)
  assertSameCards(decoded.mainDeck, mainDeck, 'mainDeck')
  assertSameCards(decoded.sideboard, sideboard, 'sideboard')
  assert.equal(decoded.chosenChampion, 'UNL-150')
})

test('round-trips a v4 deck (R-prefixed card number forces the prefix flag)', () => {
  const mainDeck: CardEntry[] = [
    { cardCode: 'OGN-R05', count: 3 },
    { cardCode: 'UNL-042', count: 2 },
  ]
  const sideboard: CardEntry[] = [{ cardCode: 'SFD-136', count: 1 }]
  const code = getCodeFromDeck(mainDeck, sideboard, 'UNL-193')
  const decoded = getDeckFromCode(code)
  assertSameCards(decoded.mainDeck, mainDeck, 'mainDeck')
  assertSameCards(decoded.sideboard, sideboard, 'sideboard')
  assert.equal(decoded.chosenChampion, 'UNL-193')
})

test('round-trips a v5 deck (SP-prefixed card number)', () => {
  const mainDeck: CardEntry[] = [
    { cardCode: 'ARC-SP1', count: 3 },
    { cardCode: 'UNL-042', count: 2 },
  ]
  const sideboard: CardEntry[] = [{ cardCode: 'SFD-136', count: 1 }]
  const code = getCodeFromDeck(mainDeck, sideboard, 'UNL-193')
  const decoded = getDeckFromCode(code)
  assertSameCards(decoded.mainDeck, mainDeck, 'mainDeck')
  assertSameCards(decoded.sideboard, sideboard, 'sideboard')
})

test('round-trips a v5 deck forced by a mainDeck count over 12', () => {
  const mainDeck: CardEntry[] = [
    { cardCode: 'OGN-042', count: 20 },
    { cardCode: 'UNL-042', count: 2 },
  ]
  const code = getCodeFromDeck(mainDeck, [])
  const decoded = getDeckFromCode(code)
  assertSameCards(decoded.mainDeck, mainDeck, 'mainDeck')
})

test('round-trips a v5 deck forced by a sideboard count over 3', () => {
  const mainDeck: CardEntry[] = [{ cardCode: 'OGN-042', count: 2 }]
  const sideboard: CardEntry[] = [{ cardCode: 'UNL-042', count: 5 }]
  const code = getCodeFromDeck(mainDeck, sideboard)
  const decoded = getDeckFromCode(code)
  assertSameCards(decoded.sideboard, sideboard, 'sideboard')
})

test('round-trips with no chosen champion', () => {
  const mainDeck: CardEntry[] = [{ cardCode: 'OGN-042', count: 2 }]
  const code = getCodeFromDeck(mainDeck)
  const decoded = getDeckFromCode(code)
  assert.equal(decoded.chosenChampion, undefined)
})

test('rejects a non-positive-integer count', () => {
  assert.throws(() => getCodeFromDeck([{ cardCode: 'OGN-042', count: 0 }]))
  assert.throws(() => getCodeFromDeck([{ cardCode: 'OGN-042', count: 1.5 }]))
})

// ---- known-good code from docs/endpoints.md §4.2 --------------------------

test('decodes the documented known-good v3 code from Piltover Archive', () => {
  const code =
    'CMAAAAAAAAAACAQAAAVKMAIAAABQGAAAFU5ESAIDACAACAYEAASCVDIBAMBAAACCVEAQCAYAQUAQGBAAQAAYMAOCAEBQGAAAFOWQDIACAQBQBCABSEA5OAO3AECAIABJHSLADQIBAABACAYAEAAQIAEPAEBACAAAVQAQGAYAFMWYQAIBAQAJMAI'
  const decoded = getDeckFromCode(code)
  assert.equal(decoded.chosenChampion, 'UNL-150')
  assert.equal(decoded.mainDeck.length, 26)
  assert.equal(decoded.sideboard.length, 6)
  const rune1 = decoded.mainDeck.find((e) => e.cardCode === 'OGN-042')
  const rune2 = decoded.mainDeck.find((e) => e.cardCode === 'OGN-166')
  assert.equal(rune1?.count, 6)
  assert.equal(rune2?.count, 6)
  assert.deepEqual(decoded.mainDeck.find((e) => e.cardCode === 'UNL-193'), { cardCode: 'UNL-193', count: 1 })

  assert.equal(getCodeFromDeck(decoded.mainDeck, decoded.sideboard, decoded.chosenChampion), code)
})

// ---- oracle: build a code from a live deck and check PA accepts it --------
// Run with `PA_LIVE=1 npm test`. Skipped by default so `npm test` stays offline.

const oracleDeckIds = ['99f9a2a9-b0fd-4399-bdfd-4327a030c6e3', '9075f870-efed-4304-b2e8-2f49d5da753a']

for (const deckId of oracleDeckIds) {
  test(`generated code for live deck ${deckId} matches PA's own export/text`, { skip: !LIVE }, async () => {
    const deck = await fetchDeckDetail(deckId)
    const ec = deck.expandedCards

    const toEntries = (zone: keyof typeof ec): CardEntry[] =>
      ec[zone].map((c) => ({ cardCode: cleanVariantNumber(c.variantNumber), count: c.quantity ?? 1 }))

    const mainDeck: CardEntry[] = [
      { cardCode: cleanVariantNumber(deck.legend.variantNumber), count: 1 },
      ...toEntries('champions'),
      ...toEntries('battlefields'),
      ...toEntries('runes'),
      ...toEntries('maindeck'),
    ]
    const sideboard = toEntries('sideboard')
    const chosenChampion = ec.champions[0] ? cleanVariantNumber(ec.champions[0].variantNumber) : undefined

    const code = getCodeFromDeck(mainDeck, sideboard, chosenChampion)
    const text = await exportDeckText(code)

    assert.match(text, new RegExp(`Legend:\\n1 ${escapeRegExp(deck.legend.name)}`))
    if (chosenChampion) {
      const championName = ec.champions[0].card.name
      assert.match(text, new RegExp(`Champion:\\n1 ${escapeRegExp(championName)}`))
    }
    for (const battlefield of ec.battlefields) {
      assert.match(text, new RegExp(`1 ${escapeRegExp(battlefield.card.name)}`))
    }
    for (const rune of ec.runes) {
      // card.name is already e.g. "Calm Rune" — no extra suffix needed.
      assert.match(text, new RegExp(`${rune.quantity} ${escapeRegExp(rune.card.name)}`))
    }
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
