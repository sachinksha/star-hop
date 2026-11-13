import type { Color, GameEvent, Move } from './types'

/** Colour names used in the game log. Kept here so the rules layer has no UI imports. */
export const COLOR_NAME: Record<Color, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
}

/** Short phrase for how a move travelled, e.g. "hopped 2 stars". */
function describeMove(move: Move): string {
  switch (move.via) {
    case 'enter':
      return 'brought a marble out of base'
    case 'toCenter':
      return 'moved a marble into the centre'
    case 'fromCenter':
      return 'moved a marble out of the centre onto a star'
    case 'hop': {
      const stars = move.hops === 1 ? '1 star' : `${move.hops} stars`
      const walked = move.path.length - move.hops
      return walked > 0 ? `hopped ${stars}, then walked ${walked}` : `hopped ${stars}`
    }
    case 'walk':
      if (move.reachesHome) return 'moved a marble into home'
      if (move.from.kind === 'home') return 'moved a marble further into home'
      return 'moved a marble'
  }
}

/** Human-readable text for a game event, or null when it needs no log line. */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'roll':
      return `${COLOR_NAME[event.color]} rolled a ${event.value}`
    case 'move':
      return `${COLOR_NAME[event.color]} ${describeMove(event.move)}`
    case 'bump':
      return `${COLOR_NAME[event.color]} bumped a ${COLOR_NAME[event.victim]} marble back to base`
    case 'noMoves':
      return event.rollAgain
        ? `${COLOR_NAME[event.color]} has no legal move, but rolls again after a 6`
        : `${COLOR_NAME[event.color]} has no legal move`
    case 'finish':
      return `${COLOR_NAME[event.color]} finished in place ${event.rank}`
    case 'takeover':
      return `${event.from} left. ${event.to} now plays ${COLOR_NAME[event.color]}`
    case 'gameOver':
      return event.early ? 'Game ended early. Unfinished players are ranked by progress' : null
  }
}
