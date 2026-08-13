import styles from './SetBadges.module.css'

// Fixed display order regardless of which sets a given deck actually uses.
const ALL_SETS = ['OGN', 'OGS', 'SFD', 'UNL', 'VEN']

interface SetBadgesProps {
  sets: string[]
}

export function SetBadges({ sets }: SetBadgesProps) {
  return (
    <div className={styles.row}>
      {ALL_SETS.map((set) => {
        const active = sets.includes(set)
        return (
          <span
            key={set}
            className={active ? styles.badge : `${styles.badge} ${styles.badgeInactive}`}
          >
            {set}
          </span>
        )
      })}
    </div>
  )
}
