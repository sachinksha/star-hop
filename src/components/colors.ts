import type { Color } from '../game/types'

export { COLOR_NAME } from '../game/describe'

/**
 * Each player's colour for marbles, panels and home holes, as a CSS value.
 * The colours themselves are tokens in index.css (--player-*). Use them through CSS
 * (usually as --arm); they are not hex strings.
 */
export const PLAYER_COLOR: Record<Color, string> = {
  red: 'var(--player-red)',
  orange: 'var(--player-orange)',
  yellow: 'var(--player-yellow)',
  green: 'var(--player-green)',
  blue: 'var(--player-blue)',
  purple: 'var(--player-purple)',
}
