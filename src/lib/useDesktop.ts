import { useEffect, useState } from 'react'

const QUERY = '(min-width: 600px)'

/** True once the viewport is wide enough for the desktop-only layout. */
export function useDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
