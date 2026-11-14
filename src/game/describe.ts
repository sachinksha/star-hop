import { COLORS, SECTOR_LENGTH, isStar, stepsToHome } from './board'
import { isTeammate, teamLabel } from './teams'
import type { Color, GameEvent, Move, Player } from './types'

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
      return event.for
        ? `${COLOR_NAME[event.color]} rolled a ${event.value} for ${COLOR_NAME[event.for]}`
        : `${COLOR_NAME[event.color]} rolled a ${event.value}`
    case 'move':
      return event.by
        ? `${COLOR_NAME[event.by]}, playing for ${COLOR_NAME[event.color]}, ${describeMove(event.move)}`
        : `${COLOR_NAME[event.color]} ${describeMove(event.move)}`
    case 'pass':
      return `${COLOR_NAME[event.color]} passed instead of rolling for the team`
    case 'teamFinish':
      return `${teamLabel(event.team)} finished in place ${event.rank}`
    case 'bump':
      return event.friendly
        ? `${COLOR_NAME[event.color]} bumped teammate ${COLOR_NAME[event.victim]}'s marble back to base`
        : `${COLOR_NAME[event.color]} bumped a ${COLOR_NAME[event.victim]} marble back to base`
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

/** Names a star by the arm it leads into: S_a sits just before arm a. */
function starName(pos: number, mover: Color): string {
  const arm = COLORS[pos / SECTOR_LENGTH]!
  return arm === mover ? 'your home star' : `the star by the ${COLOR_NAME[arm]} arm`
}

/**
 * Spoken label for a destination badge, e.g. "Hop 2 stars, then 4 holes.
 * 18 steps from home. Bumps Bot 2". `players` names a bumped marble's owner.
 */
export function destinationLabel(move: Move, mover: Color, players: Player[]): string {
  const holes = (n: number) => (n === 1 ? '1 hole' : `${n} holes`)
  let where: string
  switch (move.via) {
    case 'enter':
      where = 'Out of base onto your start'
      break
    case 'toCenter':
      where = 'Into the centre'
      break
    case 'fromCenter':
      where = `Out of the centre to ${move.to.kind === 'loop' ? starName(move.to.pos, mover) : 'a star'}`
      break
    case 'hop': {
      const stars = move.hops === 1 ? '1 star' : `${move.hops} stars`
      const walked = move.path.length - move.hops
      where = walked > 0 ? `Hop ${stars}, then ${holes(walked)}` : `Hop ${stars}`
      if (walked === 0 && move.to.kind === 'loop') where += ` to ${starName(move.to.pos, mover)}`
      break
    }
    case 'walk':
      where = move.to.kind === 'home' ? `Into home hole ${move.to.slot + 1}` : `Walk ${holes(move.path.length)}`
      if (move.to.kind === 'loop' && isStar(move.to.pos)) where += ` to ${starName(move.to.pos, mover)}`
  }
  const parts = [where]
  if (move.to.kind === 'loop') parts.push(`${stepsToHome(mover, move.to)} steps from home`)
  if (move.bumped) {
    const victim = players.find((p) => p.color === move.bumped!.color)
    const me = players.find((p) => p.color === mover)
    const teammate = victim && me && isTeammate(victim, me)
    parts.push(`${teammate ? 'Bumps your teammate' : 'Bumps'} ${victim?.name ?? COLOR_NAME[move.bumped.color]}`)
  }
  return parts.join('. ')
}

/**
 * A text version of the board for screen readers: where each player's marbles
 * are, e.g. "Red (You): 2 in base, 1 on the loop 30 steps from home, 1 in home".
 */
export function describeBoard(players: Player[]): string[] {
  return players.map((p) => {
    const base = p.marbles.filter((m) => m.spot.kind === 'base').length
    const home = p.marbles.filter((m) => m.spot.kind === 'home').length
    const parts: string[] = []
    if (base) parts.push(`${base} in base`)
    for (const m of p.marbles) {
      if (m.spot.kind === 'loop') {
        const star = isStar(m.spot.pos) ? ' on a star' : ''
        parts.push(`marble ${m.id + 1}${star} ${stepsToHome(p.color, m.spot)} steps from home`)
      }
      if (m.spot.kind === 'center') parts.push(`marble ${m.id + 1} in the centre`)
    }
    if (home) parts.push(`${home} in home`)
    const rank = p.finishRank !== null ? `, finished ${p.finishRank}` : ''
    return `${COLOR_NAME[p.color]} (${p.name}${rank}): ${parts.join(', ')}`
  })
}

/**
 * A short label for a destination button, e.g. "Walk 4", "Hop 2★ +3",
 * "Home 2", "Centre". The full sentence is destinationLabel.
 */
export function shortDestination(move: Move): string {
  switch (move.via) {
    case 'enter':
      return 'Out to start'
    case 'toCenter':
      return 'Centre'
    case 'fromCenter':
      return move.to.kind === 'loop' ? `★ ${COLOR_NAME[COLORS[move.to.pos / SECTOR_LENGTH]!]}` : '★'
    case 'hop': {
      const walked = move.path.length - move.hops
      return walked > 0 ? `Hop ${move.hops}★ +${walked}` : `Hop ${move.hops}★`
    }
    case 'walk':
      return move.to.kind === 'home' ? `Home ${move.to.slot + 1}` : `Walk ${move.path.length}`
  }
}

/** Where a marble is, in a word or two: "Base", "★ 28 to go", "28 to go", "Home". */
export function shortSpot(color: Color, spot: Move['to']): string {
  switch (spot.kind) {
    case 'base':
      return 'Base'
    case 'center':
      return 'Centre'
    case 'home':
      return 'Home'
    case 'loop':
      return isStar(spot.pos) ? `★ ${stepsToHome(color, spot)} to go` : `${stepsToHome(color, spot)} to go`
  }
}
