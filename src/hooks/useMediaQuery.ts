import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, kept up to date as the window resizes or
 * a phone rotates. matchMedia is an external store, so React reads it with
 * useSyncExternalStore. Without matchMedia (tests, old browsers) it is false.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}
