/** Unbiased random integer in [0, max) via rejection sampling over crypto.getRandomValues. */
export function randomInt(max: number): number {
  if (max <= 0) throw new Error('randomInt: max must be positive')
  if (max === 1) return 0

  const range = 4294967296 // 2^32, the space of a Uint32
  const rejectionThreshold = range - (range % max)

  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= rejectionThreshold)

  return value % max
}

/** Uniform pick of one element from a non-empty array. */
export function pickOne<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickOne: items must be non-empty')
  return items[randomInt(items.length)]
}

/** Uniform pick of one element, excluding a previous pick when the array has an alternative. */
export function pickOneExcluding<T>(items: readonly T[], exclude: T): T {
  if (items.length <= 1) return items[0]
  const pool = items.filter((item) => item !== exclude)
  return pool.length > 0 ? pickOne(pool) : items[0]
}
