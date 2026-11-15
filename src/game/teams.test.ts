import { describe, expect, it } from 'vitest'
import { bumpChances, bumpRisk, chooseBotMove, chooseHelperTarget, scoreMove, teammateCrowding } from './bot'
import { applyAction, applyMove, createGame, endGame, passRoll, rollFor, rollWithValue } from './engine'
import { replay } from './history'
import { assignTeams, helperTargets, isHelperTurn, moverOf, teamStandings, TEAM_OPTIONS } from './teams'
import { home, loop, place, playerOf, seeded } from './testUtils'
import { startIndex } from './board'
import type { Color, GameAction, GameState, PlayerKind } from './types'

const COLORS4: Color[] = ['red', 'orange', 'green', 'blue']

/** Red+green (team 0) against orange+blue (team 1), red to roll. */
function teamGame(kinds: PlayerKind[] = []): GameState {
  const teams = assignTeams(4, 2)
  return createGame(
    COLORS4.map((color, i) => ({ color, kind: kinds[i] ?? 'human', team: teams[i]! })),
    () => 0,
  )
}

const allHome = [home(0), home(1), home(2), home(3)]
/** Marks a seat finished with every marble home. */
function finish(g: GameState, color: Color, rank: number): GameState {
  const placed = place(g, color, allHome)
  return {
    ...placed,
    players: placed.players.map((p) => (p.color === color ? { ...p, finishRank: rank } : p)),
    winners: [...placed.winners, color],
  }
}
const turnOf = (g: GameState, color: Color): GameState => ({ ...g, currentIndex: g.players.findIndex((p) => p.color === color) })

describe('team setup', () => {
  it('offers pairs for 4 players and teams of 3 or pairs for 6', () => {
    expect(TEAM_OPTIONS[4]).toEqual([2])
    expect(TEAM_OPTIONS[6]).toEqual([2, 3])
    expect(TEAM_OPTIONS[5]).toBeUndefined()
  })

  it('alternates teams round the board, so partners sit opposite', () => {
    expect(assignTeams(4, 2)).toEqual([0, 1, 0, 1])
    expect(assignTeams(6, 3)).toEqual([0, 1, 2, 0, 1, 2])
    const g = teamGame()
    expect(g.players.map((p) => [p.color, p.team])).toEqual([
      ['red', 0],
      ['orange', 1],
      ['green', 0],
      ['blue', 1],
    ])
  })

  it('rejects a game where only some seats have a team', () => {
    expect(() =>
      createGame([
        { color: 'red', kind: 'human', team: 0 },
        { color: 'green', kind: 'human' },
      ]),
    ).toThrow(/team/)
  })
})

describe('teammates on the board (R18)', () => {
  it("bumps a teammate's marble on landing, like anyone's, and can jump it", () => {
    // Red on 20; green (red's partner) on 22. A 2 lands on green and bumps it. A 3 jumps it.
    let g = place(teamGame(), 'red', [loop(20)])
    g = place(g, 'green', [loop(22)])
    const two = rollWithValue(g, 2)
    expect(two.legalMoves.map((m) => m.bumped)).toEqual([{ color: 'green', marbleId: 0 }])
    const moved = applyMove(two, 0, loop(22))
    expect(playerOf(moved, 'green').marbles[0]!.spot).toEqual({ kind: 'base' })
    expect(moved.events).toContainEqual({ type: 'bump', color: 'red', victim: 'green', friendly: true })
    const three = rollWithValue(g, 3)
    expect(three.legalMoves.map((m) => m.to)).toEqual([loop(23)])
  })

  it('bumps opponents without the friendly flag', () => {
    let g = place(teamGame(), 'red', [loop(20)])
    g = place(g, 'orange', [loop(22)])
    const two = rollWithValue(g, 2)
    expect(two.legalMoves[0]!.bumped).toEqual({ color: 'orange', marbleId: 0 })
    expect(applyMove(two, 0, loop(22)).events).toContainEqual({ type: 'bump', color: 'red', victim: 'orange' })
  })

  it('bumps a teammate sitting on your start hole when you enter', () => {
    const g = place(teamGame(), 'green', [loop(startIndex('red'))])
    const moves = rollWithValue(g, 6).legalMoves
    expect(moves.length).toBeGreaterThan(0)
    // Each base marble may enter, and every entry bumps green.
    expect(moves.every((m) => m.bumped?.color === 'green')).toBe(true)
  })

  it("leaves teammates out of the bots' danger estimate", () => {
    // Green sits 3 behind red: a teammate, so no danger. Orange in the same place would be.
    const spot = loop(33)
    const withPartner = place(place(teamGame(), 'red', [spot]), 'green', [loop(30)])
    expect(bumpRisk(withPartner.players, 'red', spot)).toBe(0)
    const withOpponent = place(place(teamGame(), 'red', [spot]), 'orange', [loop(30)])
    expect(bumpRisk(withOpponent.players, 'red', spot)).toBeGreaterThan(0)
  })
})

describe('rolling for a teammate (R19, R20)', () => {
  /** Red has finished; green (red's partner) is still playing. Red to roll. */
  const helperGame = () => turnOf(place(finish(teamGame(), 'red', 1), 'green', [loop(50)]), 'red')

  it('keeps a finished player in the turn order while a teammate plays', () => {
    let g = finish(teamGame(), 'red', 1)
    g = turnOf(place(g, 'blue', [loop(70)]), 'blue')
    const after = applyAction(g, { type: 'roll', value: 2, actor: 'human' })
    const moved = applyMove(after, 0, loop(72))
    expect(moved.players[moved.currentIndex]!.color).toBe('red')
    expect(isHelperTurn(moved)).toBe(true)
  })

  it('must say which teammate the roll is for', () => {
    const g = helperGame()
    expect(helperTargets(g).map((p) => p.color)).toEqual(['green'])
    expect(rollWithValue(g, 3)).toBe(g)
    expect(rollWithValue(g, 3, 'orange')).toBe(g)
    expect(rollWithValue(g, 3, 'red')).toBe(g)
  })

  it("moves the teammate's marbles and records who rolled", () => {
    const rolled = rollWithValue(helperGame(), 3, 'green')
    expect(rolled.phase).toBe('move')
    expect(rolled.playingFor).toBe('green')
    expect(moverOf(rolled).color).toBe('green')
    expect(rolled.events[0]).toEqual({ type: 'roll', value: 3, color: 'red', for: 'green' })
    expect(playerOf(rolled, 'red').lastRoll).toBe(3)

    const moved = applyMove(rolled, 0, loop(53))
    expect(playerOf(moved, 'green').marbles[0]!.spot).toEqual(loop(53))
    expect(moved.events[0]).toMatchObject({ type: 'move', color: 'green', by: 'red' })
    expect(moved.playingFor).toBeNull()
    expect(moved.players[moved.currentIndex]!.color).toBe('orange')
  })

  it("doesn't let a roller pick their own colour while they still play", () => {
    const g = place(teamGame(), 'red', [loop(20)])
    expect(rollWithValue(g, 2, 'green')).toBe(g)
    expect(rollWithValue(g, 2, 'red').phase).toBe('move')
  })

  it('keeps the chosen teammate for the bonus roll after a 6', () => {
    const rolled = rollWithValue(helperGame(), 6, 'green')
    const moved = applyMove(rolled, 0, loop(56))
    expect(moved.players[moved.currentIndex]!.color).toBe('red')
    expect(moved.phase).toBe('roll')
    // The choice sticks: no new choice, and no switching teammate mid-turn.
    expect(moved.playingFor).toBe('green')
    expect(isHelperTurn(moved)).toBe(false)
    expect(passRoll(moved)).toBe(moved)
    const again = rollWithValue(moved, 2)
    expect(again.playingFor).toBe('green')
    expect(again.events[0]).toEqual({ type: 'roll', value: 2, color: 'red', for: 'green' })
    expect(rollWithValue(moved, 2, 'red')).toBe(moved)
    // The turn passes after the bonus move, and the choice is cleared.
    const done = applyMove(again, 0, loop(58))
    expect(done.playingFor).toBeNull()
    expect(done.players[done.currentIndex]!.color).toBe('orange')
  })

  it('ends the turn when the teammate rolled for finishes, even on a 6', () => {
    let g = finish(teamGame(), 'red', 1)
    // Green needs a 6 to finish: last marble 6 steps from home slot 0.
    g = place(g, 'green', [home(1), home(2), home(3), loop(startIndex('green') - 6)])
    g = place(g, 'orange', [loop(70)])
    const rolled = rollWithValue(turnOf(g, 'red'), 6, 'green')
    const done = applyMove(rolled, 3, home(0))
    expect(done.events.map((e) => e.type)).toContain('gameOver')
  })

  it("ends a player's own turn when they finish on a 6, and they roll for a teammate next turn", () => {
    let g = place(teamGame(), 'red', [home(1), home(2), home(3), loop(startIndex('red') - 6)])
    g = place(g, 'green', [loop(50)])
    const done = applyMove(rollWithValue(g, 6), 3, home(0))
    expect(playerOf(done, 'red').finishRank).toBe(1)
    expect(done.players[done.currentIndex]!.color).toBe('orange')
    expect(done.pool).toEqual([])
  })

  it('uses the teammate’s comeback odds', () => {
    // Green is stuck with many dry rolls; red (finished) rolls for green.
    let g = helperGame()
    g = place(g, 'green', [])
    g = { ...g, players: g.players.map((p) => (p.color === 'green' ? { ...p, dryRolls: 10 } : p)) }
    // u = 0.5 is above fair odds (1/3) but below the 60% cap: an entry roll only with the boost.
    expect(rollFor(g, () => 0.5, true, 'green')).toBe(6)
    expect(rollFor(g, () => 0.5, false, 'green')).toBe(4)
  })

  it('lets a finished player pass, but nobody else', () => {
    const passed = passRoll(helperGame())
    expect(passed.events).toEqual([{ type: 'pass', color: 'red' }])
    expect(passed.players[passed.currentIndex]!.color).toBe('orange')
    const normal = teamGame()
    expect(passRoll(normal)).toBe(normal)
    expect(applyAction(normal, { type: 'pass', actor: 'human' })).toBe(normal)
  })
})

describe('team finish and game over (R21)', () => {
  it('ends the game when a whole team is home, ranking the rest by progress', () => {
    // Red is done; green needs one step. Orange is further along than blue.
    let g = finish(teamGame(), 'red', 1)
    g = place(g, 'green', [home(1), home(2), home(3), loop(startIndex('green') - 1)])
    g = place(g, 'orange', [loop(30)])
    g = place(g, 'blue', [loop(startIndex('blue'))])
    const rolled = rollWithValue(turnOf(g, 'red'), 1, 'green')
    const done = applyMove(rolled, 3, home(0))
    expect(done.phase).toBe('gameOver')
    expect(done.events.map((e) => e.type)).toEqual(['move', 'finish', 'teamFinish', 'gameOver'])
    expect(done.events).toContainEqual({ type: 'teamFinish', team: 0, rank: 1 })
    expect(teamStandings(done).map((t) => [t.team, t.rank])).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  it('plays on with three teams until two have finished', () => {
    const teams = assignTeams(6, 3)
    const colors: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
    let g = createGame(colors.map((color, i) => ({ color, kind: 'human' as const, team: teams[i]! })), () => 0)
    g = finish(g, 'red', 1) // team 0: red + green
    g = place(g, 'green', [home(1), home(2), home(3), loop(startIndex('green') - 1)])
    const done = applyMove(rollWithValue(turnOf(g, 'green'), 1), 3, home(0))
    expect(done.phase).toBe('roll')
    expect(done.events).toContainEqual({ type: 'teamFinish', team: 0, rank: 1 })
    // Red and green no longer take turns.
    expect(['red', 'green']).not.toContain(done.players[done.currentIndex]!.color)
  })

  it('orders teams by their last finisher when a game ends early', () => {
    let g = finish(teamGame(), 'blue', 1)
    g = place(g, 'red', [loop(60), loop(61)])
    g = place(g, 'green', [loop(10)])
    const ended = endGame(g)
    // Blue finished, but orange (blue's partner) has nothing out, so orange is ranked
    // last and team B's place is decided by orange.
    expect(teamStandings(ended)[0]!.team).toBe(0)
  })
})

describe('team bots', () => {
  it('avoids bumping a teammate when it has another move', () => {
    // Red (bot) rolls 2: marble 0 on 20 would bump green on 22; marble 1 on 40 just walks.
    let g = place(teamGame(['bot', 'bot', 'bot', 'bot']), 'red', [loop(20), loop(40)])
    g = place(g, 'green', [loop(22)])
    const rolled = rollWithValue(g, 2)
    expect(rolled.legalMoves.some((m) => m.bumped?.color === 'green')).toBe(true)
    for (let seed = 1; seed <= 20; seed++) expect(chooseBotMove(rolled, seeded(seed))!.bumped).toBeNull()
  })

  it("scores a teammate bump below a plain move and an opponent bump above it", () => {
    let g = place(teamGame(), 'red', [loop(20), loop(40)])
    g = place(g, 'green', [loop(22)])
    g = place(g, 'orange', [loop(42)])
    const rolled = rollWithValue(g, 2)
    const friendly = rolled.legalMoves.find((m) => m.bumped?.color === 'green')!
    const enemy = rolled.legalMoves.find((m) => m.bumped?.color === 'orange')!
    expect(scoreMove(rolled, friendly)).toBeLessThan(0)
    expect(scoreMove(rolled, enemy)).toBeGreaterThan(scoreMove(rolled, friendly) + 100)
  })

  it('bumps a teammate only when it is the one legal move (moving is compulsory)', () => {
    let g = place(teamGame(['bot', 'bot', 'bot', 'bot']), 'red', [loop(20)])
    g = place(g, 'green', [loop(22)])
    const rolled = rollWithValue(g, 2)
    expect(chooseBotMove(rolled, seeded(1))!.bumped).toEqual({ color: 'green', marbleId: 0 })
  })

  it("doesn't count teammates as targets, and dislikes parking in a teammate's path", () => {
    // Green sits 3 ahead of red: as an opponent it would be a target; as a teammate it isn't.
    let g = place(teamGame(), 'red', [loop(30)])
    g = place(g, 'green', [loop(33)])
    expect(bumpChances(g.players, 'red', 0)).toBe(0)
    // Red on 33 with green 3 behind: green might have to land on red.
    let h = place(teamGame(), 'red', [loop(33)])
    h = place(h, 'green', [loop(30)])
    expect(teammateCrowding(h.players, 'red', loop(33))).toBeGreaterThan(0)
    expect(teammateCrowding(h.players, 'red', loop(60))).toBe(0)
  })

  it('rolls for the teammate who gains most', () => {
    // Red (finished) can roll for green (stuck in base) or... only green in 4-player pairs.
    // With teams of 3, red chooses between green-like partners: use 6 players.
    const teams = assignTeams(6, 2) // red, yellow, blue vs orange, green, purple
    const colors: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
    let g = createGame(colors.map((color, i) => ({ color, kind: 'bot' as const, team: teams[i]! })), () => 0)
    g = turnOf(finish(g, 'red', 1), 'red')
    // Yellow is one step from bumping an orange marble; blue has nothing on the board.
    g = place(g, 'yellow', [loop(40)])
    g = place(g, 'orange', [loop(42)])
    expect(helperTargets(g).map((p) => p.color)).toEqual(['yellow', 'blue'])
    expect(chooseHelperTarget(g)).toBe('yellow')
  })

  it('finishes bot-only team games, and replays them exactly', () => {
    let sawHelper = false
    const bumps = { friendly: 0, enemy: 0 }
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rng = seeded(seed)
      const teams = assignTeams(4, 2)
      let g = createGame(COLORS4.map((color, i) => ({ color, kind: 'bot' as const, team: teams[i]! })), rng)
      const initial = g
      const actions: GameAction[] = []
      for (let i = 0; i < 20000 && g.phase !== 'gameOver'; i++) {
        let action: GameAction
        if (g.phase === 'roll') {
          const forColor = chooseHelperTarget(g) ?? undefined
          if (forColor) sawHelper = true
          action = { type: 'roll', value: rollFor(g, rng, true, forColor), actor: 'bot', ...(forColor ? { for: forColor } : {}) }
        } else {
          const move = chooseBotMove(g, rng)!
          action = { type: 'move', marbleId: move.marbleId, to: move.to, actor: 'bot' }
        }
        const next = applyAction(g, action)
        expect(next).not.toBe(g)
        for (const e of next.events) if (e.type === 'bump') bumps[e.friendly ? 'friendly' : 'enemy']++
        actions.push(action)
        g = next
      }
      expect(g.phase).toBe('gameOver')
      expect(teamStandings(g)).toHaveLength(2)
      expect(replay(initial, actions).state).toEqual(g)
    }
    // A game can end before a finished player's turn comes round, but not all of them.
    expect(sawHelper).toBe(true)
    // Friendly fire is legal but rare: only when a bot has no better move.
    console.info(`team bot games: ${bumps.enemy} opponent bumps, ${bumps.friendly} teammate bumps`)
    expect(bumps.friendly).toBeLessThan(bumps.enemy * 0.1)
  })
})
