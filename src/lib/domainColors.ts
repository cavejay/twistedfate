// Sampled from Piltover Archive's own domain icons (cdn.piltoverarchive.com/colors/{Domain}.webp)
// so the dial matches PA's palette rather than a guess.
const DOMAIN_COLORS: Record<string, string> = {
  Body: '#e87808',
  Calm: '#18a878',
  Chaos: '#684898',
  Fury: '#c82828',
  Mind: '#287898',
  Order: '#c8a808',
}

// Fixed circular order the dial's six wedges are drawn in. Chosen so opposite
// wedges (indices i and i+3) pair up as: Order/Chaos (yellow/purple),
// Mind/Body (blue/orange), Calm/Fury (green/red).
export const DOMAIN_ORDER = ['Order', 'Mind', 'Calm', 'Chaos', 'Body', 'Fury'] as const

const FALLBACK_COLOR = '#c9a44c'

export function domainColor(domain: string | undefined): string {
  if (!domain) return FALLBACK_COLOR
  return DOMAIN_COLORS[domain] ?? FALLBACK_COLOR
}

export function primaryDomainColor(domains: string[]): string {
  return domainColor(domains[0])
}
