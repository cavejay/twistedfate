import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Legend } from '../lib/types'
import { pickOne } from '../lib/random'
import styles from './LegendReel.module.css'

interface LegendReelProps {
  pool: Legend[]
  target: Legend
  durationMs: number
}

const FRAME_COUNT = 14

export function LegendReel({ pool, target, durationMs }: LegendReelProps) {
  const frames = useMemo(() => {
    const spins: Legend[] = []
    for (let i = 0; i < FRAME_COUNT - 1; i++) {
      spins.push(pickOne(pool))
    }
    spins.push(target)
    return spins
    // Deliberately recomputed only when the target changes — a fresh reel per roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const trackStyle: CSSProperties = {
    '--reel-duration': `${durationMs}ms`,
    '--reel-distance': `${-((FRAME_COUNT - 1) / FRAME_COUNT) * 100}%`,
  } as CSSProperties

  return (
    <div className={styles.viewport} aria-hidden="true">
      <div className={styles.track} style={trackStyle}>
        {frames.map((legend, i) => (
          <img
            key={i}
            className={styles.frame}
            src={legend.imageUrl}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
    </div>
  )
}
