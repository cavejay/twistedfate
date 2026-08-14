/**
 * Port of Piltover Archive's deck-code codec (`getCodeFromDeck` /
 * `getDeckFromCode`), reverse-engineered from their public bundle chunk
 * (see docs/reference/pa-deckcode-chunk.js, a saved copy — the live URL is
 * content-hashed and rotates). Format documented in docs/endpoints.md §4.
 *
 * Base32 (RFC 4648, no padding) over a varint byte stream. Header byte is
 * (format << 4) | version. Version 3/4 encode fixed count buckets from 12
 * (mainDeck) / 3 (sideboard) down to 1; version 5 encodes explicit
 * (count, groups) pairs and is used once any count exceeds those caps or an
 * `SP`-prefixed card number appears anywhere in the deck.
 */

export interface CardEntry {
  cardCode: string
  count: number
}

export interface DecodedDeck {
  mainDeck: CardEntry[]
  sideboard: CardEntry[]
  chosenChampion?: string
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const SET_MAP: Record<string, number> = { OGN: 0, OGS: 1, ARC: 2, SFD: 3, UNL: 4, VEN: 5, RAD: 6 }
const VARIANT_MAP: Record<string, number> = { '': 0, a: 1, s: 2, '*': 2, b: 3 }

const SET_BY_CODE = new Map(Object.entries(SET_MAP).map(([k, v]) => [v, k]))
// Decode always emits the "signed" variant using the caller's signedSuffix, so
// code 2 (a/s/* all encode to 2) is handled separately from this map.
const VARIANT_BY_CODE = new Map(
  Object.entries(VARIANT_MAP)
    .filter(([k]) => k !== '*' && k !== 's')
    .map(([k, v]) => [v, k]),
)

/** SFD reprint card numbers that are aliases of their OGN originals. */
const SFD_REPRINT_MAP: Record<string, string> = {
  'SFD-R01': 'OGN-007',
  'SFD-R01a': 'OGN-007a',
  'SFD-R02': 'OGN-042',
  'SFD-R02a': 'OGN-042a',
  'SFD-R03': 'OGN-089',
  'SFD-R03a': 'OGN-089a',
  'SFD-R04': 'OGN-126',
  'SFD-R04a': 'OGN-126a',
  'SFD-R05': 'OGN-166',
  'SFD-R05a': 'OGN-166a',
  'SFD-R06': 'OGN-214',
  'SFD-R06a': 'OGN-214a',
}

export function cleanVariantNumber(variantNumber: string): string {
  const stripped = variantNumber.replace(/-Foil$/, '').replace(/-Nexus$/, '').replace(/-Release$/, '')
  return SFD_REPRINT_MAP[stripped] ?? stripped
}

/**
 * Whether a card code is well-formed *and* uses a known set/variant — i.e.
 * safe to pass to getCodeFromDeck. PA's own client only ever encodes codes
 * it generated itself, so it never needed this check; we need it because we
 * encode whatever variantNumber the API hands us, including promo/preview
 * entries PA's own `cleanVariantNumber` doesn't recognise (e.g. a "-Worlds"
 * suffix, seen on a showInLibrary:false Legend variant with a placeholder
 * "/missing/" image — see docs/endpoints.md). Callers should resolve such
 * cards to a library sibling by cardId before encoding; see
 * scripts/snapshot.ts's `resolveCardCode`.
 */
export function isValidCardCode(cardCode: string): boolean {
  try {
    const { set, variant } = parseCardCode(cardCode)
    return set in SET_MAP && variant in VARIANT_MAP
  } catch {
    return false
  }
}

interface ParsedCardCode {
  set: string
  number: string
  variant: string
}

function parseCardCode(cardCode: string): ParsedCardCode {
  const parts = cardCode.split('-')
  if (parts.length !== 2) {
    throw new Error(`Invalid card code format: ${cardCode}. Expected format: SET-NUMBERvariant`)
  }
  const [set, rest] = parts
  if (!set || !rest) {
    throw new Error(`Invalid card code format: ${cardCode}. Missing set or card number.`)
  }
  const match = rest.match(/^((?:R|SP)?\d+)([a-z*]?)$/)
  if (!match) {
    throw new Error(`Invalid card code format: ${cardCode}. Expected format: SET-NUMBERvariant`)
  }
  return { set, number: match[1] ?? '', variant: match[2] ?? '' }
}

interface CardGroup {
  set: number
  variant: number
  cardNumbers: string[]
}

/** Groups entries (already filtered to one count) by (set, variant). */
function groupCards(entries: CardEntry[]): CardGroup[] {
  const groups = new Map<string, CardGroup>()
  for (const entry of entries) {
    const { set, number, variant } = parseCardCode(entry.cardCode)
    const key = `${set}-${variant}`
    if (!groups.has(key)) {
      const setCode = SET_MAP[set]
      if (setCode === undefined) {
        throw new Error(`Unknown set: ${set}. Valid sets: ${Object.keys(SET_MAP).join(', ')}`)
      }
      const variantCode = VARIANT_MAP[variant]
      if (variantCode === undefined) {
        throw new Error(`Unknown variant: '${variant}'. Valid variants: ${Object.keys(VARIANT_MAP).join(', ')}`)
      }
      groups.set(key, { set: setCode, variant: variantCode, cardNumbers: [] })
    }
    groups.get(key)!.cardNumbers.push(number)
  }
  return Array.from(groups.values())
    .sort((a, b) => (a.set !== b.set ? a.set - b.set : a.variant - b.variant))
    .map((g) => ({ ...g, cardNumbers: [...g.cardNumbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }))
}

function setNameOf(code: number): string {
  const name = SET_BY_CODE.get(code)
  if (name === undefined) throw new Error(`Unknown set code: ${code}`)
  return name
}

function variantSuffixOf(code: number, signedSuffix: string): string {
  return code === 2 ? signedSuffix : VARIANT_BY_CODE.get(code) ?? ''
}

// ---- varint byte stream --------------------------------------------------

const ALL_BUT_MSB = 127
const JUST_MSB = 128

function pushVarint(out: number[], value: number): void {
  if (value === 0) {
    out.push(0)
    return
  }
  let v = value
  while (v !== 0) {
    let byte = v & ALL_BUT_MSB
    v >>>= 7
    if (v !== 0) byte |= JUST_MSB
    out.push(byte)
  }
}

class ByteReader {
  private bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get(index: number): number {
    if (index < 0 || index >= this.bytes.length) {
      throw new Error(`Index out of bounds: ${index}`)
    }
    return this.bytes[index]
  }

  /** Drop `count` bytes from the front. */
  advance(count: number): void {
    this.bytes = this.bytes.slice(count)
  }

  popVarint(): number {
    let result = 0
    let shift = 0
    for (let i = 0; i < this.bytes.length; i++) {
      const byte = this.bytes[i]
      result |= (byte & ALL_BUT_MSB) << shift
      if ((byte & JUST_MSB) !== JUST_MSB) {
        this.bytes = this.bytes.slice(i + 1)
        return result
      }
      shift += 7
    }
    throw new Error('Byte array did not contain valid varints.')
  }
}

// ---- base32 ---------------------------------------------------------------

function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += B32_ALPHABET[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) {
    buffer <<= 5 - bits
    out += B32_ALPHABET[buffer & 31]
  }
  return out
}

function base32Decode(code: string): Uint8Array {
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of code) {
    const value = B32_ALPHABET.indexOf(ch.toUpperCase())
    if (value === -1) throw new Error(`Invalid character in deck code: '${ch}'`)
    buffer = (buffer << 5) | value
    bits += 5
    while (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 255)
    }
  }
  return Uint8Array.from(out)
}

// ---- legacy (v3/v4) bucket codec: fixed counts maxCount..1 ----------------

function encodeLegacyBucket(entries: CardEntry[], maxCount: number, version: number): number[] {
  const out: number[] = []
  for (let count = maxCount; count >= 1; count--) {
    const groups = groupCards(entries.filter((e) => e.count === count))
    pushVarint(out, groups.length)
    for (const group of groups) {
      pushVarint(out, group.cardNumbers.length)
      out.push(group.set)
      out.push(group.variant)
      for (const number of group.cardNumbers) {
        if (version >= 4 && number.startsWith('R')) {
          out.push(1)
          pushVarint(out, parseInt(number.slice(1), 10))
        } else if (version >= 4) {
          out.push(0)
          pushVarint(out, parseInt(number, 10))
        } else {
          pushVarint(out, parseInt(number, 10))
        }
      }
    }
  }
  return out
}

function decodeLegacyBucket(reader: ByteReader, maxCount: number, signedSuffix: string, version: number): CardEntry[] {
  const cards: CardEntry[] = []
  for (let count = maxCount; count >= 1; count--) {
    const groupCount = reader.popVarint()
    for (let g = 0; g < groupCount; g++) {
      const cardCount = reader.popVarint()
      const setCode = reader.get(0)
      const variantCode = reader.get(1)
      reader.advance(2)
      const set = setNameOf(setCode)
      const variant = variantSuffixOf(variantCode, signedSuffix)
      for (let c = 0; c < cardCount; c++) {
        let number: string
        if (version >= 4) {
          const flag = reader.get(0)
          reader.advance(1)
          const value = reader.popVarint()
          number = flag === 1 ? `R${String(value).padStart(2, '0')}` : String(value).padStart(3, '0')
        } else {
          number = String(reader.popVarint()).padStart(3, '0')
        }
        cards.push({ cardCode: `${set}-${number}${variant}`, count })
      }
    }
  }
  return cards
}

// ---- v5 bucket codec: explicit (count, groups) pairs -----------------------

function encodeV5Bucket(entries: CardEntry[], hasPrefix: boolean): number[] {
  const out: number[] = []
  const counts = Array.from(new Set(entries.filter((e) => e.count >= 1).map((e) => e.count))).sort((a, b) => b - a)
  pushVarint(out, counts.length)
  for (const count of counts) {
    pushVarint(out, count)
    const groups = groupCards(entries.filter((e) => e.count === count))
    pushVarint(out, groups.length)
    for (const group of groups) {
      pushVarint(out, group.cardNumbers.length)
      out.push(group.set)
      out.push(group.variant)
      for (const number of group.cardNumbers) {
        if (hasPrefix && number.startsWith('SP')) {
          out.push(2)
          pushVarint(out, parseInt(number.slice(2), 10))
        } else if (hasPrefix && number.startsWith('R')) {
          out.push(1)
          pushVarint(out, parseInt(number.slice(1), 10))
        } else if (hasPrefix) {
          out.push(0)
          pushVarint(out, parseInt(number, 10))
        } else {
          pushVarint(out, parseInt(number, 10))
        }
      }
    }
  }
  return out
}

function decodeV5Bucket(reader: ByteReader, signedSuffix: string, hasPrefix: boolean): CardEntry[] {
  const cards: CardEntry[] = []
  const countBuckets = reader.popVarint()
  for (let i = 0; i < countBuckets; i++) {
    const count = reader.popVarint()
    const groupCount = reader.popVarint()
    for (let g = 0; g < groupCount; g++) {
      const cardCount = reader.popVarint()
      const setCode = reader.get(0)
      const variantCode = reader.get(1)
      reader.advance(2)
      const set = setNameOf(setCode)
      const variant = variantSuffixOf(variantCode, signedSuffix)
      for (let c = 0; c < cardCount; c++) {
        let number: string
        if (!hasPrefix) {
          number = String(reader.popVarint()).padStart(3, '0')
        } else {
          const flag = reader.get(0)
          reader.advance(1)
          const value = reader.popVarint()
          if (flag === 2) number = `SP${value}`
          else if (flag === 1) number = `R${String(value).padStart(2, '0')}`
          else if (flag === 0) number = String(value).padStart(3, '0')
          else throw new Error(`Unknown number-prefix flag: ${flag}`)
        }
        cards.push({ cardCode: `${set}-${number}${variant}`, count })
      }
    }
  }
  return cards
}

// ---- public API -------------------------------------------------------

const FORMAT = 1

export function getCodeFromDeck(mainDeck: CardEntry[], sideboard: CardEntry[] = [], chosenChampion?: string): string {
  for (const entry of [...mainDeck, ...sideboard]) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 1) {
      throw new Error(`Invalid card count for ${entry.cardCode}: ${entry.count}. Count must be a positive integer.`)
    }
  }

  const isRune = (cardCode: string) => parseCardCode(cardCode).number.startsWith('R')
  const isSpecial = (cardCode: string) => parseCardCode(cardCode).number.startsWith('SP')

  const hasRune =
    mainDeck.some((e) => isRune(e.cardCode)) ||
    sideboard.some((e) => isRune(e.cardCode)) ||
    (chosenChampion !== undefined && isRune(chosenChampion))
  const hasSpecial =
    mainDeck.some((e) => isSpecial(e.cardCode)) ||
    sideboard.some((e) => isSpecial(e.cardCode)) ||
    (chosenChampion !== undefined && isSpecial(chosenChampion))

  const maxMain = mainDeck.reduce((max, e) => Math.max(max, e.count), 0)
  const maxSide = sideboard.reduce((max, e) => Math.max(max, e.count), 0)

  const version = maxMain > 12 || maxSide > 3 || hasSpecial ? 5 : hasRune ? 4 : 3
  const hasPrefix = hasRune || hasSpecial

  const bytes: number[] = [(FORMAT << 4) | version]

  if (version >= 5) {
    bytes.push(hasPrefix ? 1 : 0)
    bytes.push(...encodeV5Bucket(mainDeck, hasPrefix))
    bytes.push(...encodeV5Bucket(sideboard, hasPrefix))
  } else {
    bytes.push(...encodeLegacyBucket(mainDeck, 12, version))
    bytes.push(...encodeLegacyBucket(sideboard, 3, version))
  }

  if (chosenChampion !== undefined) {
    const { set, number, variant } = parseCardCode(chosenChampion)
    const setCode = SET_MAP[set]
    if (setCode === undefined) {
      throw new Error(`Unknown set in chosen champion: ${set}. Valid sets: ${Object.keys(SET_MAP).join(', ')}`)
    }
    const variantCode = VARIANT_MAP[variant]
    if (variantCode === undefined) {
      throw new Error(`Unknown variant in chosen champion: '${variant}'. Valid variants: ${Object.keys(VARIANT_MAP).join(', ')}`)
    }
    bytes.push(1, setCode, variantCode)
    if (hasPrefix && number.startsWith('SP')) {
      bytes.push(2)
      pushVarint(bytes, parseInt(number.slice(2), 10))
    } else if (hasPrefix && number.startsWith('R')) {
      bytes.push(1)
      pushVarint(bytes, parseInt(number.slice(1), 10))
    } else {
      if (hasPrefix) bytes.push(0)
      pushVarint(bytes, parseInt(number, 10))
    }
  } else {
    bytes.push(0)
  }

  return base32Encode(Uint8Array.from(bytes))
}

export function getDeckFromCode(code: string, opts: { signedSuffix?: string } = {}): DecodedDeck {
  const signedSuffix = opts.signedSuffix ?? 's'
  const reader = new ByteReader(base32Decode(code))

  const head = reader.get(0)
  reader.advance(1)
  const format = (head >> 4) & 15
  const version = head & 15
  if (format !== FORMAT) throw new Error(`Unsupported format: ${format}. Expected format: ${FORMAT}`)
  if (version > 5) throw new Error(`Unsupported version: ${version}. Maximum supported version: 5`)

  let hasPrefix: boolean
  if (version >= 5) {
    const flag = reader.get(0)
    reader.advance(1)
    if (flag > 1) throw new Error(`Unsupported deck prefix flag: ${flag}`)
    hasPrefix = flag === 1
  } else {
    hasPrefix = version >= 4
  }

  let mainDeck: CardEntry[]
  let sideboard: CardEntry[]
  if (version >= 5) {
    mainDeck = decodeV5Bucket(reader, signedSuffix, hasPrefix)
    sideboard = decodeV5Bucket(reader, signedSuffix, hasPrefix)
  } else {
    mainDeck = decodeLegacyBucket(reader, 12, signedSuffix, version)
    sideboard = version >= 2 ? decodeLegacyBucket(reader, 3, signedSuffix, version) : []
  }

  let chosenChampion: string | undefined
  if (version >= 3) {
    const flag = reader.get(0)
    reader.advance(1)
    if (flag === 1) {
      const setCode = reader.get(0)
      const variantCode = reader.get(1)
      reader.advance(2)
      let number: string
      if (hasPrefix) {
        const numFlag = reader.get(0)
        reader.advance(1)
        const value = reader.popVarint()
        if (numFlag === 2) number = `SP${value}`
        else if (numFlag === 1) number = `R${String(value).padStart(2, '0')}`
        else number = String(value).padStart(3, '0')
      } else {
        number = String(reader.popVarint()).padStart(3, '0')
      }
      chosenChampion = `${setNameOf(setCode)}-${number}${variantSuffixOf(variantCode, signedSuffix)}`
    }
  }

  return { mainDeck, sideboard, chosenChampion }
}
