import { useEffect, useRef } from 'react'
import type { Legend, DeckEntry } from '../lib/types'
import { CardImage } from './CardImage'
import { SetBadges } from './SetBadges'
import { ActionBar } from './ActionBar'
import styles from './RevealPanel.module.css'

interface RevealPanelProps {
  legend: Legend
  deck: DeckEntry
  onToast: (message: string) => void
  onRerollAll: () => void
}

export function RevealPanel({ legend, deck, onToast, onRerollAll }: RevealPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [deck.deckId])

  return (
    <div className={styles.panel} ref={panelRef} tabIndex={-1}>
      <div className={`${styles.fadeItem} ${styles.cards}`}>
        <div className={styles.cardSlot}>
          <span className={styles.cardLabel}>Legend</span>
          <CardImage src={legend.imageUrl} alt={legend.name} className={styles.card} lazy={false} />
        </div>
        <div className={styles.cardSlot}>
          <span className={styles.cardLabel}>Chosen Champion</span>
          <CardImage
            src={deck.chosenChampion.imageUrl}
            alt={deck.chosenChampion.name}
            className={styles.card}
            lazy={false}
          />
        </div>
      </div>

      <h1 className={`${styles.fadeItem} ${styles.deckName}`}>{deck.name}</h1>
      <p className={`${styles.fadeItem} ${styles.meta}`}>
        by {deck.author} · <span className={styles.likes}>{deck.likes} likes</span>
      </p>
      <div className={`${styles.fadeItem} ${styles.setBadgesWrap}`}>
        <SetBadges sets={deck.sets} />
      </div>

      <div className={`${styles.fadeItem} ${styles.actions}`}>
        <ActionBar deck={deck} onToast={onToast} onRerollAll={onRerollAll} />
      </div>
    </div>
  )
}
