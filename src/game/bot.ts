/**
 * Bots: utility scoring of each legal move, with a persona per bot.
 *
 * Phase 2 version: personas, profiles and a scorer covering the move's own
 * value (home, bump, entry, progress, star, centre). Danger and attack, which
 * need opponents' next-turn reach, are added in phase 3 (see PLAN.md).
 */
import { isStar, progressOf, stepsToHome } from './board'
import type { BotProfile, BotWeights, GameState, Move, Persona } from './types'

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
 * - hunter:   chases bumps, parks on stars to ambush, takes risks.
 * - guardian: avoids reachable holes, wary of the centre (only a 1 gets out).
 * - racer:    pushes lead marbles home and loves shortcuts.
 */
export const PERSONA_WEIGHTS: Record<Persona, BotWeights> = {
  balanced: { home: 90, bump: 70, bumpProgress: 0.5, enter: 40, progress: 0.8, lead: 0.05, danger: 1.0, star: 10, center: 8, attack: 6, noise: 4 },
  hunter: { home: 75, bump: 105, bumpProgress: 0.8, enter: 45, progress: 0.6, lead: 0.03, danger: 0.6, star: 14, center: 6, attack: 14, noise: 5 },
  guardian: { home: 90, bump: 65, bumpProgress: 0.4, enter: 32, progress: 0.7, lead: 0.05, danger: 1.8, star: 6, center: -10, attack: 3, noise: 4 },
  racer: { home: 120, bump: 55, bumpProgress: 0.3, enter: 30, progress: 1.1, lead: 0.15, danger: 0.8, star: 12, center: 14, attack: 3, noise: 4 },
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

/**
 * Scores a candidate move for the current player. Higher is better. Without a
 * bot profile (humans, tests) the balanced weights are used. `rng` adds a
 * small nudge so near-equal moves are not always resolved the same way.
 */
export function scoreMove(state: GameState, move: Move, rng: Rng = () => 0): number {
  const player = state.players[state.currentIndex]
  if (!player) return 0
  const w = player.bot?.weights ?? PERSONA_WEIGHTS.balanced
  const color = player.color
  let score = 0

  if (move.reachesHome) score += w.home
  if (move.from.kind === 'base') score += w.enter

  if (move.bumped) {
    const victim = state.players.find((p) => p.color === move.bumped!.color)
    const marble = victim?.marbles.find((m) => m.id === move.bumped!.marbleId)
    score += w.bump + (victim && marble ? w.bumpProgress * progressOf(victim.color, marble.spot) : 0)
  }

  const before = stepsToHome(color, move.from)
  const after = stepsToHome(color, move.to)
  score += w.progress * (before - after)
  score += w.lead * Math.max(0, progressOf(color, move.from))

  if (move.to.kind === 'loop' && isStar(move.to.pos)) score += w.star
  if (move.to.kind === 'center') score += w.center

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
