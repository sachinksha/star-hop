/**
 * House rules R22-R24, each tested against the examples it was specified with.
 */
import { describe, expect, it } from 'vitest'
import { STAR_INDICES, preStartIndex, sameSpot, spotKey, startIndex } from './board'
import { bumpRisk, chooseBotMove, scoreMove } from './bot'
import { applyAction, applyMove, createGame, rollWithValue } from './engine'
import { replay } from './history'
import { assignTeams, isHelperTurn, moverOf } from './teams'
import { CENTER, home, loop, place, playerOf } from './testUtils'
import { NO_HOUSE_RULES, type Color, type GameState, type HouseRules, type Move, type Spot } from './types'

const SIXES: HouseRules = { ...NO_HOUSE_RULES, rollSixesFirst: true }
const CROSS: HouseRules = { ...NO_HOUSE_RULES, crossCentre: true }
const SAFE: HouseRules = { ...NO_HOUSE_RULES, safeStarts: true }

/** A two- or more-player game with house rules, the first colour to move. */
function game(rules: HouseRules, colors: Color[] = ['red', 'blue']): GameState {
  const g = createGame(colors.map((color) => ({ color, kind: 'human' as const })), () => 0, rules)
  return { ...g, currentIndex: g.players.findIndex((p) => p.color === colors[0]) }
}
const current = (g: GameState) => g.players[g.currentIndex]!.color
const dests = (g: GameState, marbleId = 0, die?: number): Spot[] =>
  g.legalMoves.filter((m) => m.marbleId === marbleId && (die === undefined || m.die === die)).map((m) => m.to)
const has = (spots: Spot[], s: Spot) => spots.some((x) => sameSpot(x, s))
const star = (arm: number): Spot => loop(STAR_INDICES[arm]!)

describe('R22: roll all the sixes first, then use the dice in any order', () => {
  it('banks a 6 and asks for another roll before any marble moves', () => {
    const g = place(game(SIXES), 'red', [loop(30)])
    const six = rollWithValue(g, 6)
    expect(six.phase).toBe('roll')
    expect(six.pool).toEqual([6])
    expect(six.legalMoves).toEqual([])
    expect(current(six)).toBe('red')
    const again = rollWithValue(six, 6)
    expect(again.pool).toEqual([6, 6])
    const done = rollWithValue(again, 3)
    expect(done.phase).toBe('move')
    expect(done.pool).toEqual([6, 6, 3])
    // Moves are offered for each different die, grouped by die.
    expect([...new Set(done.legalMoves.map((m) => m.die))]).toEqual([6, 3])
  })

  it('uses the dice in the order the player picks, then passes the turn', () => {
    let g = place(game(SIXES), 'red', [loop(30)])
    g = rollWithValue(rollWithValue(g, 6), 3)
    // Use the 3 first, then the 6.
    const three = applyMove(g, 0, loop(33), 3)
    expect(three.phase).toBe('move')
    expect(three.pool).toEqual([6])
    expect(three.legalMoves.every((m) => m.die === 6)).toBe(true)
    const six = applyMove(three, 0, loop(39), 6)
    expect(six.pool).toEqual([])
    expect(current(six)).toBe('blue') // no extra roll: the bonus was already rolled
  })

  it('lets a 6 bring a marble out and the next die move it', () => {
    // Everything in base: only the 6 can be used first (to enter); then the 4 moves the new marble.
    const g = rollWithValue(rollWithValue(game(SIXES), 6), 4)
    expect([...new Set(g.legalMoves.map((m) => m.die))]).toEqual([6])
    const entered = applyMove(g, 0, loop(startIndex('red')), 6)
    expect(dests(entered, 0, 4)).toEqual([loop(startIndex('red') + 4)])
  })

  // Red: marble 0 on its pre-start (1 step from home), 1 in home slot 0, 2 and 3 in slots 2 and 3.
  const crowdedHome = () => place(game(SIXES), 'red', [loop(preStartIndex('red')), home(0), home(2), home(3)])

  it('loses dice the chosen order leaves unusable, and says so', () => {
    // Pool 6, 1: only the 1 can move (marble 1 up to slot 1); after that nothing can use the 6.
    const g = rollWithValue(rollWithValue(crowdedHome(), 6), 1)
    expect(g.legalMoves.map((m) => [m.die, m.marbleId])).toEqual([[1, 1]])
    const used = applyMove(g, 1, home(1), 1)
    expect(used.events).toContainEqual({ type: 'noMoves', color: 'red', rollAgain: false, unused: [6] })
    expect(current(used)).toBe('blue')
  })

  it('passes the turn after the last roll when no die can move, with no bonus roll', () => {
    // Pool 6, 2: nothing can move, so both are lost; the 6 does not earn a roll (it already did).
    const g = rollWithValue(rollWithValue(crowdedHome(), 6), 2)
    expect(g.events[1]).toEqual({ type: 'noMoves', color: 'red', rollAgain: false, unused: [6, 2] })
    expect(current(g)).toBe('blue')
    expect(g.pool).toEqual([])
  })

  it('ends the turn when a move finishes the player, losing the rest of the pool (R16)', () => {
    let g = place(game(SIXES, ['red', 'orange', 'blue']), 'red', [home(1), home(2), home(3), loop(preStartIndex('red'))])
    g = rollWithValue(rollWithValue(g, 6), 1)
    const done = applyMove(g, 3, home(0), 1)
    expect(playerOf(done, 'red').finishRank).toBe(1)
    expect(done.pool).toEqual([])
    expect(current(done)).toBe('orange')
  })

  it('accepts a recorded move without a die, using the first die that fits', () => {
    let g = place(game(SIXES), 'red', [loop(30)])
    g = rollWithValue(rollWithValue(g, 6), 3)
    const moved = applyAction(g, { type: 'move', marbleId: 0, to: loop(33), actor: 'human' })
    expect(moved.pool).toEqual([6])
    expect(applyMove(g, 0, loop(33), 5)).toBe(g) // a die that isn't in the pool
  })

  it('keeps a finished player’s choice of teammate for every banked roll', () => {
    const teams = assignTeams(4, 2)
    const colors: Color[] = ['red', 'orange', 'green', 'blue']
    let g = createGame(colors.map((color, i) => ({ color, kind: 'human' as const, team: teams[i]! })), () => 0, SIXES)
    g = place(g, 'red', [home(0), home(1), home(2), home(3)])
    g = { ...g, currentIndex: 0, players: g.players.map((p) => (p.color === 'red' ? { ...p, finishRank: 1 } : p)), winners: ['red'] }
    g = place(g, 'green', [loop(50)])
    expect(isHelperTurn(g)).toBe(true)
    const first = rollWithValue(g, 6, 'green')
    expect(first.playingFor).toBe('green')
    expect(isHelperTurn(first)).toBe(false)
    expect(rollWithValue(first, 3, 'red')).toBe(first) // no switching mid-turn
    const second = rollWithValue(first, 3)
    expect(second.phase).toBe('move')
    expect(moverOf(second).color).toBe('green') // green's marbles move, for both dice
  })
})

describe('R22 bots: planning the order of the dice', () => {
  /** Every total of a two-dice plan: first move's score plus the best second move's. */
  function bestTwoStepTotal(g: GameState): number {
    let best = -Infinity
    for (const first of g.legalMoves) {
      const after = applyMove(g, first.marbleId, first.to, first.die)
      const follow = after.phase === 'move' && after.currentIndex === g.currentIndex ? Math.max(...after.legalMoves.map((m) => scoreMove(after, m))) : 0
      best = Math.max(best, scoreMove(g, first) + follow)
    }
    return best
  }

  it('with two dice, always starts an optimal plan (checked by brute force)', () => {
    let differs = 0
    for (let seed = 1; seed <= 40; seed++) {
      const r = (n: number) => (seed * 7919 + n * 104729) % 84
      let g = game(SIXES, ['red', 'blue'])
      g = place(g, 'red', [loop(r(1)), loop((r(1) + 3 + (seed % 5)) % 84)])
      g = place(g, 'blue', [loop(r(2)), loop(r(3))])
      g = rollWithValue(rollWithValue(g, 6), 1 + (seed % 5))
      if (g.phase !== 'move' || g.pool.length !== 2) continue
      const chosen = chooseBotMove(g, () => 0)!
      const after = applyMove(g, chosen.marbleId, chosen.to, chosen.die)
      const follow = after.phase === 'move' && after.currentIndex === g.currentIndex ? Math.max(...after.legalMoves.map((m) => scoreMove(after, m))) : 0
      expect(scoreMove(g, chosen) + follow).toBeCloseTo(bestTwoStepTotal(g), 6)
      // Count positions where the greedy first move would not have been the planned one.
      const greedy = [...g.legalMoves].sort((a, b) => scoreMove(g, b) - scoreMove(g, a))[0]!
      if (greedy !== chosen) differs++
    }
    // Planning matters: in some positions the best-looking first move is not the best plan.
    expect(differs).toBeGreaterThan(0)
  })
})

describe('R23: walking across the centre from a star', () => {
  // Red on star S1 (loop 14), the star where arm 0 meets arm 1.
  const onStar = (rules: HouseRules) => place(game(rules), 'red', [star(1)])

  it('example 3: a 1 from a star goes down the arm, to the next star, or into the centre', () => {
    const g = rollWithValue(onStar(CROSS), 1)
    expect(dests(g)).toHaveLength(3)
    expect(has(dests(g), loop(15))).toBe(true)
    expect(has(dests(g), star(2))).toBe(true)
    expect(has(dests(g), CENTER)).toBe(true)
  })

  it('example 1: a 2 can cross the centre to any star except the one it started on', () => {
    const d = dests(rollWithValue(onStar(CROSS), 2))
    for (let arm = 0; arm < 6; arm++) {
      expect(has(d, star(arm)), `star ${arm}`).toBe(arm !== 1)
    }
    expect(has(d, CENTER)).toBe(true) // next star, then into the centre
  })

  it('example 2: a 3 can come back to where it started, but not to the star it passed first', () => {
    const g = rollWithValue(onStar(CROSS), 3)
    const d = dests(g)
    expect(has(d, star(1))).toBe(true) // S1 -> S2 -> centre -> S1: stay put
    expect(has(d, star(2))).toBe(false) // that would step straight back from the centre
    expect(has(d, star(4))).toBe(true)
    const stay = g.legalMoves.find((m) => sameSpot(m.to, star(1)))!
    expect(stay.via).toBe('cross')
    expect(stay.path).toEqual([star(2), CENTER, star(1)])
  })

  it('can stop on a star after crossing and walk the rest down its arm', () => {
    const d = dests(rollWithValue(onStar(CROSS), 3))
    // S1 -> centre -> S4 (loop 56), then one step down arm 4: loop 57.
    expect(has(d, loop(57))).toBe(true)
  })

  it('example 4: own marbles still block, in the centre and on the stars', () => {
    let g = place(game(CROSS), 'red', [star(1), CENTER])
    let d = dests(rollWithValue(g, 2))
    // The centre is blocked, so no star except via the ring.
    expect(has(d, star(4))).toBe(false)
    expect(has(d, star(3))).toBe(true) // S1 -> S2 -> S3
    g = place(game(CROSS), 'red', [star(1), star(2)])
    const rolled = rollWithValue(g, 2)
    // S3 is still reachable, but only through the centre: never past its own marble on S2.
    const toS3 = rolled.legalMoves.find((m) => m.marbleId === 0 && sameSpot(m.to, star(3)))!
    expect(toS3.path).toEqual([CENTER, star(3)])
    expect(rolled.legalMoves.some((m) => m.path.some((p) => sameSpot(p, star(2))) && m.marbleId === 0)).toBe(false)
  })

  it('passes over an opponent in the centre, and bumps one it lands on', () => {
    let g = place(game(CROSS), 'red', [star(1)])
    g = place(g, 'blue', [CENTER, star(4)])
    const rolled = rollWithValue(g, 2)
    expect(rolled.legalMoves.find((m) => sameSpot(m.to, star(4)))!.bumped).toEqual({ color: 'blue', marbleId: 1 })
    expect(rollWithValue(g, 1).legalMoves.find((m) => sameSpot(m.to, CENTER))!.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })

  it('a marble in the centre still needs a 1 to leave (unchanged)', () => {
    const g = place(game(CROSS), 'red', [CENTER])
    expect(rollWithValue(g, 3).legalMoves).toHaveLength(0)
    expect(dests(rollWithValue(g, 1))).toHaveLength(6)
  })

  it('without the rule, a 2 from a star cannot cross the centre', () => {
    const d = dests(rollWithValue(onStar(NO_HOUSE_RULES), 2))
    expect(has(d, star(4))).toBe(false)
    expect(has(d, star(3))).toBe(true)
  })
})

describe('R24: safe start holes', () => {
  const S = startIndex('red') // red's start: loop 7
  const blueOnRedStart = (rules: HouseRules) => place(place(game(rules, ['blue', 'red']), 'red', [loop(S)]), 'blue', [loop(S - 3)])

  it('1-2: a visitor landing on the owner’s start shares it; the owner is safe', () => {
    const rolled = rollWithValue(blueOnRedStart(SAFE), 3)
    const move = rolled.legalMoves.find((m) => sameSpot(m.to, loop(S)))!
    expect(move.bumped).toBeNull()
    const shared = applyMove(rolled, move.marbleId, move.to)
    expect(playerOf(shared, 'red').marbles[0]!.spot).toEqual(loop(S))
    expect(playerOf(shared, 'blue').marbles[0]!.spot).toEqual(loop(S))
  })

  it('without the rule, the visitor bumps the owner', () => {
    const rolled = rollWithValue(blueOnRedStart(NO_HOUSE_RULES), 3)
    expect(rolled.legalMoves.find((m) => sameSpot(m.to, loop(S)))!.bumped).toEqual({ color: 'red', marbleId: 0 })
  })

  it('3: the owner can’t bring out a second marble while one sits on start', () => {
    const g = place(game(SAFE), 'red', [loop(S)])
    expect(rollWithValue(g, 6).legalMoves.some((m) => m.from.kind === 'base')).toBe(false)
  })

  it('4: the owner entering from base bumps a visitor sitting on their start', () => {
    const g = place(game(SAFE), 'blue', [loop(S)])
    const rolled = rollWithValue(g, 6)
    const enter = rolled.legalMoves.find((m) => m.via === 'enter')!
    expect(enter.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })

  it('a visitor is not safe there: a third player landing bumps the visitor, never the owner', () => {
    let g = createGame(['red', 'yellow', 'blue'].map((color) => ({ color: color as Color, kind: 'human' as const })), () => 0, SAFE)
    g = place(g, 'red', [loop(S)])
    g = place(g, 'blue', [loop(S)])
    g = place(g, 'yellow', [loop(S - 2)])
    g = { ...g, currentIndex: g.players.findIndex((p) => p.color === 'yellow') }
    const move = rollWithValue(g, 2).legalMoves.find((m) => sameSpot(m.to, loop(S)))!
    expect(move.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })

  it('a visitor alone on someone’s start is bumped by the next player to land there', () => {
    // Blue sits on red's start with red nowhere near; yellow lands on it.
    let g = createGame(['red', 'yellow', 'blue'].map((color) => ({ color: color as Color, kind: 'human' as const })), () => 0, SAFE)
    g = place(g, 'blue', [loop(S)])
    g = place(g, 'yellow', [loop(S - 2)])
    g = { ...g, currentIndex: g.players.findIndex((p) => p.color === 'yellow') }
    const move = rollWithValue(g, 2).legalMoves.find((m) => sameSpot(m.to, loop(S)))!
    expect(move.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })

  it('5: a visitor’s own marbles still can’t pass or land on it there', () => {
    let g = place(blueOnRedStart(SAFE), 'blue', [loop(S), loop(S - 2)])
    g = rollWithValue(g, 3)
    // Blue's marble on S-2 can't jump blue's own marble sitting on red's start.
    expect(g.legalMoves.some((m) => m.marbleId === 1)).toBe(false)
  })

  it('bots see no danger on their own start hole', () => {
    let g = place(game(SAFE), 'red', [loop(S)])
    g = place(g, 'blue', [loop(S - 2)])
    expect(bumpRisk(g.players, 'red', loop(S), SAFE)).toBe(0)
    expect(bumpRisk(g.players, 'red', loop(S), NO_HOUSE_RULES)).toBeGreaterThan(0)
  })
})

describe('house rules are part of the game', () => {
  it('are stored in the state, so a replay plays by the same rules', () => {
    const rules: HouseRules = { rollSixesFirst: true, crossCentre: true, safeStarts: true }
    const g = createGame([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'human' }], () => 0, rules)
    expect(g.rules).toEqual(rules)
    const actions = [{ type: 'roll' as const, value: 6, actor: 'human' as const }, { type: 'roll' as const, value: 3, actor: 'human' as const }]
    expect(replay(g, actions).state.pool).toEqual([6, 3])
  })

  it('a move only lists a destination once per die', () => {
    const g = rollWithValue(place(game(CROSS), 'red', [star(1)]), 4)
    const keys = g.legalMoves.map((m: Move) => `${m.die}:${spotKey('red', m.to)}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
