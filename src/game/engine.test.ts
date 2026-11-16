import { describe, expect, it } from 'vitest'
import { createBotProfile } from './bot'
import {
  BASE_ENTRY_CHANCE,
  COMEBACK_CAP,
  applyAction,
  applyMove,
  createGame,
  displayNames,
  isDefaultName,
  endGame,
  entryChance,
  isStuck,
  rollFor,
  rollWithValue,
  takeover,
} from './engine'
import { replay, undoIndex } from './history'
import { BASE, CENTER, game, home, loop, place, playerOf, rollAs } from './testUtils'
import type { GameAction, GameState } from './types'

const current = (g: GameState) => g.players[g.currentIndex]!.color

describe('createGame', () => {
  it('accepts 2 to 6 seats on distinct arms', () => {
    expect(() => createGame([{ color: 'red', kind: 'human' }])).toThrow()
    expect(() =>
      createGame([
        { color: 'red', kind: 'human' },
        { color: 'red', kind: 'bot' },
      ]),
    ).toThrow()
    const six = createGame(
      (['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const).map((color) => ({ color, kind: 'bot' as const })),
      () => 0.5,
    )
    expect(six.players).toHaveLength(6)
  })

  it('seats players in clockwise arm order', () => {
    const g = createGame(
      [
        { color: 'blue', kind: 'human' },
        { color: 'red', kind: 'bot' },
        { color: 'yellow', kind: 'bot' },
      ],
      () => 0,
    )
    expect(g.players.map((p) => p.color)).toEqual(['red', 'yellow', 'blue'])
  })

  it('picks the first player at random from rng (R14)', () => {
    const configs = [
      { color: 'red' as const, kind: 'human' as const },
      { color: 'green' as const, kind: 'human' as const },
      { color: 'blue' as const, kind: 'human' as const },
    ]
    expect(createGame(configs, () => 0).currentIndex).toBe(0)
    expect(createGame(configs, () => 0.5).currentIndex).toBe(1)
    expect(createGame(configs, () => 0.99).currentIndex).toBe(2)
  })

  it('gives bots a profile and humans none', () => {
    const g = createGame([
      { color: 'red', kind: 'human' },
      { color: 'blue', kind: 'bot' },
    ])
    expect(playerOf(g, 'red').bot).toBeNull()
    expect(playerOf(g, 'blue').bot?.persona).toBeDefined()
    expect(g.players.every((p) => p.team === null && p.marbles.every((m) => m.spot.kind === 'base'))).toBe(true)
  })

  it('names seats like Ludo did', () => {
    expect(displayNames([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'bot' }])).toEqual(['You', 'Bot 1'])
    expect(
      displayNames([
        { color: 'red', kind: 'human' },
        { color: 'blue', kind: 'human', remote: true },
      ]),
    ).toEqual(['Host', 'Friend 1'])
    expect(displayNames([{ color: 'red', kind: 'human', name: ' Ana ' }, { color: 'blue', kind: 'human' }])).toEqual(['Ana', 'Player 2'])

  })

  it('never makes up a name that clashes with one a player chose', () => {
    // Blue typed "Player 1": red's default skips to the next free number, and no two names clash.
    expect(displayNames([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'human', name: 'Player 1' }, { color: 'green', kind: 'human' }])).toEqual([
      'Player 2',
      'Player 1',
      'Player 4',
    ])
    expect(displayNames([{ color: 'red', kind: 'human', name: 'player 2' }, { color: 'blue', kind: 'human' }])).toEqual(['player 2', 'Player 3'])
  })

  it('numbers players clockwise from the seat marked as yours', () => {
    const seats = (['red', 'yellow', 'blue'] as const).map((color) => ({ color, kind: 'human' as const, you: color === 'yellow' }))
    expect(displayNames(seats)).toEqual(['Player 3', 'Player 1', 'Player 2'])
  })

  it('tells made-up names from chosen ones', () => {
    expect(['You', 'Host', 'Player 2', 'friend 3', 'Bot 1'].every(isDefaultName)).toBe(true)
    expect(['Ana', 'Player', 'Player Two', 'Bot1x'].some(isDefaultName)).toBe(false)
  })
})

describe('turn flow', () => {
  it('passes the turn when no move is possible (R7)', () => {
    const g = rollAs(game(), 'red', 3)
    expect(g.events).toEqual([
      { type: 'roll', value: 3, color: 'red' },
      { type: 'noMoves', color: 'red', rollAgain: false },
    ])
    expect(current(g)).toBe('blue')
    expect(g.phase).toBe('roll')
  })

  it('rolls again after a 6 even with no move possible (R6)', () => {
    const g = rollAs(place(game(), 'red', [home(3), home(2), home(1), loop(5)]), 'red', 6)
    expect(g.events[1]).toEqual({ type: 'noMoves', color: 'red', rollAgain: true })
    expect(current(g)).toBe('red')
    expect(g.phase).toBe('roll')
  })

  it('rolls again after moving on a 6 (R6)', () => {
    const rolled = rollAs(game(), 'red', 6)
    const moved = applyMove(rolled, 0, loop(7))
    expect(current(moved)).toBe('red')
    expect(moved.phase).toBe('roll')
  })

  it('passes the turn after moving on any other roll', () => {
    const rolled = rollAs(game(), 'red', 1)
    const moved = applyMove(rolled, 0, loop(7))
    expect(current(moved)).toBe('blue')
  })

  it('does not give another roll for a bump (R6)', () => {
    const g = place(place(game(), 'red', [loop(30)]), 'blue', [loop(33)])
    const moved = applyMove(rollAs(g, 'red', 3), 0, loop(33))
    expect(moved.events.map((e) => e.type)).toEqual(['move', 'bump'])
    expect(current(moved)).toBe('blue')
  })

  it('sends a bumped marble back to its base (R5)', () => {
    const g = place(place(game(), 'red', [loop(30)]), 'blue', [loop(33)])
    const moved = applyMove(rollAs(g, 'red', 3), 0, loop(33))
    expect(playerOf(moved, 'blue').marbles[0]?.spot).toEqual(BASE)
    expect(playerOf(moved, 'red').marbles[0]?.spot).toEqual(loop(33))
  })

  it('returns the same state for an illegal move, and in the wrong phase', () => {
    const rolled = rollAs(game(), 'red', 6)
    expect(applyMove(rolled, 0, loop(8))).toBe(rolled)
    expect(applyMove(rolled, 9, loop(7))).toBe(rolled)
    const g = game()
    expect(applyMove(g, 0, loop(7))).toBe(g)
    expect(rollWithValue(rolled, 3)).toBe(rolled)
    expect(rollWithValue(g, 7)).toBe(g)
  })

  it('skips finished players', () => {
    let g = game(['red', 'green', 'blue'])
    g = { ...g, players: g.players.map((p) => (p.color === 'green' ? { ...p, finishRank: 1 } : p)) }
    expect(current(rollAs(g, 'red', 3))).toBe('blue')
  })
})

describe('finishing', () => {
  const nearlyDone = () => place(game(['red', 'green', 'blue']), 'red', [home(3), home(2), home(1), loop(5)])

  it('ranks a player when the last marble gets home, and the game goes on', () => {
    const moved = applyMove(rollAs(nearlyDone(), 'red', 2), 3, home(0))
    expect(playerOf(moved, 'red').finishRank).toBe(1)
    expect(moved.events).toContainEqual({ type: 'finish', color: 'red', rank: 1 })
    expect(moved.winners).toEqual(['red'])
    expect(moved.phase).toBe('roll')
    expect(current(moved)).toBe('green')
  })

  it('does not roll again after finishing on a 6 (R16)', () => {
    const g = place(game(['red', 'green', 'blue']), 'red', [home(3), home(2), home(1), loop(1)])
    const moved = applyMove(rollAs(g, 'red', 6), 3, home(0))
    expect(playerOf(moved, 'red').finishRank).toBe(1)
    expect(current(moved)).toBe('green')
  })

  it('ends the game when one player is left, ranking them last (R15)', () => {
    let g = place(game(['red', 'blue']), 'red', [home(3), home(2), home(1), loop(5)])
    g = applyMove(rollAs(g, 'red', 2), 3, home(0))
    expect(g.phase).toBe('gameOver')
    expect(g.winners).toEqual(['red', 'blue'])
    expect(playerOf(g, 'blue').finishRank).toBe(2)
    expect(g.events.at(-1)).toEqual({ type: 'gameOver', winners: ['red', 'blue'] })
  })
})

describe('endGame', () => {
  it('ranks finished players first, then the rest by progress', () => {
    let g = game(['red', 'green', 'blue'])
    g = place(g, 'red', [loop(30)])
    g = place(g, 'green', [home(0), home(1), home(2), home(3)])
    g = { ...g, players: g.players.map((p) => (p.color === 'green' ? { ...p, finishRank: 1 } : p)) }
    g = place(g, 'blue', [loop(60)])
    const ended = endGame(g)
    expect(ended.phase).toBe('gameOver')
    expect(ended.winners).toEqual(['green', 'blue', 'red'])
    expect(ended.events).toEqual([{ type: 'gameOver', winners: ['green', 'blue', 'red'], early: true }])
    expect(endGame(ended)).toBe(ended)
  })
})

describe('takeover', () => {
  it('hands a human seat to a bot named after the existing bots', () => {
    const g = game(['red', 'green', 'blue'], ['human', 'bot', 'human'])
    const bot = createBotProfile(() => 0.5, 'hunter')
    const next = takeover(g, 'blue', bot)
    expect(playerOf(next, 'blue')).toMatchObject({ kind: 'bot', name: 'Bot 2', bot, remote: false })
    expect(next.events).toEqual([{ type: 'takeover', color: 'blue', from: 'Player 2', to: 'Bot 2' }])
    expect(takeover(next, 'blue', bot)).toBe(next)
  })
})

describe('comeback dice (R13)', () => {
  const stuck = (dryRolls: number) => {
    const g = game()
    return { ...g, players: g.players.map((p) => (p.color === 'red' ? { ...p, dryRolls } : p)) }
  }

  it('counts dry rolls only while stuck, resetting on a 1 or a 6', () => {
    let g = rollAs(game(), 'red', 3)
    expect(playerOf(g, 'red').dryRolls).toBe(1)
    g = rollAs(g, 'red', 4)
    expect(playerOf(g, 'red').dryRolls).toBe(2)
    g = rollAs(g, 'red', 1)
    expect(playerOf(g, 'red').dryRolls).toBe(0)
    expect(playerOf(rollAs(place(game(), 'red', [loop(30)]), 'red', 3), 'red').dryRolls).toBe(0)
  })

  it('treats a player with a marble in the centre as not stuck', () => {
    expect(isStuck(playerOf(game(), 'red'))).toBe(true)
    expect(isStuck(playerOf(place(game(), 'red', [CENTER]), 'red'))).toBe(false)
    expect(isStuck(playerOf(place(game(), 'red', [home(3)]), 'red'))).toBe(true)
  })

  it('stays fair through the grace period, then rises to a cap', () => {
    expect(entryChance(playerOf(stuck(2), 'red'), true)).toBe(BASE_ENTRY_CHANCE)
    expect(entryChance(playerOf(stuck(3), 'red'), true)).toBeCloseTo(1 / 3 + 0.08)
    expect(entryChance(playerOf(stuck(50), 'red'), true)).toBe(COMEBACK_CAP)
    expect(entryChance(playerOf(stuck(50), 'red'), false)).toBe(BASE_ENTRY_CHANCE)
  })

  it('rolls a 1 or 6 with the boosted chance, and 2-5 otherwise', () => {
    const g = stuck(50)
    expect(rollFor(g, () => 0.1, true)).toBe(1)
    expect(rollFor(g, () => 0.4, true)).toBe(6)
    const others = [0.65, 0.75, 0.85, 0.95].map((u) => rollFor(g, () => u, true))
    expect(others).toEqual([2, 3, 4, 5])
    expect(rollFor(stuck(0), () => 0, true)).toBe(1)
  })
})

describe('history', () => {
  it('replays recorded actions to the same state', () => {
    const initial = game()
    const actions: GameAction[] = [
      { type: 'roll', value: 6, actor: 'human' },
      { type: 'move', marbleId: 0, to: loop(7), actor: 'human' },
      { type: 'roll', value: 4, actor: 'human' },
      { type: 'move', marbleId: 0, to: loop(11), actor: 'human' },
    ]
    const { state, eventsPerAction } = replay(initial, actions)
    expect(playerOf(state, 'red').marbles[0]?.spot).toEqual(loop(11))
    expect(eventsPerAction).toHaveLength(4)
    let manual = initial
    for (const a of actions) manual = applyAction(manual, a)
    expect(manual).toEqual(state)
  })

  it('undoes one human decision at a time: the move first, then the roll', () => {
    const actions: GameAction[] = [
      { type: 'roll', value: 6, actor: 'human' },
      { type: 'move', marbleId: 0, to: loop(7), actor: 'human' },
      { type: 'roll', value: 3, actor: 'bot' },
    ]
    // The bot's roll goes with the human move it followed.
    expect(undoIndex(actions)).toBe(1)
    expect(undoIndex(actions.slice(0, 1))).toBe(0)
    expect(undoIndex([{ type: 'roll', value: 3, actor: 'bot' }])).toBeNull()
    expect(undoIndex([])).toBeNull()
  })
})
