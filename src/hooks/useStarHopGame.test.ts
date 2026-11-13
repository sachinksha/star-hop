import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playSound } from '../audio/sfx'
import { BASE, CENTER, home, loop } from '../game/testUtils'
import type { Color, PlayerConfig, Spot } from '../game/types'
import { DEFAULT_SETTINGS, useGameStore } from '../store/gameStore'
import { TIMING, useStarHopGame } from './useStarHopGame'

vi.mock('../audio/sfx', () => ({ playSound: vi.fn(), setMuted: vi.fn(), isMuted: () => false }))

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'blue', kind: 'bot' },
]
const THREE: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'green', kind: 'bot' },
  { color: 'blue', kind: 'bot' },
]

/** A random source that rolls `value` every time (also feeds bot noise). */
const dice = (value: number) => () => (value - 1) / 6 + 0.01

/** Rolls the given values in order, then `rest` forever. */
function diceSequence(values: number[], rest: number) {
  const queue = [...values]
  return () => {
    const v = queue.shift() ?? rest
    return (v - 1) / 6 + 0.01
  }
}

/** Starts a game with marbles placed, and `first` to play. */
function seed(configs: PlayerConfig[], spots: Partial<Record<Color, Spot[]>>, first: Color = 'red') {
  useGameStore.getState().start(configs, () => 0)
  const base = useGameStore.getState().game!
  const players = base.players.map((p) => {
    const at = spots[p.color]
    return at ? { ...p, marbles: p.marbles.map((m, i) => ({ ...m, spot: at[i] ?? BASE })) } : p
  })
  const custom = { ...base, players, currentIndex: players.findIndex((p) => p.color === first) }
  useGameStore.setState({ initial: custom, game: custom, actions: [], redoStack: [], log: [] })
}

/**
 * Advances time in small slices, each in its own act(), so React commits and
 * the scheduler effect can queue the next step. One big jump would skip steps.
 */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50))
}

const store = () => useGameStore.getState()
const red = () => store().game!.players.find((p) => p.color === 'red')!

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(playSound).mockClear()
  store().abort()
  store().updateSettings(DEFAULT_SETTINGS)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('auto roll and automatic moves', () => {
  it('rolls by itself and plays a move with no real decision', () => {
    seed(TWO, { red: [loop(30)] })
    renderHook(() => useStarHopGame(dice(3)))
    advance(TIMING.AUTO_ROLL_MS + TIMING.ROLL_MS + TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 5 * TIMING.STEP_MS + 200)
    expect(store().actions.slice(0, 2)).toEqual([
      { type: 'roll', value: 3, actor: 'human' },
      { type: 'move', marbleId: 0, to: loop(33), actor: 'human' },
    ])
  })

  it('waits for the human to roll when auto roll is off', () => {
    store().updateSettings({ autoRoll: false })
    seed(TWO, { red: [loop(30)] })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    advance(3000)
    expect(store().actions).toHaveLength(0)
    act(() => result.current.roll())
    advance(TIMING.ROLL_MS + 100)
    expect(store().actions).toHaveLength(1)
  })

  it('waits for a pick when auto move is off, then moves a single-destination marble at once', () => {
    store().updateSettings({ autoMove: false })
    seed(TWO, { red: [loop(30)] })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    advance(3000)
    expect(store().game!.phase).toBe('move')
    let picked = ''
    act(() => {
      picked = result.current.pickMarble(0)
    })
    expect(picked).toBe('moved')
    advance(1000)
    expect(red().marbles[0]!.spot).toEqual(loop(33))
  })
})

describe('choosing marble and destination', () => {
  const onStar = () => seed(TWO, { red: [loop(14), home(3), home(2), home(1)] })

  it('waits when a marble has several destinations, then plays the chosen one', () => {
    onStar()
    const { result } = renderHook(() => useStarHopGame(dice(1)))
    advance(3000)
    expect(store().game!.phase).toBe('move')
    expect(result.current.humanTurn).toBe(true)

    let picked = ''
    act(() => {
      picked = result.current.pickMarble(0)
    })
    expect(picked).toBe('choose')
    expect(result.current.selected).toBe(0)
    expect(result.current.destinations.map((m) => m.to)).toEqual([loop(28), loop(15), CENTER])

    act(() => result.current.chooseDestination(2))
    advance(TIMING.HOP_MS + TIMING.STEP_MS + 100)
    expect(red().marbles[0]!.spot).toEqual(CENTER)
    expect(playSound).toHaveBeenCalledWith('hop')
    expect(result.current.selected).toBeNull()
  })

  it('cancels a selection', () => {
    onStar()
    const { result } = renderHook(() => useStarHopGame(dice(1)))
    advance(3000)
    act(() => void result.current.pickMarble(0))
    act(() => result.current.cancelSelection())
    expect(result.current.selected).toBeNull()
    expect(result.current.destinations).toEqual([])
  })

  it('does nothing for a marble with no legal move', () => {
    store().updateSettings({ autoMove: false })
    seed(TWO, { red: [loop(30)] })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    advance(3000)
    let picked = ''
    act(() => {
      picked = result.current.pickMarble(1) // in base, roll 3
    })
    expect(picked).toBe('none')
    expect(store().actions).toHaveLength(1)
  })

  it('plays a tapped destination directly', () => {
    onStar()
    const { result } = renderHook(() => useStarHopGame(dice(1)))
    advance(3000)
    const walk = result.current.movesFor(0).find((m) => m.to.kind === 'loop' && m.to.pos === 15)!
    act(() => result.current.playMove(walk))
    advance(500)
    expect(red().marbles[0]!.spot).toEqual(loop(15))
  })
})

describe('no legal move', () => {
  it('plays the oops sound and passes the turn', () => {
    seed(TWO, { red: [] })
    renderHook(() => useStarHopGame(dice(3)))
    advance(TIMING.AUTO_ROLL_MS + TIMING.ROLL_MS + 100)
    expect(store().game!.events[1]).toEqual({ type: 'noMoves', color: 'red', rollAgain: false })
    expect(playSound).toHaveBeenCalledWith('oops')
    expect(store().game!.players[store().game!.currentIndex]!.color).toBe('blue')
  })

  it('rolls again after a 6 with no move', () => {
    seed(TWO, { red: [home(3), home(2), home(1), loop(5)] })
    const rng = diceSequence([6, 1], 3) // once, not per render
    renderHook(() => useStarHopGame(rng))
    // The oops after the first roll holds play a little longer.
    advance(6000)
    expect(store().actions.slice(0, 3)).toEqual([
      { type: 'roll', value: 6, actor: 'human' },
      { type: 'roll', value: 1, actor: 'human' },
      { type: 'move', marbleId: 3, to: loop(6), actor: 'human' },
    ])
  })
})

describe('bots', () => {
  it('plays a bot turn by itself', () => {
    seed(TWO, { blue: [loop(30), loop(50)] }, 'blue')
    renderHook(() => useStarHopGame(dice(3)))
    advance(TIMING.BOT_ROLL_MS + TIMING.ROLL_MS + TIMING.SETTLE_MS + TIMING.BOT_MOVE_MS + 6 * TIMING.STEP_MS + 200)
    expect(store().actions[0]).toEqual({ type: 'roll', value: 3, actor: 'bot' })
    expect(store().actions[1]).toMatchObject({ type: 'move', actor: 'bot' })
  })
})

describe('finishing', () => {
  it('celebrates a player who finishes while others play on', () => {
    seed(THREE, { red: [home(3), home(2), home(1), loop(5)] })
    const { result } = renderHook(() => useStarHopGame(dice(2)))
    advance(TIMING.AUTO_ROLL_MS + TIMING.ROLL_MS + TIMING.SETTLE_MS + TIMING.AUTO_MOVE_MS + 4 * TIMING.STEP_MS + 100)
    expect(result.current.celebration).toEqual({ color: 'red', name: 'You', rank: 1 })
    expect(playSound).toHaveBeenCalledWith('win')
    advance(TIMING.CELEBRATE_MS + 100)
    expect(result.current.celebration).toBeNull()
  })

  it('offers to end once every human has finished, and ends with the bots ranked', () => {
    seed(THREE, { red: [home(3), home(2), home(1), home(0)] }, 'green')
    useGameStore.setState((s) => {
      const g = { ...s.game!, players: s.game!.players.map((p) => (p.color === 'red' ? { ...p, finishRank: 1 } : p)) }
      return { initial: g, game: g }
    })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    expect(result.current.offerEnd).toBe(true)
    advance(3000)
    expect(store().actions).toHaveLength(0) // bots hold while the offer is open
    act(() => result.current.endEarly())
    expect(store().game!.phase).toBe('gameOver')
    expect(store().game!.winners[0]).toBe('red')
  })
})

describe('undo, redo and pause', () => {
  it('undoes back to the human decision', () => {
    store().updateSettings({ autoMove: false })
    seed(TWO, { red: [loop(30)] })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    advance(TIMING.AUTO_ROLL_MS + TIMING.ROLL_MS + TIMING.SETTLE_MS + 100)
    act(() => void result.current.pickMarble(0))
    // The move animates and settles; undo before the bot's roll comes up.
    advance(4 * TIMING.STEP_MS + TIMING.SETTLE_MS + 100)
    expect(store().actions).toHaveLength(2)
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(store().actions).toHaveLength(0)
    expect(result.current.shownPlayers.find((p) => p.color === 'red')!.marbles[0]!.spot).toEqual(loop(30))
    expect(result.current.canRedo).toBe(true)
  })

  it('pauses when the window loses focus, and stops scheduling', () => {
    seed(TWO, { red: [loop(30)] })
    const { result } = renderHook(() => useStarHopGame(dice(3)))
    act(() => window.dispatchEvent(new Event('blur')))
    expect(result.current.paused).toBe(true)
    advance(3000)
    expect(store().actions).toHaveLength(0)
    act(() => result.current.togglePause())
    expect(result.current.paused).toBe(false)
  })
})
