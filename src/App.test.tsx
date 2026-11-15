import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { previewSound } from './audio/sfx'
import { BASE, home, loop } from './game/testUtils'
import type { Color, Spot } from './game/types'
import { NO_HOUSE_RULES } from './game/types'
import { DEFAULT_SETTINGS, useGameStore } from './store/gameStore'

vi.mock('./audio/sfx', () => ({ playSound: vi.fn(), previewSound: vi.fn(), setMuted: vi.fn(), setVolume: vi.fn(), setSoundTheme: vi.fn(), isMuted: () => false }))

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
  store().updateSettings({ ...DEFAULT_SETTINGS, autoRoll: false, houseRules: NO_HOUSE_RULES })
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

  it('changes the theme and sound style from the settings on setup', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(sheet).getByRole('radio', { name: 'System' })).toBeChecked()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(within(sheet).getByRole('radio', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()

    fireEvent.click(within(sheet).getByRole('radio', { name: /Tabla/ }))
    expect(store().settings.soundTheme).toBe('tabla')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Play a sample of Sitar' }))
    expect(previewSound).toHaveBeenLastCalledWith('win', 'sitar')
    // The setup screen has no game to end, so no "This game" section.
    expect(within(sheet).queryByRole('heading', { name: 'This game' })).toBeNull()
  })

  it('opens the join screen from an invite link, even over a saved local game', () => {
    store().start([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'bot' }])
    window.history.replaceState(null, '', '/#join=host-1&k=abc&exp=' + (Date.now() + 60_000))
    try {
      render(<App />)
      expect(screen.getByRole('heading', { name: 'Join a Star Hop game' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument()
      // Leaving without joining keeps the local game.
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
      expect(store().game).not.toBeNull()
      expect(screen.getByRole('region', { name: 'Star Hop game' })).toBeInTheDocument()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('links to the source code', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('href', 'https://github.com/sachinksha/star-hop')
  })

  it('the Game menu restarts or sets up a new game, asking first when a game is in progress', () => {
    startTwoPlayer([])
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(TIMINGish)
    const choose = (name: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: 'Game' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Game' })).getByRole('button', { name }))
    }
    // Set up a new game: confirm, or keep playing.
    choose(/^Set up a new game/)
    expect(screen.getByRole('alertdialog', { name: 'Leave this game for setup?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(store().game).not.toBeNull()
    expect(store().paused).toBe(false)
    // Restart: same players, from the beginning.
    const session = store().session
    choose(/^Restart/)
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(store().session).toBe(session + 1)
    expect(store().actions).toHaveLength(0)
    // A fresh game with no moves needs no confirmation to leave.
    choose(/^Set up a new game/)
    expect(screen.getByRole('heading', { name: 'Star Hop', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument()
  })

  it('keeps Settings to preferences only, and pauses while it is open', () => {
    startTwoPlayer([])
    fireEvent.keyDown(window, { key: 's' })
    const sheet = screen.getByRole('dialog', { name: 'Settings' })
    expect(store().paused).toBe(true)
    expect(within(sheet).queryByRole('button', { name: /Restart|Set up a new game|New game/ })).toBeNull()
    // Simple preferences apply at once and don't touch the game.
    const before = store().settings.autoRoll
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Auto roll' }))
    expect(store().settings.autoRoll).toBe(!before)
    expect(store().game).not.toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(store().paused).toBe(false)
  })

  it('hides Undo unless it is turned on, then undoes one step at a time with Ctrl+Z', () => {
    startTwoPlayer([loop(30)])
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    act(() => store().updateSettings({ undo: true }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(TIMINGish)
    fireEvent.keyDown(window, { key: '1' })
    advance(TIMINGish)
    expect(store().actions.map((a) => a.type).slice(0, 2)).toEqual(['roll', 'move'])
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(store().actions.map((a) => a.type)).toEqual(['roll'])
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(store().actions.map((a) => a.type).slice(0, 2)).toEqual(['roll', 'move'])
    // Arrow keys no longer undo.
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(store().actions.map((a) => a.type).slice(0, 2)).toEqual(['roll', 'move'])
  })

  it('steps through marbles and holes with the arrow keys, Enter to choose: any number of destinations', () => {
    // Red on a star with crossing the centre on: a 3 offers more than nine destinations.
    act(() => store().updateSettings({ houseRules: { rollSixesFirst: false, crossCentre: true, safeStarts: false } }))
    startTwoPlayer([loop(14)])
    act(() => {
      const g = store().game!
      const custom = { ...g, rules: { rollSixesFirst: false, crossCentre: true, safeStarts: false } }
      useGameStore.setState({ initial: custom, game: custom })
    })
    rollNext(3)
    fireEvent.keyDown(window, { key: ' ' })
    advance(TIMINGish)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByTestId('marble-red-0'))
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const count = screen.getAllByTestId(/^destination-/).length
    expect(count).toBeGreaterThan(9)
    // Left from nothing focused wraps to the last destination, the 10th or later: unreachable by one digit.
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByTestId(`destination-${count}`))
    const target = store().game!.legalMoves.filter((m) => m.die === 3 && m.marbleId === 0)[count - 1]!
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    advance(3000)
    expect(store().actions[1]).toMatchObject({ type: 'move', marbleId: 0, to: target.to })
  })

  it('pauses a local game while the rules are open, and resumes it when they close', () => {
    startTwoPlayer([])
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument()
    expect(store().paused).toBe(true)
    // Game shortcuts are off while the sheet is open.
    fireEvent.keyDown(window, { key: 'p' })
    expect(store().paused).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(store().paused).toBe(false)
  })

  it('leaves a game paused by the player paused after the rules close', () => {
    startTwoPlayer([])
    fireEvent.keyDown(window, { key: 'p' })
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(store().paused).toBe(true)
  })
})

/** Long enough for a roll to tumble and settle. */
const TIMINGish = 900
