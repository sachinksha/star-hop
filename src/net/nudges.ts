/**
 * Team nudges: before a finished player rolls for the team, teammates can
 * suggest who the roll should be for, or that it be skipped. Like players
 * leaning in over a real board: "roll for me, I'm one off home!"
 *
 * Nudges are advice, never actions. They expire the moment the position
 * changes (tagged with the action count, like the board's marble selection),
 * and the host shares them only with the roller's team.
 */
import { helperTargets, isHelperTurn, isTeammate } from '../game/teams'
import type { Color, GameState } from '../game/types'
import type { Nudge, TeamNudge } from './protocol'

/**
 * Adds `from`'s nudge to the team's list (replacing their previous one), or
 * returns null when it doesn't apply: not a finished player's turn, a stale
 * position, someone outside the team, or a teammate who can't be rolled for.
 */
export function acceptNudge(game: GameState, seq: number, current: TeamNudge[], from: Color, nudge: Nudge): TeamNudge[] | null {
  if (seq !== game.actionSeq || !isHelperTurn(game)) return null
  const roller = game.players[game.currentIndex]!
  const sender = game.players.find((p) => p.color === from)
  if (!sender || !isTeammate(sender, roller)) return null
  if (nudge.kind === 'rollFor' && !helperTargets(game).some((p) => p.color === nudge.color)) return null
  const fresh = current.filter((n) => n.seq === seq && n.from !== from)
  return [...fresh, { from, seq, nudge }]
}

/** The nudges still valid for this position. */
export function liveNudges(game: GameState, nudges: TeamNudge[]): TeamNudge[] {
  return isHelperTurn(game) ? nudges.filter((n) => n.seq === game.actionSeq) : []
}

/** The roller's whole team, who see the nudges. */
export function teamColors(game: GameState): Color[] {
  const roller = game.players[game.currentIndex]!
  return game.players.filter((p) => p === roller || isTeammate(p, roller)).map((p) => p.color)
}
