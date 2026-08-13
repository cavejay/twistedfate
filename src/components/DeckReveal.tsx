import { useEffect, useRef } from 'react'
import type { DeckEntry } from '../lib/types'
import { CardImage } from './CardImage'
import { ActionBar } from './ActionBar'
import styles from './DeckReveal.module.css'

interface DeckRevealProps {
  deck: DeckEntry
  canRerollDeck: boolean
  onToast: (message: string) => void
  onRerollAll: () => void
  onRerollDeck: () => void
}

export function DeckReveal({ deck, canRerollDeck, onToast, onRerollAll, onRerollDeck }: DeckRevealProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div className={styles.panel} ref={panelRef} tabIndex={-1}>
      <div className={styles.header}>
        <p className={styles.deckName}>{deck.name}</p>
        <p className={styles.meta}>
          by {deck.author} · <span className={styles.likes}>{deck.likes} likes</span>
        </p>
      </div>
      {deck.keyCardImageUrls.length > 0 && (
        <div className={styles.fan}>
          {deck.keyCardImageUrls.slice(0, 5).map((url, i) => (
            <CardImage key={i} src={url} alt="" className={styles.fanCard} />
          ))}
        </div>
      )}
      <ActionBar
        deck={deck}
        canRerollDeck={canRerollDeck}
        onToast={onToast}
        onRerollAll={onRerollAll}
        onRerollDeck={onRerollDeck}
      />
    </div>
  )
}
