import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BASE, home, loop } from './game/testUtils'
import type { Color, Spot } from './game/types'
import { DEFAULT_SETTINGS, useGameStore } from './store/gameStore'

vi.mock('./audio/sfx', () => ({ playSound: vi.fn(), setMuted: vi.fn(), isMuted: () => false }))

const store = () => useGameStore.getState()

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50))
}

/** Starts red (you) vs a blue bot from the setup screen, with marbles placed and red to play. */
function startTwoPlayer(red: Spot[]) {
  render(<App />)
  fireEvent.click(screen.getByRole('radio', { name: '2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
  const g = store().game!
  const players = g.players.map((p) => (p.color === 'red' ? { ...p, marbles: p.marbles.map((m, i) => ({ ...m, spot: red[i] ?? BASE })) } : p))
  const custom = { ...g, players, currentIndex: 0 }
  act(() => useGameStore.setState({ initial: custom, game: custom, actions: [], log: [] }))
}

/** Makes the next die rolls predictable: crypto is the game's dice source. */
function rollNext(value: number) {
  const fake = (arr: Uint32Array) => {
    arr[0] = Math.floor(((value - 1) / 6 + 0.01) * 4294967296)
    return arr
  }
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(fake as unknown as Crypto['getRandomValues'])
}

const redSpot = (id: number) => store().game!.players.find((p) => p.color === ('red' as Color))!.marbles[id]!.spot

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  store().abort()
  store().updateSettings({ ...DEFAULT_SETTINGS, autoRoll: false })
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('App', () => {
  it('starts a 2-player game with a panel for each seated player only', () => {
    startTwoPlayer([])
    const panels = screen.getAllByRole('listitem').filter((li) => li.classList.contains('panel'))
    expect(panels).toHaveLength(2)
    expect(screen.getByText('Your turn. Press Space or tap the die to roll.')).toBeInTheDocument()
  })

  it('plays a whole choice by keyboard: Space, a marble number, then a destination number', () => {
    startTwoPlayer([loop(14), home(3)])
    rollNext(1)
    fireEvent.keyDown(window, { key: ' ' })
    advance(1000)
    expect(store().game!.phase).toBe('move')
    expect(screen.getByText(/Pick a marble: press 1–4/)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '1' })
    expect(screen.getByText(/Pick where marble 1 goes: press 1–3/)).toBeInTheDocument()

    // Esc goes back to picking a marble, then pick again and choose the centre (badge 3).
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText(/Rolled 1\. Pick a marble/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '1' })
    fireEvent.keyDown(window, { key: '3' })
    advance(1000)
    expect(redSpot(0)).toEqual({ kind: 'center' })
  })

  it('explains a marble that cannot move', () => {
    store().updateSettings({ autoMove: false })
    startTwoPlayer([loop(30)])
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(1000)
    fireEvent.keyDown(window, { key: '2' })
    expect(screen.getByRole('status')).toHaveTextContent("Marble 2 can't move with a 3.")
  })

  it('shows an oops when a roll has no legal move, and reads the log line out', () => {
    startTwoPlayer([])
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(TIMINGish)
    expect(screen.getByText(/Oops! You rolled a 3 with no legal move\./)).toBeInTheDocument()
    expect(screen.getByTestId('announcer')).toHaveTextContent('Red has no legal move')
  })

  it('links to the source code', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/sachinksha/aggravation-game')
  })

  it('asks before abandoning a game in progress', () => {
    startTwoPlayer([])
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(TIMINGish)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('alertdialog', { name: 'Abandon the current game?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(store().game).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abandon and open settings' }))
    expect(screen.getByRole('heading', { name: 'Star Hop', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument()
  })
})

/** Long enough for a roll to tumble and settle. */
const TIMINGish = 900
