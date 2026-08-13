import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { DeckEntry } from '../lib/types'
import { pickOne } from '../lib/random'
import styles from './DeckReel.module.css'

interface DeckReelProps {
  pool: DeckEntry[]
  target: DeckEntry
  durationMs: number
}

const FRAME_COUNT = 10

export function DeckReel({ pool, target, durationMs }: DeckReelProps) {
  const frames = useMemo(() => {
    const spins: DeckEntry[] = []
    for (let i = 0; i < FRAME_COUNT - 1; i++) {
      spins.push(pickOne(pool))
    }
    spins.push(target)
    return spins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const trackStyle: CSSProperties = {
    '--reel-duration': `${durationMs}ms`,
    '--reel-distance': `${-((FRAME_COUNT - 1) / FRAME_COUNT) * 100}%`,
  } as CSSProperties

  return (
    <div className={styles.viewport} aria-hidden="true">
      <div className={styles.track} style={trackStyle}>
        {frames.map((deck, i) => (
          <div className={styles.frame} key={i}>
            {deck.keyCardImageUrls[0] && (
              <img className={styles.thumb} src={deck.keyCardImageUrls[0]} alt="" loading="lazy" />
            )}
            <span>{deck.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
