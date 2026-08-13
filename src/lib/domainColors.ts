const DOMAIN_COLORS: Record<string, string> = {
  Calm: '#4fb8c4',
  Chaos: '#d1495b',
  Mind: '#7c5cbf',
  Order: '#d8b34a',
  Body: '#7fae5c',
  Fury: '#e08a3c',
}

const FALLBACK_COLOR = '#c9a44c'

export function domainColor(domain: string | undefined): string {
  if (!domain) return FALLBACK_COLOR
  return DOMAIN_COLORS[domain] ?? FALLBACK_COLOR
}

export function primaryDomainColor(domains: string[]): string {
  return domainColor(domains[0])
}
