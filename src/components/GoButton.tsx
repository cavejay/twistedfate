import styles from './GoButton.module.css'

interface GoButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function GoButton({ onClick, disabled }: GoButtonProps) {
  return (
    <div className={styles.wrap}>
      <button className={styles.button} onClick={onClick} disabled={disabled}>
        GO
      </button>
      <p className={styles.tagline}>Roll a Legend. Roll a deck. Play.</p>
    </div>
  )
}
