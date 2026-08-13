import { useState } from 'react'
import cardBack from '../assets/card-back.svg'

interface CardImageProps {
  src: string
  alt: string
  className?: string
  lazy?: boolean
}

export function CardImage({ src, alt, className, lazy = true }: CardImageProps) {
  const [failed, setFailed] = useState(false)

  return (
    <img
      src={failed ? cardBack : src}
      alt={failed ? '' : alt}
      className={className}
      loading={lazy ? 'lazy' : 'eager'}
      onError={() => setFailed(true)}
    />
  )
}
