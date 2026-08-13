import { useEffect, useRef, useState } from 'react'
import styles from './App.module.css'
import { loadSnapshot, rollableLegends, decksFor } from './lib/data'
import { pickOne, pickOneExcluding } from './lib/random'
import { useReducedMotion } from './lib/useReducedMotion'
import type { SnapshotData, Legend, DeckEntry } from './lib/types'
import { GoButton } from './components/GoButton'
import { LegendReel } from './components/LegendReel'
import { LegendReveal } from './components/LegendReveal'
import { DeckReel } from './components/DeckReel'
import { DeckReveal } from './components/DeckReveal'
import { Toast } from './components/Toast'
import { Footer } from './components/Footer'

type Phase =
  | 'loading'
  | 'error'
  | 'idle'
  | 'rollingLegend'
  | 'legendRevealed'
  | 'rollingDeck'
  | 'deckRevealed'

const LEGEND_ROLL_MS = 1800
const LEGEND_PAUSE_MS = 600
const DECK_ROLL_MS = 1000

export default function App() {
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<SnapshotData | null>(null)
  const [legends, setLegends] = useState<Legend[]>([])
  const [legend, setLegend] = useState<Legend | null>(null)
  const [deck, setDeck] = useState<DeckEntry | null>(null)
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
    setPhase('rollingLegend')

    const legendRollMs = reducedMotion ? 0 : LEGEND_ROLL_MS
    const pauseMs = reducedMotion ? 0 : LEGEND_PAUSE_MS
    const deckRollMs = reducedMotion ? 0 : DECK_ROLL_MS

    schedule(() => setPhase('legendRevealed'), legendRollMs)
    schedule(() => setPhase('rollingDeck'), legendRollMs + pauseMs)
    schedule(() => {
      setPhase('deckRevealed')
      setAnnouncement(`Rolled: ${nextLegend.name} — ${nextDeck.name} by ${nextDeck.author}`)
    }, legendRollMs + pauseMs + deckRollMs)
  }

  function rerollDeckOnly() {
    if (!data || !legend || !deck) return
    clearTimers()
    const deckPool = decksFor(data, legend.id)
    const nextDeck = pickOneExcluding(deckPool, deck)
    setDeck(nextDeck)
    setPhase('rollingDeck')

    const deckRollMs = reducedMotion ? 0 : DECK_ROLL_MS
    schedule(() => {
      setPhase('deckRevealed')
      setAnnouncement(`Rolled: ${legend.name} — ${nextDeck.name} by ${nextDeck.author}`)
    }, deckRollMs)
  }

  return (
    <div className={styles.app}>
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

        {phase === 'rollingLegend' && legend && (
          <LegendReel pool={legends} target={legend} durationMs={reducedMotion ? 0 : LEGEND_ROLL_MS} />
        )}

        {(phase === 'legendRevealed' || phase === 'rollingDeck') && legend && (
          <LegendReveal legend={legend} />
        )}

        {phase === 'rollingDeck' && legend && deck && data && (
          <DeckReel
            pool={decksFor(data, legend.id)}
            target={deck}
            durationMs={reducedMotion ? 0 : DECK_ROLL_MS}
          />
        )}

        {phase === 'deckRevealed' && legend && deck && data && (
          <DeckReveal
            key={deck.deckId}
            deck={deck}
            canRerollDeck={decksFor(data, legend.id).length > 1}
            onToast={showToast}
            onRerollAll={rollAll}
            onRerollDeck={rerollDeckOnly}
          />
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
