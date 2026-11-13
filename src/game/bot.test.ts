import { describe, expect, it } from 'vitest'
import { PERSONAS, bumpChances, bumpRisk, chooseBotMove, createBotProfile } from './bot'
import { applyMove, createGame, rollFor, rollWithValue } from './engine'
import { CENTER, game, home, loop, place, playerOf, rollAs, seeded } from './testUtils'
import type { Color, GameState, Persona } from './types'

/** Makes `color` a bot with the persona's exact base weights (no jitter). */
function asBot(g: GameState, color: Color, persona: Persona): GameState {
  const bot = createBotProfile(() => 0.5, persona)
  return { ...g, players: g.players.map((p) => (p.color === color ? { ...p, kind: 'bot', bot } : p)) }
}

const pick = (g: GameState) => {
  const move = chooseBotMove(g, () => 0.5)
  return move && { marbleId: move.marbleId, to: move.to }
}

describe('reach', () => {
  it('measures the chance of being bumped next turn', () => {
    const g = place(game(), 'blue', [loop(41)])
    expect(bumpRisk(g.players, 'red', loop(44))).toBeCloseTo(1 / 6)
    expect(bumpRisk(g.players, 'red', loop(40))).toBe(0)
    expect(bumpRisk(g.players, 'red', home(0))).toBe(0)
    // Blue's base marbles can bump on blue's start with a 1 or a 6.
    expect(bumpRisk(g.players, 'red', loop(63))).toBeCloseTo(2 / 6)
  })

  it('counts star hops and the centre exit as reach', () => {
    const fromStar = place(game(), 'blue', [loop(28)])
    expect(bumpRisk(fromStar.players, 'red', loop(56))).toBeGreaterThan(0)
    const fromCenter = place(game(), 'blue', [CENTER])
    expect(bumpRisk(fromCenter.players, 'red', loop(14))).toBeCloseTo(1 / 6)
  })

  it('counts the opponents a marble could bump next turn', () => {
    const g = place(place(game(), 'red', [loop(30)]), 'blue', [loop(32), loop(35)])
    expect(bumpChances(g.players, 'red', 0)).toBeCloseTo(2 / 6)
  })
})

describe('every persona', () => {
  for (const persona of PERSONAS) {
    it(`${persona}: bumps a far-travelled opponent rather than walking`, () => {
      let g = place(place(game(), 'red', [loop(30), loop(50)]), 'blue', [loop(33)])
      g = rollAs(asBot(g, 'red', persona), 'red', 3)
      expect(pick(g)).toEqual({ marbleId: 0, to: loop(33) })
    })

    it(`${persona}: gets a marble home rather than walking another`, () => {
      let g = place(game(), 'red', [loop(4), loop(40)])
      g = rollAs(asBot(g, 'red', persona), 'red', 3)
      expect(pick(g)).toEqual({ marbleId: 0, to: home(0) })
    })
  }
})

describe('persona styles', () => {
  it('guardian avoids landing just in front of an opponent', () => {
    let g = place(place(game(), 'red', [loop(20), loop(40)]), 'blue', [loop(41)])
    g = rollAs(asBot(g, 'red', 'guardian'), 'red', 4)
    expect(pick(g)).toEqual({ marbleId: 0, to: loop(24) })
  })

  it('guardian moves a threatened marble out of reach', () => {
    let g = place(place(game(), 'red', [loop(30), loop(44), home(3), home(2)]), 'blue', [loop(29)])
    g = rollAs(asBot(g, 'red', 'guardian'), 'red', 6)
    expect(pick(g)).toEqual({ marbleId: 0, to: loop(36) })
  })

  it('guardian walks when the centre barely helps; racer takes the centre', () => {
    const base = place(game(), 'red', [loop(68), home(3), home(2), home(1)])
    expect(pick(rollAs(asBot(base, 'red', 'guardian'), 'red', 3))).toEqual({ marbleId: 0, to: loop(71) })
    expect(pick(rollAs(asBot(base, 'red', 'racer'), 'red', 3))).toEqual({ marbleId: 0, to: CENTER })
  })

  it('every persona takes the centre when it saves most of a lap', () => {
    const base = place(game(), 'red', [loop(12), home(3), home(2), home(1)])
    for (const persona of PERSONAS) {
      expect(pick(rollAs(asBot(base, 'red', persona), 'red', 3))).toEqual({ marbleId: 0, to: CENTER })
    }
  })

  it('bots hop the stars toward home', () => {
    const base = place(game(), 'red', [loop(14), home(3), home(2), home(1)])
    const g = rollAs(asBot(base, 'red', 'racer'), 'red', 5)
    // Hop 5 stars from 14 to red's home star (0), 7 steps from home.
    expect(pick(g)).toEqual({ marbleId: 0, to: loop(0) })
  })
})

describe('strength', () => {
  /** Plays a 2-player game: red is a bot of `persona`, blue moves at random. Returns the winner. */
  function botVsRandom(persona: Persona, seed: number): Color {
    const rng = seeded(seed)
    let g = createGame(
      [
        { color: 'red', kind: 'bot' },
        { color: 'blue', kind: 'bot' },
      ],
      rng,
    )
    g = asBot(g, 'red', persona)
    for (let i = 0; i < 20000 && g.phase !== 'gameOver'; i++) {
      if (g.phase === 'roll') {
        g = rollWithValue(g, rollFor(g, rng, true))
        continue
      }
      const red = g.players[g.currentIndex]!.color === 'red'
      const move = red ? chooseBotMove(g, rng)! : g.legalMoves[Math.floor(rng() * g.legalMoves.length)]!
      g = applyMove(g, move.marbleId, move.to)
    }
    expect(g.phase).toBe('gameOver')
    return g.winners[0]!
  }

  for (const persona of PERSONAS) {
    it(`${persona} beats a random mover clearly`, () => {
      const games = 30
      let wins = 0
      for (let seed = 1; seed <= games; seed++) if (botVsRandom(persona, seed * 101) === 'red') wins++
      expect(wins / games).toBeGreaterThanOrEqual(0.75)
    }, 30_000)
  }

  it('bots are not humans: asBot only changes the chosen seat', () => {
    const g = asBot(game(), 'red', 'hunter')
    expect(playerOf(g, 'red').bot?.persona).toBe('hunter')
    expect(playerOf(g, 'blue').bot).toBeNull()
  })
})
