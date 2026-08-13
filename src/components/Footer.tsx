import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>
        Deck data via{' '}
        <a href="https://piltoverarchive.com" target="_blank" rel="noopener noreferrer">
          Piltover Archive
        </a>
        . Play via{' '}
        <a href="https://play.riftatlas.com/" target="_blank" rel="noopener noreferrer">
          Rift Atlas
        </a>
        . Not affiliated with, endorsed, sponsored, or specifically approved by Riot Games.
        Riftbound and all related properties are trademarks or registered trademarks of Riot
        Games, Inc. This project is made under Riot's{' '}
        <a
          href="https://www.riotgames.com/en/legal"
          target="_blank"
          rel="noopener noreferrer"
        >
          "Legal Jibber Jabber"
        </a>{' '}
        policy.
      </p>
    </footer>
  )
}
