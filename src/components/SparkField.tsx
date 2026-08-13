import { useEffect, useRef } from 'react'
import styles from './SparkField.module.css'

interface SparkFieldProps {
  colors: string[]
  /** True while the Legend is being revealed — sparks temporarily speed up. */
  burst?: boolean
  disabled?: boolean
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
}

const SPARK_COUNT = 12
const BG_FADE = 'rgba(15, 10, 31, 0.09)'
const TRAIL_COLOR = 'rgba(255, 255, 255, 0.35)'
const GLOW_BLUR = 7
const BURST_MULTIPLIER = 3.5
// Higher = snaps to the target multiplier faster; used as an exponential-decay rate per second.
const BURST_EASE_RATE = 3.5

function pickColor(colors: string[]): string {
  return colors[Math.floor(Math.random() * colors.length)] ?? '#c9a44c'
}

function spawnSpark(width: number, height: number, colors: string[]): Spark {
  const angle = Math.random() * Math.PI * 2
  const speed = 10 + Math.random() * 20 // px/sec
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 1.4 + Math.random() * 1.6,
    color: pickColor(colors),
  }
}

export function SparkField({ colors, burst = false, disabled }: SparkFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef(colors)
  const sparksRef = useRef<Spark[]>([])
  const burstRef = useRef(burst)
  const multiplierRef = useRef(1)

  useEffect(() => {
    const nextColors = colors.length > 0 ? colors : ['#c9a44c']
    colorsRef.current = nextColors
    // Reassign every spark immediately so the whole field changes colour
    // together, rather than waiting for each spark to individually wrap.
    for (const spark of sparksRef.current) {
      spark.color = pickColor(nextColors)
    }
  }, [colors])

  useEffect(() => {
    burstRef.current = burst
  }, [burst])

  useEffect(() => {
    if (disabled) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    if (sparksRef.current.length === 0) {
      sparksRef.current = Array.from({ length: SPARK_COUNT }, () =>
        spawnSpark(width, height, colorsRef.current),
      )
    }

    let lastTime = performance.now()
    let frameId: number

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      const target = burstRef.current ? BURST_MULTIPLIER : 1
      multiplierRef.current += (target - multiplierRef.current) * Math.min(BURST_EASE_RATE * dt, 1)

      ctx!.fillStyle = BG_FADE
      ctx!.fillRect(0, 0, width, height)

      for (const spark of sparksRef.current) {
        const prevX = spark.x
        const prevY = spark.y
        spark.x += spark.vx * dt * multiplierRef.current
        spark.y += spark.vy * dt * multiplierRef.current

        let wrapped = false
        if (spark.x < -10) {
          spark.x = width + 10
          wrapped = true
        } else if (spark.x > width + 10) {
          spark.x = -10
          wrapped = true
        }
        if (spark.y < -10) {
          spark.y = height + 10
          wrapped = true
        } else if (spark.y > height + 10) {
          spark.y = -10
          wrapped = true
        }

        if (wrapped) {
          spark.color = pickColor(colorsRef.current)
        } else {
          ctx!.strokeStyle = TRAIL_COLOR
          ctx!.lineWidth = 0.6
          ctx!.beginPath()
          ctx!.moveTo(prevX, prevY)
          ctx!.lineTo(spark.x, spark.y)
          ctx!.stroke()
        }

        ctx!.shadowBlur = GLOW_BLUR
        ctx!.shadowColor = spark.color
        ctx!.fillStyle = spark.color
        ctx!.beginPath()
        ctx!.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.shadowBlur = 0
      }

      frameId = requestAnimationFrame(frame)
    }
    frameId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
    }
  }, [disabled])

  if (disabled) return null

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
