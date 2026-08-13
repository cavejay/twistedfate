import type { CSSProperties } from 'react'
import type { Legend } from '../lib/types'
import { domainColor } from '../lib/domainColors'
import { CardImage } from './CardImage'
import styles from './LegendReveal.module.css'

interface LegendRevealProps {
  legend: Legend
}

export function LegendReveal({ legend }: LegendRevealProps) {
  const accent = domainColor(legend.domains[0])
  const style = { '--domain-color': accent } as CSSProperties

  return (
    <div className={styles.wrap} style={style}>
      <div className={styles.cardStage}>
        <div className={styles.glow} />
        <CardImage src={legend.imageUrl} alt={legend.name} className={styles.card} lazy={false} />
      </div>
      <h1 className={styles.name}>{legend.name}</h1>
      <div className={styles.domains}>
        {legend.domains.map((domain) => (
          <span
            key={domain}
            className={styles.domainTag}
            style={{ '--tag-color': domainColor(domain) } as CSSProperties}
          >
            {domain}
          </span>
        ))}
      </div>
    </div>
  )
}
