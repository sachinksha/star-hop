/**
 * Seeded full games with invariants checked after every action. The bot-only
 * games must also finish: star hops can circle forever, so this guards against
 * games that never end.
 */
import { describe, expect, it } from 'vitest'
import { COLORS, spotKey } from './board'
import { chooseBotMove } from './bot'
import { applyMove, createGame, rollFor, type Rng } from './engine'
import { replay } from './history'
import { legalMovesFor } from './rules'
import { seeded } from './testUtils'
import { MARBLES_PER_PLAYER, type Color, type GameAction, type GameState, type Move } from './types'

function assertInvariants(g: GameState) {
  const occupied = new Set<string>()
  for (const p of g.players) {
    expect(p.marbles).toHaveLength(MARBLES_PER_PLAYER)
    for (const m of p.marbles) {
      if (m.spot.kind === 'base') continue
      const key = spotKey(p.color, m.spot)
      // At most one marble per hole outside base.
      expect(occupied.has(key), `two marbles on ${key}`).toBe(false)
      occupied.add(key)
    }
    if (p.finishRank !== null && g.phase !== 'gameOver') {
      expect(p.marbles.every((m) => m.spot.kind === 'home')).toBe(true)
    }
  }
  const ranks = g.players.map((p) => p.finishRank).filter((r): r is number => r !== null)
  expect(new Set(ranks).size).toBe(ranks.length)
  if (g.phase === 'move') {
    expect(g.legalMoves.length).toBeGreaterThan(0)
    const player = g.players[g.currentIndex]!
    expect(g.legalMoves).toEqual(legalMovesFor(g.players, player, g.dice!))
  } else {
    expect(g.legalMoves).toEqual([])
  }
}

/** Home marbles never leave home, except by the game being replaced. */
function assertHomeIsFinal(before: GameState, after: GameState) {
  for (const p of before.players) {
    const next = after.players.find((x) => x.color === p.color)!
    p.marbles.forEach((m, i) => {
      if (m.spot.kind === 'home') expect(next.marbles[i]!.spot.kind).toBe('home')
    })
  }
}

/** Full games with invariant checks after every action take a few seconds each. */
const SIM_TIMEOUT = 60_000

type Chooser = (g: GameState, rng: Rng) => Move

const botChoice: Chooser = (g, rng) => chooseBotMove(g, rng)!
const randomChoice: Chooser = (g, rng) => g.legalMoves[Math.floor(rng() * g.legalMoves.length)]!

function play(colors: readonly Color[], seed: number, choose: Chooser, maxActions: number) {
  const rng = seeded(seed)
  const initial = createGame(
    colors.map((color) => ({ color, kind: 'bot' })),
    rng,
  )
  let g = initial
  const actions: GameAction[] = []
  while (g.phase !== 'gameOver' && actions.length < maxActions) {
    let action: GameAction
    if (g.phase === 'roll') {
      action = { type: 'roll', value: rollFor(g, rng, true), actor: 'bot' }
    } else {
      const move = choose(g, rng)
      action = { type: 'move', marbleId: move.marbleId, to: move.to, actor: 'bot' }
    }
    const next = action.type === 'roll' ? replay(g, [action]).state : applyMove(g, action.marbleId, action.to)
    expect(next, 'every chosen action is legal').not.toBe(g)
    assertHomeIsFinal(g, next)
    assertInvariants(next)
    actions.push(action)
    g = next
  }
  return { initial, g, actions }
}

const TABLES: readonly (readonly Color[])[] = [
  ['red', 'green'],
  ['red', 'yellow', 'blue'],
  ['red', 'orange', 'green', 'blue'],
  ['red', 'orange', 'yellow', 'green', 'blue'],
  COLORS,
]

describe('bot-only games (simulation)', () => {
  for (const colors of TABLES) {
    it(`${colors.length} players: every game finishes with a full ranking`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const { g } = play(colors, seed * 7919 + colors.length, botChoice, 20000)
        expect(g.phase, `seed ${seed} did not finish`).toBe('gameOver')
        expect(g.winners).toHaveLength(colors.length)
        expect(new Set(g.winners).size).toBe(colors.length)
      }
    }, SIM_TIMEOUT)
  }

  it('replaying the action log reproduces the final state exactly', () => {
    const { initial, g, actions } = play(['red', 'yellow', 'blue'], 42, botChoice, 20000)
    expect(replay(initial, actions).state).toEqual(g)
  }, SIM_TIMEOUT)
})

describe('random-move games (simulation)', () => {
  it('keeps every invariant with random choices, including long star circling', () => {
    for (let seed = 1; seed <= 10; seed++) {
      play(TABLES[seed % TABLES.length]!, seed, randomChoice, 4000)
    }
  }, SIM_TIMEOUT)
})
