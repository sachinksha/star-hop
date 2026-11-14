/**
 * Team play helpers. Pure functions over players and game state; the engine,
 * bots and UI all ask these the same questions.
 *
 * Team rules (README R17-R21):
 *  - Teams are fixed at setup: 4 players as 2 pairs, or 6 players as 2 teams
 *    of 3 or 3 pairs. Seats alternate round the board, so turns alternate
 *    between teams and partners sit opposite each other.
 *  - Teammates never bump each other: you may jump a teammate's marble, but
 *    not land on it.
 *  - A player whose marbles are all home keeps taking turns while a teammate
 *    is still playing. Before rolling they choose which unfinished teammate
 *    the roll is for, or pass.
 *  - A team finishes when all its members have. The first team to finish wins.
 */
import type { Color, GameState, Player } from './types'

/** Team layouts offered for each player count: how many teams. */
export const TEAM_OPTIONS: Readonly<Record<number, readonly number[]>> = { 4: [2], 6: [2, 3] }

/** Team numbers for seats listed in clockwise order: alternate round the board. */
export function assignTeams(seatCount: number, teamCount: number): number[] {
  return Array.from({ length: seatCount }, (_, i) => i % teamCount)
}

/** Display label for a team number: A, B, C. */
export function teamLabel(team: number): string {
  return `Team ${String.fromCharCode(65 + team)}`
}

/** True when the game is played in teams. */
export function hasTeams(players: Player[]): boolean {
  return players.some((p) => p.team !== null)
}

/** Different seats on the same team. */
export function isTeammate(a: Player, b: Player): boolean {
  return a.color !== b.color && a.team !== null && a.team === b.team
}

/** The same seat, or teammates. "Friendly" marbles: never bumped. */
export function sameSide(a: Player, b: Player): boolean {
  return a.color === b.color || isTeammate(a, b)
}

/** Everyone on `player`'s side, the player included, in seat order. */
export function sideOf(players: Player[], player: Player): Player[] {
  return players.filter((p) => sameSide(p, player))
}

/** Every member of the side has all four marbles home. */
export function sideDone(players: Player[], player: Player): boolean {
  return sideOf(players, player).every((p) => p.finishRank !== null)
}

/**
 * The seat still takes turns: it is unfinished, or it has finished but a
 * teammate has not, so it rolls for them.
 */
export function takesTurns(players: Player[], player: Player): boolean {
  return !sideDone(players, player)
}

/**
 * Unfinished teammates a finished player can roll for, nearest clockwise
 * first. Empty unless it is a finished player's turn in team play.
 */
export function helperTargets(state: GameState): Player[] {
  const roller = state.players[state.currentIndex]
  if (!roller || roller.finishRank === null || roller.team === null) return []
  const n = state.players.length
  const out: Player[] = []
  for (let step = 1; step < n; step++) {
    const p = state.players[(state.currentIndex + step) % n]!
    if (isTeammate(p, roller) && p.finishRank === null) out.push(p)
  }
  return out
}

/** A finished player is about to roll for a teammate (or pass). */
export function isHelperTurn(state: GameState): boolean {
  return state.phase === 'roll' && helperTargets(state).length > 0
}

/** The player whose marbles move this turn: a teammate being rolled for, or the roller. */
export function moverOf(state: GameState): Player {
  const roller = state.players[state.currentIndex]!
  if (!state.playingFor) return roller
  return state.players.find((p) => p.color === state.playingFor) ?? roller
}

export interface TeamStanding {
  team: number
  members: Color[]
  /** 1 for the winning team. */
  rank: number
}

/**
 * Teams in finishing order. A team's place is decided by its last member to
 * finish, read from `winners` (the individual finishing order, which also
 * ranks unfinished players when a game ends early).
 */
export function teamStandings(state: GameState): TeamStanding[] {
  const teams = new Map<number, Color[]>()
  for (const p of state.players) {
    if (p.team === null) continue
    teams.set(p.team, [...(teams.get(p.team) ?? []), p.color])
  }
  const doneAt = (members: Color[]) =>
    Math.max(...members.map((c) => (state.winners.includes(c) ? state.winners.indexOf(c) : Number.POSITIVE_INFINITY)))
  return [...teams.entries()]
    .map(([team, members]) => ({ team, members, at: doneAt(members) }))
    .sort((a, b) => a.at - b.at || a.team - b.team)
    .map(({ team, members }, i) => ({ team, members, rank: i + 1 }))
}
