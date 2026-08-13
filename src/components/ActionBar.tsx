import type { DeckEntry } from '../lib/types'
import { copyToClipboard } from '../lib/clipboard'
import styles from './ActionBar.module.css'

interface ActionBarProps {
  deck: DeckEntry
  onToast: (message: string) => void
  onRerollAll: () => void
}

const RA_PLAY_URL = 'https://play.riftatlas.com/'

export function ActionBar({ deck, onToast, onRerollAll }: ActionBarProps) {
  async function handleCopyCode() {
    const result = await copyToClipboard(deck.deckCode)
    onToast(
      result === 'copied'
        ? 'Deck code copied to clipboard.'
        : 'Clipboard blocked — code selected below, copy it manually.',
    )
  }

  function handlePlay() {
    // window.open must be the first synchronous call in the handler — once we
    // `await` anything (e.g. the clipboard write) the browser no longer treats
    // the popup as tied to the user gesture and silently blocks it.
    window.open(RA_PLAY_URL, '_blank', 'noopener')
    copyToClipboard(deck.deckCode).then((result) => {
      onToast(
        result === 'copied'
          ? "Deck code copied — paste it into Rift Atlas's deck import."
          : 'Rift Atlas opened — clipboard blocked, copy the code manually.',
      )
    })
  }

  return (
    <div>
      <div className={styles.actions}>
        <a
          className={styles.action}
          href={deck.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Piltover Archive
        </a>
        <button className={styles.action} onClick={handleCopyCode}>
          Copy deck code
        </button>
        <button className={`${styles.action} ${styles.primary}`} onClick={handlePlay}>
          Play
        </button>
      </div>
      <div className={styles.rerolls}>
        <button className={styles.reroll} onClick={onRerollAll}>
          Re-roll everything
        </button>
      </div>
    </div>
  )
}
