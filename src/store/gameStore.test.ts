import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isMuted } from '../audio/sfx'
import type { GameAction, PlayerConfig } from '../game/types'
import { DEFAULT_SETTINGS, LAST_SETUP_KEY, SAVED_GAME_KEY, SAVE_VERSION, SETTINGS_KEY, loadSavedGame, migrateSave, useGameStore } from './gameStore'

const TWO: PlayerConfig[] = [
  { color: 'red', kind: 'human' },
  { color: 'blue', kind: 'bot' },
]

/** rng 0: the first seat (red) goes first. */
const FIRST = () => 0

const store = () => useGameStore.getState()

const ENTER: GameAction[] = [
  { type: 'roll', value: 6, actor: 'human' },
  { type: 'move', marbleId: 0, to: { kind: 'loop', pos: 7 }, actor: 'human' },
]

beforeEach(() => {
  store().abort()
  store().updateSettings(DEFAULT_SETTINGS)
  window.localStorage.clear()
})

describe('game store: history', () => {
  it('starts a game with an empty history', () => {
    store().start(TWO, FIRST)
    expect(store().game?.phase).toBe('roll')
    expect(store().actions).toHaveLength(0)
    expect(store().lastConfigs).toEqual(TWO)
  })

  it('does not start without a human seat', () => {
    store().start([
      { color: 'red', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ])
    expect(store().game).toBeNull()
  })

  it('records actions and derives the game and log', () => {
    store().start(TWO, FIRST)
    ENTER.forEach((a) => store().record(a))
    expect(store().game?.players[0]?.marbles[0]?.spot).toEqual({ kind: 'loop', pos: 7 })
    expect(store().log.map((e) => e.text)).toEqual(['Red rolled a 6', 'Red brought a marble out of base'])
  })

  it('ignores an illegal action', () => {
    store().start(TWO, FIRST)
    store().record({ type: 'move', marbleId: 0, to: { kind: 'loop', pos: 7 }, actor: 'human' })
    expect(store().actions).toHaveLength(0)
    expect(store().log).toHaveLength(0)
  })

  it('undoes back to the human roll and redoes it', () => {
    store().start(TWO, FIRST)
    ENTER.forEach((a) => store().record(a))
    store().undo()
    expect(store().actions).toHaveLength(0)
    expect(store().game?.players[0]?.marbles.every((m) => m.spot.kind === 'base')).toBe(true)
    store().redo()
    expect(store().actions).toEqual(ENTER)
  })

  it('keeps the incremental game identical to a full replay', () => {
    store().start(TWO, FIRST)
    ENTER.forEach((a) => store().record(a))
    const incremental = store().game
    store().undo()
    store().redo() // redo derives by full replay
    expect(store().game).toEqual(incremental)
  })
})

describe('game store: settings', () => {
  it('saves settings and applies the sound switch', () => {
    store().updateSettings({ autoRoll: false, sound: false })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toMatchObject({ autoRoll: false, sound: false })
    expect(isMuted()).toBe(true)
    store().updateSettings({ sound: true })
    expect(isMuted()).toBe(false)
  })
})

describe('game store: theme', () => {
  it('defaults to the system theme, with no override on the page', () => {
    expect(store().settings.theme).toBe('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applies and saves light and dark, and clears the override for system', () => {
    store().updateSettings({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!).theme).toBe('dark')
    store().updateSettings({ theme: 'light' })
    expect(document.documentElement.dataset.theme).toBe('light')
    store().updateSettings({ theme: 'system' })
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('restores a saved theme on load and ignores an unknown one', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark', sound: false }))
    vi.resetModules()
    let fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings).toMatchObject({ theme: 'dark', sound: false, autoRoll: false })
    expect(document.documentElement.dataset.theme).toBe('dark')
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'neon' }))
    vi.resetModules()
    fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings.theme).toBe('system')
    fresh.updateSettings({ theme: 'system' })
  })

  it('adds new settings without a version bump: old saves just lack the keys', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoRoll: false, theme: 'dark' }))
    vi.resetModules()
    let fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings).toMatchObject({ autoRoll: false, soundTheme: 'classic', volume: 0.8, moveButtons: 'auto' })
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundTheme: 'tabla', volume: 0.3, moveButtons: 'on' }))
    vi.resetModules()
    fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings).toMatchObject({ soundTheme: 'tabla', volume: 0.3, moveButtons: 'on' })
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundTheme: 'kazoo', volume: 7, moveButtons: 'maybe' }))
    vi.resetModules()
    fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.settings).toMatchObject({ soundTheme: 'classic', volume: 0.8, moveButtons: 'auto' })
  })
})

describe('game store: saved local game', () => {
  it('saves the game after every change and remembers the setup', () => {
    store().start(TWO, FIRST)
    store().record(ENTER[0]!)
    expect(loadSavedGame()?.actions).toEqual([ENTER[0]])
    expect(JSON.parse(window.localStorage.getItem(LAST_SETUP_KEY)!)).toEqual(TWO)
  })

  it('clears the save on abort', () => {
    store().start(TWO, FIRST)
    store().abort()
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('keeps a local save untouched while playing an online game as a guest', () => {
    store().start(TWO, FIRST)
    store().record(ENTER[0]!)
    const saved = window.localStorage.getItem(SAVED_GAME_KEY)
    const { initial } = store()
    store().load(initial!, [], false)
    store().record(ENTER[0]!)
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBe(saved)
  })

  it('never saves a hosted game (it has remote seats)', () => {
    store().start([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'human', remote: true }], FIRST)
    store().record(ENTER[0]!)
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('rejects saves that are corrupt, from another version, or no longer replay', () => {
    window.localStorage.setItem(SAVED_GAME_KEY, '{not json')
    expect(loadSavedGame()).toBeNull()
    store().start(TWO, FIRST)
    const saved = JSON.parse(window.localStorage.getItem(SAVED_GAME_KEY)!)
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ ...saved, v: 99 }))
    expect(loadSavedGame()).toBeNull()
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ ...saved, actions: [ENTER[1]] }))
    expect(loadSavedGame()).toBeNull()
  })

  it('upgrades a version 1 save (before team play) through every version and resumes it', async () => {
    store().start(TWO, FIRST)
    ENTER.forEach((a) => store().record(a))
    const saved = JSON.parse(window.localStorage.getItem(SAVED_GAME_KEY)!)
    expect(saved.v).toBe(SAVE_VERSION)
    const { playingFor: _p, rules: _r, pool: _q, ...oldInitial } = saved.initial
    // Version 1 actions had no die on moves.
    const oldActions = saved.actions.map(({ die: _d, ...a }: Record<string, unknown>) => a)
    window.localStorage.setItem(SAVED_GAME_KEY, JSON.stringify({ ...saved, v: 1, initial: oldInitial, actions: oldActions }))
    expect(migrateSave({ v: 1, initial: oldInitial })).toMatchObject({ v: 3, initial: { playingFor: null, pool: [], rules: { rollSixesFirst: false } } })
    const loaded = loadSavedGame()
    expect(loaded?.v).toBe(3)
    expect(loaded?.initial.playingFor).toBeNull()
    expect(loaded?.initial.rules).toEqual({ rollSixesFirst: false, crossCentre: false, safeStarts: false })
    expect(loaded?.actions).toHaveLength(ENTER.length)
  })

  it('resumes a saved game, paused, when the page loads again', async () => {
    store().start(TWO, FIRST)
    ENTER.forEach((a) => store().record(a))
    vi.resetModules()
    const fresh = (await import('./gameStore')).useGameStore.getState()
    expect(fresh.actions).toEqual(ENTER)
    expect(fresh.paused).toBe(true)
    expect(fresh.game?.players[0]?.marbles[0]?.spot).toEqual({ kind: 'loop', pos: 7 })
    expect(fresh.lastConfigs).toEqual(TWO)
  })
})
