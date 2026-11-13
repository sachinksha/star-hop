import type { Color } from '../game/types'

export { COLOR_NAME } from '../game/describe'

/** Strong colour for marbles, panels and home holes. Our own palette. */
export const COLOR_HEX: Record<Color, string> = {
  red: '#d9434b',
  orange: '#ee8a2a',
  yellow: '#e2b928',
  green: '#3a9e5c',
  blue: '#3170dc',
  purple: '#8b55d4',
}
