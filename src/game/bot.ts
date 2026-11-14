/**
 * Bots: one-move lookahead with utility scoring, and a persona per bot.
 *
 * Each legal move is scored on what it does (gets home, bumps, enters, gains
 * steps, lands on a star or in the centre) and on the board it leaves behind:
 * how likely opponents are to bump the moved marble next turn (danger), and
 * how many opponents the moved marble could bump next turn (attack).
 *
 * Reach is computed with the real move generator for every die value, so star
 * hops, the centre and start-hole bumps are all accounted for without separate
 * reach maths.
 */
import { progressOf, spotKey, stepsToHome, isStar } from './board'
import { legalMovesFor, movesForMarble, playersAfterMove } from './rules'
import { helperTargets, moverOf, sameSide } from './teams'
import type { BotProfile, BotWeights, Color, GameState, Move, Persona, Player, Spot } from './types'

/** Random source returning a number in [0, 1). */
type Rng = () => number

export const PERSONAS: readonly Persona[] = ['balanced', 'hunter', 'guardian', 'racer']

/** Short labels for the UI. */
export const PERSONA_LABEL: Record<Persona, string> = {
  balanced: 'Balanced',
  hunter: 'Hunter',
  guardian: 'Guardian',
  racer: 'Racer',
}

/**
 * Base weights per style. Every style values getting home and bumping highly,
 * so none passes up an obvious one; they differ in the ordinary moves between.
 *
 * - balanced: a bit of everything.
 * - hunter:   chases bumps, parks on stars and within reach of opponents, takes risks.
 * - guardian: avoids holes opponents can reach, wary of the centre (only a 1 gets out).
 * - racer:    pushes lead marbles home and loves shortcuts.
 */
export const PERSONA_WEIGHTS: Record<Persona, BotWeights> = {
  balanced: { home: 90, bump: 70, bumpProgress: 0.5, enter: 40, progress: 0.8, lead: 0.05, danger: 1.0, star: 8, center: 4, attack: 8, noise: 4 },
  hunter: { home: 75, bump: 105, bumpProgress: 0.8, enter: 45, progress: 0.6, lead: 0.03, danger: 0.6, star: 12, center: 2, attack: 18, noise: 5 },
  guardian: { home: 90, bump: 65, bumpProgress: 0.4, enter: 32, progress: 0.7, lead: 0.05, danger: 1.8, star: 4, center: -10, attack: 3, noise: 4 },
  racer: { home: 120, bump: 55, bumpProgress: 0.3, enter: 30, progress: 1.1, lead: 0.15, danger: 0.7, star: 10, center: 14, attack: 3, noise: 4 },
}

/** How far each weight may drift from its base, per game (±15%). */
const WEIGHT_JITTER = 0.15

/**
 * A random style with its weights nudged a little, so two bots with the same
 * style still play slightly differently, and the same bot differs per game.
 */
export function createBotProfile(rng: Rng, persona?: Persona): BotProfile {
  const chosen = persona ?? PERSONAS[Math.min(PERSONAS.length - 1, Math.floor(rng() * PERSONAS.length))]!
  const base = PERSONA_WEIGHTS[chosen]
  const weights = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, v * (1 - WEIGHT_JITTER + 2 * WEIGHT_JITTER * rng())]),
  ) as unknown as BotWeights
  return { persona: chosen, weights }
}

// ---------------------------------------------------------------------------
// Reach: where each player could land next turn

/** For one player: chance (0..1) of being able to land on each hole next turn, keyed by spotKey. */
type Reach = Map<string, number>

const DIE_FACES = [1, 2, 3, 4, 5, 6] as const

/** Reach maps per player, cached per players array (states are immutable). */
const reachCache = new WeakMap<Player[], Map<Color, Reach>>()

function reachOf(players: Player[], player: Player): Reach {
  let byColor = reachCache.get(players)
  if (!byColor) {
    byColor = new Map()
    reachCache.set(players, byColor)
  }
  const cached = byColor.get(player.color)
  if (cached) return cached
  const reach: Reach = new Map()
  for (const d of DIE_FACES) {
    const landed = new Set(legalMovesFor(players, player, d).map((m) => spotKey(player.color, m.to)))
    for (const key of landed) reach.set(key, (reach.get(key) ?? 0) + 1 / 6)
  }
  byColor.set(player.color, reach)
  return reach
}

/**
 * Chance that some opponent of `color` can bump a marble on `spot` next turn,
 * treating opponents as independent. Base and home are never at risk, and
 * teammates are not opponents.
 */
export function bumpRisk(players: Player[], color: Color, spot: Spot): number {
  if (spot.kind === 'base' || spot.kind === 'home') return 0
  const key = spotKey(color, spot)
  const me = players.find((p) => p.color === color)
  let safe = 1
  for (const p of players) {
    if (p.finishRank !== null || (me ? sameSide(p, me) : p.color === color)) continue
    safe *= 1 - (reachOf(players, p).get(key) ?? 0)
  }
  return 1 - safe
}

/**
 * Expected number of opponent marbles that the marble `marbleId` of `color`
 * could bump next turn: for each opponent marble, the chance of a die value
 * that lets it land there.
 */
export function bumpChances(players: Player[], color: Color, marbleId: number): number {
  const player = players.find((p) => p.color === color)
  const marble = player?.marbles.find((m) => m.id === marbleId)
  if (!player || !marble) return 0
  const hits = new Map<string, number>()
  for (const d of DIE_FACES) {
    for (const move of movesForMarble(players, player, marble, d)) {
      if (!move.bumped) continue
      const key = `${move.bumped.color}:${move.bumped.marbleId}`
      hits.set(key, (hits.get(key) ?? 0) + 1 / 6)
    }
  }
  let total = 0
  for (const chance of hits.values()) total += chance
  return total
}

/** What losing a marble on this hole would cost: further along hurts more. */
function stake(color: Color, spot: Spot): number {
  return 12 + 0.6 * progressOf(color, spot)
}

// ---------------------------------------------------------------------------
// Scoring

/**
 * Scores a candidate move for the marbles moving this turn (the roller's, or
 * the teammate they rolled for). Higher is better. The roller's style decides
 * the weights; without a bot profile (humans, tests) the balanced weights are
 * used. `rng` adds a small nudge so near-equal moves are not always resolved
 * the same way.
 */
export function scoreMove(state: GameState, move: Move, rng: Rng = () => 0): number {
  const roller = state.players[state.currentIndex]
  if (!roller) return 0
  const player = moverOf(state)
  const w = roller.bot?.weights ?? PERSONA_WEIGHTS.balanced
  const color = player.color
  let score = 0

  if (move.reachesHome) score += w.home
  if (move.from.kind === 'base') score += w.enter

  if (move.bumped) {
    const victim = state.players.find((p) => p.color === move.bumped!.color)
    const marble = victim?.marbles.find((m) => m.id === move.bumped!.marbleId)
    score += w.bump + (victim && marble ? w.bumpProgress * progressOf(victim.color, marble.spot) : 0)
  }

  score += w.progress * (stepsToHome(color, move.from) - stepsToHome(color, move.to))
  score += w.lead * progressOf(color, move.from)

  if (move.to.kind === 'loop' && isStar(move.to.pos)) score += w.star
  if (move.to.kind === 'center') score += w.center

  // Escaping: leaving a hole opponents can reach now.
  score += w.danger * bumpRisk(state.players, color, move.from) * stake(color, move.from)

  // Exposure and pressure, judged on the board after the move.
  const after = playersAfterMove(state.players, color, move)
  score -= w.danger * bumpRisk(after, color, move.to) * stake(color, move.to)
  if (move.to.kind !== 'home') score += w.attack * Math.min(2, bumpChances(after, color, move.marbleId))

  return score + rng() * w.noise
}

/**
 * Picks the bot's move: the highest score, with a small random nudge from
 * `rng`. Exact ties keep the earlier move in legal-move order.
 */
export function chooseBotMove(state: GameState, rng: Rng = Math.random): Move | null {
  let best: Move | null = null
  let bestScore = -Infinity
  for (const move of state.legalMoves) {
    const score = scoreMove(state, move, rng)
    if (score > bestScore) {
      best = move
      bestScore = score
    }
  }
  return best
}

/**
 * Team play: which unfinished teammate a finished bot rolls for. Picks the one
 * whose best move is worth the most on average over the six die faces (a roll
 * with no move is worth nothing). Null when it is not a helper turn. Bots
 * never pass.
 */
export function chooseHelperTarget(state: GameState): Color | null {
  let best: Color | null = null
  let bestValue = -Infinity
  for (const target of helperTargets(state)) {
    let total = 0
    for (const d of DIE_FACES) {
      const legalMoves = legalMovesFor(state.players, target, d)
      const trial: GameState = { ...state, phase: 'move', dice: d, playingFor: target.color, legalMoves }
      const top = legalMoves.reduce((m, move) => Math.max(m, scoreMove(trial, move)), -Infinity)
      total += legalMoves.length > 0 ? top : 0
    }
    if (total / DIE_FACES.length > bestValue) {
      best = target.color
      bestValue = total / DIE_FACES.length
    }
  }
  return best
}
