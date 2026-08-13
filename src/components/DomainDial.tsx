import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { DOMAIN_ORDER, domainColor } from '../lib/domainColors'
import { randomInt } from '../lib/random'
import dialFace from '../assets/dial-face.svg'
import styles from './DomainDial.module.css'

interface DomainDialProps {
  /** One or two domain names the needles should land on. */
  domains: string[]
  /** Changes on every roll to restart the spin animation from rest. */
  spinToken: number | string
  durationMs: number
  size?: number
}

const CENTER = 200
const OUTER_R = 190
const INNER_R = 145
const WEDGE_SPAN = 360 / DOMAIN_ORDER.length

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

function wedgePath(index: number): string {
  const centerAngle = index * WEDGE_SPAN
  const start = centerAngle - WEDGE_SPAN / 2
  const end = centerAngle + WEDGE_SPAN / 2
  const p1 = polarToCartesian(CENTER, CENTER, OUTER_R, start)
  const p2 = polarToCartesian(CENTER, CENTER, OUTER_R, end)
  const p3 = polarToCartesian(CENTER, CENTER, INNER_R, end)
  const p4 = polarToCartesian(CENTER, CENTER, INNER_R, start)
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 0 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${INNER_R} ${INNER_R} 0 0 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

function wedgeCenterAngle(domain: string): number {
  const idx = DOMAIN_ORDER.indexOf(domain as (typeof DOMAIN_ORDER)[number])
  return (idx < 0 ? 0 : idx) * WEDGE_SPAN
}

function needleShape(className: string, length: number, width: number) {
  const half = width / 2
  const tipY = CENTER - length
  return (
    <path
      className={className}
      d={`M ${CENTER - half} ${CENTER} L ${CENTER - half * 0.4} ${tipY + width} L ${CENTER} ${tipY} L ${CENTER + half * 0.4} ${tipY + width} L ${CENTER + half} ${CENTER} Z`}
    />
  )
}

export function DomainDial({ domains, spinToken, durationMs, size = 352 }: DomainDialProps) {
  const [targetA, targetB] = useMemo(() => {
    const primary = domains[0]
    const secondary = domains[1] ?? domains[0]
    const sameDomain = domains.length < 2

    const turnsA = 4 + randomInt(3)
    const turnsB = 5 + randomInt(3)
    const offset = sameDomain ? 10 : 0

    return [
      turnsA * 360 + wedgeCenterAngle(primary) - offset,
      turnsB * 360 + wedgeCenterAngle(secondary) + offset,
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains.join('|'), spinToken])

  const dialStyle = { '--dial-size': `${size / 16}rem` } as CSSProperties

  return (
    <svg viewBox="0 0 400 400" className={styles.dial} style={dialStyle} aria-hidden="true">
      <image href={dialFace} x="0" y="0" width="400" height="400" className={styles.face} />
      {DOMAIN_ORDER.map((domain, i) => (
        <path key={domain} d={wedgePath(i)} fill={domainColor(domain)} className={styles.wedge} />
      ))}
      <g
        key={`a-${spinToken}`}
        className={styles.needle}
        style={
          {
            '--needle-rotation': `${targetA}deg`,
            '--spin-duration': `${durationMs}ms`,
            '--needle-color': '#e8c873',
          } as CSSProperties
        }
      >
        {needleShape(styles.needleShaft, 172, 22)}
      </g>
      <g
        key={`b-${spinToken}`}
        className={styles.needle}
        style={
          {
            '--needle-rotation': `${targetB}deg`,
            '--spin-duration': `${durationMs}ms`,
            '--needle-color': '#f5f0e6',
          } as CSSProperties
        }
      >
        {needleShape(styles.needleShaftSecondary, 150, 14)}
      </g>
      <circle cx={CENTER} cy={CENTER} r="20" className={styles.hub} />
      <circle cx={CENTER} cy={CENTER} r="7" className={styles.hubCap} />
    </svg>
  )
}
