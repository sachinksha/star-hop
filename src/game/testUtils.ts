/** Helpers for building positions in tests. Not imported by app code. */
import { createGame, rollWithValue, type Rng } from './engine'
import type { Color, GameState, PlayerConfig, Spot } from './types'

/** Small seeded PRNG (mulberry32) so simulations are reproducible. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const loop = (pos: number): Spot => ({ kind: 'loop', pos })
export const home = (slot: number): Spot => ({ kind: 'home', slot })
export const BASE: Spot = { kind: 'base' }
export const CENTER: Spot = { kind: 'center' }

/** A game with the given seats; the first listed colour moves first. */
export function game(colors: Color[] = ['red', 'blue'], kinds: PlayerConfig['kind'][] = []): GameState {
  const g = createGame(
    colors.map((color, i) => ({ color, kind: kinds[i] ?? 'human' })),
    () => 0,
  )
  return { ...g, currentIndex: g.players.findIndex((p) => p.color === colors[0]) }
}

/** Puts a colour's marbles on the given spots (marble 0 first); the rest stay in base. */
export function place(g: GameState, color: Color, spots: Spot[]): GameState {
  return {
    ...g,
    players: g.players.map((p) =>
      p.color === color ? { ...p, marbles: p.marbles.map((m, i) => ({ ...m, spot: spots[i] ?? BASE })) } : p,
    ),
  }
}

/** Makes it `color`'s turn and rolls `value`. */
export function rollAs(g: GameState, color: Color, value: number): GameState {
  const currentIndex = g.players.findIndex((p) => p.color === color)
  return rollWithValue({ ...g, currentIndex, phase: 'roll', dice: null, legalMoves: [] }, value)
}

export function playerOf(g: GameState, color: Color) {
  const p = g.players.find((x) => x.color === color)
  if (!p) throw new Error(`no ${color} seat`)
  return p
}

/** The destinations offered for one marble, in display order. */
export function destinations(g: GameState, marbleId: number): Spot[] {
  return g.legalMoves.filter((m) => m.marbleId === marbleId).map((m) => m.to)
}
