// Reference port of Piltover Archive's `getDeckFromCode`, ported from
// ./pa-deckcode-chunk.js and verified on 2026-08-13 against a known-good code
// (see ../endpoints.md §4.2).
//
//   node deckcode-decoder.reference.mjs "<deck code>"
//
// This is a REFERENCE, not the implementation: it is decode-only, has no types
// and no tests. The real thing belongs in scripts/lib/deckcode.ts with both
// directions. Keep it around as an oracle to diff against.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const SET_MAP = { OGN: 0, OGS: 1, ARC: 2, SFD: 3, UNL: 4, VEN: 5, RAD: 6 }
const VARIANT_MAP = { '': 0, a: 1, s: 2, '*': 2, b: 3 }
const setOf = (n) => Object.entries(SET_MAP).find(([, v]) => v === n)?.[0]
const varOf = (n) => Object.entries(VARIANT_MAP).find(([, v]) => v === n)?.[0]

class Buf {
  constructor(bytes) { this.bytes = Uint8Array.from(bytes) }
  popVarint() {
    let r = 0, shift = 0, used = 0
    for (let i = 0; i < this.bytes.length; i++) {
      used++
      r |= (this.bytes[i] & 127) << shift
      if ((this.bytes[i] & 128) !== 128) { this.bytes = this.bytes.slice(used); return r }
      shift += 7
    }
    throw new Error('bad varint')
  }
  get(i) { return this.bytes[i] }
  slice(a, b) { this.bytes = this.bytes.slice(a, b) }
}

function b32decode(s) {
  const out = []; let r = 0, bits = 0
  for (const ch of s) {
    const v = B32.indexOf(ch.toUpperCase())
    if (v === -1) throw new Error('bad char ' + ch)
    r = (r << 5) | v; bits += 5
    while (bits >= 8) { bits -= 8; out.push((r >> bits) & 255) }
  }
  return out
}

// v5 group reader (function `f` in the bundle)
function readV5(buf, signed, hasPrefix) {
  const cards = []
  const nCounts = buf.popVarint()
  for (let i = 0; i < nCounts; i++) {
    const count = buf.popVarint()
    const nGroups = buf.popVarint()
    for (let g = 0; g < nGroups; g++) {
      const nCards = buf.popVarint()
      const setCode = buf.get(0), variantCode = buf.get(1)
      buf.slice(2)
      const set = setOf(setCode)
      const variant = variantCode === 2 ? signed : varOf(variantCode)
      for (let c = 0; c < nCards; c++) {
        let num
        if (hasPrefix) {
          const flag = buf.get(0); buf.slice(1)
          const v = buf.popVarint()
          num = flag === 2 ? `SP${v}` : flag === 1 ? `R${String(v).padStart(2, '0')}` : String(v).padStart(3, '0')
        } else {
          num = String(buf.popVarint()).padStart(3, '0')
        }
        cards.push({ cardCode: `${set}-${num}${variant || ''}`, count })
      }
    }
  }
  return cards
}

// pre-v5 group reader (function `d` in the bundle): fixed count buckets maxCount..1
function readLegacy(buf, maxCount, signed, version) {
  const cards = []
  for (let count = maxCount; count >= 1; count--) {
    const nGroups = buf.popVarint()
    for (let g = 0; g < nGroups; g++) {
      const nCards = buf.popVarint()
      const setCode = buf.get(0), variantCode = buf.get(1)
      buf.slice(2)
      const set = setOf(setCode)
      const variant = variantCode === 2 ? signed : varOf(variantCode)
      for (let c = 0; c < nCards; c++) {
        let num
        if (version >= 4) {
          const flag = buf.get(0); buf.slice(1)
          const v = buf.popVarint()
          num = flag === 1 ? `R${String(v).padStart(2, '0')}` : String(v).padStart(3, '0')
        } else {
          num = String(buf.popVarint()).padStart(3, '0')
        }
        cards.push({ cardCode: `${set}-${num}${variant || ''}`, count })
      }
    }
  }
  return cards
}

const code = process.argv[2]
const buf = new Buf(b32decode(code))
const head = buf.get(0); buf.slice(1)
const format = (head >> 4) & 15, version = head & 15
let hasPrefix
if (version >= 5) { const f = buf.get(0); buf.slice(1); hasPrefix = f === 1 } else { hasPrefix = version >= 4 }
let mainDeck, sideboard
if (version >= 5) {
  mainDeck = readV5(buf, 's', hasPrefix)
  sideboard = readV5(buf, 's', hasPrefix)
} else {
  mainDeck = readLegacy(buf, 12, 's', version)
  sideboard = version >= 2 ? readLegacy(buf, 3, 's', version) : []
}
let chosen
if (version < 3) { console.log(JSON.stringify({ format, version, mainDeck, sideboard }, null, 1)); process.exit(0) }
const flag = buf.get(0); buf.slice(1)
if (flag === 1) {
  const setCode = buf.get(0), variantCode = buf.get(1); buf.slice(2)
  let num
  if (hasPrefix) {
    const pf = buf.get(0); buf.slice(1); const v = buf.popVarint()
    num = pf === 2 ? `SP${v}` : pf === 1 ? `R${String(v).padStart(2, '0')}` : String(v).padStart(3, '0')
  } else num = String(buf.popVarint()).padStart(3, '0')
  chosen = `${setOf(setCode)}-${num}${(variantCode === 2 ? 's' : varOf(variantCode)) || ''}`
}
console.log(JSON.stringify({ format, version, hasPrefix, mainDeck, sideboard, chosen }, null, 1))
