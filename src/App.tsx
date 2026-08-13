import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { loadSnapshot, rollableLegends, decksFor } from './lib/data'
import { pickOne } from './lib/random'
import { useReducedMotion } from './lib/useReducedMotion'
import { useDesktop } from './lib/useDesktop'
import { domainColor } from './lib/domainColors'
import type { SnapshotData, Legend, DeckEntry } from './lib/types'
import { GoButton } from './components/GoButton'
import { DomainDial } from './components/DomainDial'
import { RevealPanel } from './components/RevealPanel'
import { SparkField } from './components/SparkField'
import { Toast } from './components/Toast'
import { Footer } from './components/Footer'

type Phase = 'loading' | 'error' | 'idle' | 'spinning' | 'revealed'

const SPIN_MS = 2200
const IDLE_SPARK_COLORS = ['#c9a44c']

export default function App() {
  const reducedMotion = useReducedMotion()
  const isDesktop = useDesktop()
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<SnapshotData | null>(null)
  const [legends, setLegends] = useState<Legend[]>([])
  const [legend, setLegend] = useState<Legend | null>(null)
  const [deck, setDeck] = useState<DeckEntry | null>(null)
  const [rollId, setRollId] = useState(0)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const timers = useRef<number[]>([])
  const toastIdRef = useRef(0)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadSnapshot()
      .then((snapshot) => {
        if (cancelled) return
        const pool = rollableLegends(snapshot)
        if (pool.length === 0) throw new Error('No rollable Legends in data')
        setData(snapshot)
        setLegends(pool)
        setPhase('idle')
      })
      .catch(() => {
        if (!cancelled) setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  function schedule(fn: () => void, delay: number) {
    const id = window.setTimeout(fn, delay)
    timers.current.push(id)
  }

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    const id = toastIdRef.current++
    setToast({ id, message })
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  function rollAll() {
    if (!data) return
    clearTimers()
    const nextLegend = pickOne(legends)
    const deckPool = decksFor(data, nextLegend.id)
    const nextDeck = pickOne(deckPool)
    setLegend(nextLegend)
    setDeck(nextDeck)
    setRollId((id) => id + 1)
    setPhase('spinning')

    const spinMs = reducedMotion ? 0 : SPIN_MS
    schedule(() => {
      setPhase('revealed')
      setAnnouncement(`Rolled: ${nextLegend.name} — ${nextDeck.name} by ${nextDeck.author}`)
    }, spinMs)
  }

  if (!isDesktop) {
    return (
      <div className={styles.desktopNotice}>
        <p className={styles.desktopNoticeText}>
          The Riftbound Randomiser (and Rift Atlas, where you'll play the deck) is built for a
          desktop browser. Please come back on a larger screen.
        </p>
      </div>
    )
  }

  const sparkColors = legend ? legend.domains.map((d) => domainColor(d)) : IDLE_SPARK_COLORS

  return (
    <div className={styles.app}>
      <SparkField colors={sparkColors} burst={phase === 'spinning'} disabled={reducedMotion} />
      <div className={styles.stage}>
        {phase === 'loading' && <p className={styles.title}>Loading Riftbound data…</p>}

        {phase === 'error' && (
          <div className={styles.errorBox}>
            <p className={styles.title}>Couldn't load roll data.</p>
            <button className={styles.retryButton} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        {phase === 'idle' && <GoButton onClick={rollAll} />}

        {(phase === 'spinning' || phase === 'revealed') && legend && (
          <div className={`${styles.dialStage} ${phase === 'revealed' ? styles.revealed : ''}`}>
            <div className={styles.dialSlot}>
              <DomainDial
                domains={legend.domains}
                spinToken={rollId}
                durationMs={reducedMotion ? 0 : SPIN_MS}
              />
            </div>
            {phase === 'revealed' && deck && data && (
              <div className={styles.revealSlot}>
                <RevealPanel
                  key={deck.deckId}
                  legend={legend}
                  deck={deck}
                  onToast={showToast}
                  onRerollAll={rollAll}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <Toast key={toast?.id ?? 'none'} message={toast?.message ?? null} />
      <Footer />
    </div>
  )
}
