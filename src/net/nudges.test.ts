import { describe, expect, it } from 'vitest'
import { createGame } from '../game/engine'
import { assignTeams } from '../game/teams'
import { home, place } from '../game/testUtils'
import type { Color, GameState } from '../game/types'
import { acceptNudge, liveNudges, teamColors } from './nudges'

/** Six players in 2 teams of 3: red, yellow, blue against orange, green, purple. Red has finished and is to roll. */
function helperTurn(): GameState {
  const colors: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
  const teams = assignTeams(6, 2)
  const g = createGame(colors.map((color, i) => ({ color, kind: 'human' as const, team: teams[i]! })), () => 0)
  const done = place(g, 'red', [home(0), home(1), home(2), home(3)])
  return { ...done, currentIndex: 0, players: done.players.map((p) => (p.color === 'red' ? { ...p, finishRank: 1 } : p)) }
}

describe('team nudges', () => {
  it('accepts a teammate’s suggestion and replaces their earlier one', () => {
    const g = helperTurn()
    const first = acceptNudge(g, g.actionSeq, [], 'yellow', { kind: 'rollFor', color: 'yellow' })!
    expect(first).toEqual([{ from: 'yellow', seq: 0, nudge: { kind: 'rollFor', color: 'yellow' } }])
    const both = acceptNudge(g, g.actionSeq, first, 'blue', { kind: 'pass' })!
    expect(both).toHaveLength(2)
    const changed = acceptNudge(g, g.actionSeq, both, 'yellow', { kind: 'rollFor', color: 'blue' })!
    expect(changed).toHaveLength(2)
    expect(changed.find((n) => n.from === 'yellow')!.nudge).toEqual({ kind: 'rollFor', color: 'blue' })
  })

  it('rejects opponents, the roller, stale positions and impossible targets', () => {
    const g = helperTurn()
    expect(acceptNudge(g, g.actionSeq, [], 'orange', { kind: 'pass' })).toBeNull()
    expect(acceptNudge(g, g.actionSeq, [], 'red', { kind: 'pass' })).toBeNull()
    expect(acceptNudge(g, g.actionSeq + 1, [], 'yellow', { kind: 'pass' })).toBeNull()
    expect(acceptNudge(g, g.actionSeq, [], 'yellow', { kind: 'rollFor', color: 'orange' })).toBeNull()
    const normalTurn = { ...g, currentIndex: 1 }
    expect(acceptNudge(normalTurn, g.actionSeq, [], 'green', { kind: 'pass' })).toBeNull()
  })

  it('expires the moment the position changes', () => {
    const g = helperTurn()
    const list = acceptNudge(g, g.actionSeq, [], 'yellow', { kind: 'pass' })!
    expect(liveNudges(g, list)).toHaveLength(1)
    expect(liveNudges({ ...g, actionSeq: g.actionSeq + 1 }, list)).toHaveLength(0)
  })

  it('goes to the roller’s team only', () => {
    expect(teamColors(helperTurn())).toEqual(['red', 'yellow', 'blue'])
  })
})
