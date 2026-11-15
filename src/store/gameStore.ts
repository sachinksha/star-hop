import { create } from 'zustand'
import { setMuted, setSoundTheme, setVolume } from '../audio/sfx'
import { SOUND_THEME_IDS, type SoundThemeId } from '../audio/themes'
import { describeEvent } from '../game/describe'
import { applyAction, createGame, type Rng } from '../game/engine'
import { replay, undoIndex } from '../game/history'
import { HOUSE_RULE_KEYS, NO_HOUSE_RULES, type GameAction, type GameState, type HouseRules, type PlayerConfig } from '../game/types'

// ---------------------------------------------------------------------------
// Browser storage. Every access is wrapped: storage can be blocked, full, or
// hold data from an older version. The game must work without it.

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked or full: it still works for this visit.
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// ---------------------------------------------------------------------------
// Settings

/** Player preferences kept in the browser between visits. */
export interface Settings {
  /** Roll automatically for this device's humans when their turn comes. */
  autoRoll: boolean
  /** Play a move automatically when the roll leaves no real decision. */
  autoMove: boolean
  /** Raise the odds of a 1 or 6 for players stuck in base for a long time (R13). */
  comebackDice: boolean
  /** House rules for new games (R22-R24). A game keeps the rules it started with. */
  houseRules: HouseRules
  /** Sound effects on. */
  sound: boolean
  /** Colour theme. 'system' follows the device's light or dark setting. */
  theme: Theme
  /** Which instrument voices the sound effects. */
  soundTheme: SoundThemeId
  /** Sound effects volume, 0 to 1. */
  volume: number
  /**
   * Big buttons under the board for picking marbles and destinations.
   * 'auto' shows them on touch screens, where board pieces are small under a finger.
   */
  moveButtons: MoveButtons
}

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']
export type MoveButtons = 'auto' | 'on' | 'off'
export const MOVE_BUTTONS: readonly MoveButtons[] = ['auto', 'on', 'off']

/** The settings that are simple on/off switches. */
export type ToggleSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]

/**
 * Applies a theme to the page. 'system' removes the override so the CSS
 * follows prefers-color-scheme. index.html runs the same logic inline before
 * first paint, so a dark-theme user never sees a light flash.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export const SETTINGS_KEY = 'star-hop:settings'
export const DEFAULT_SETTINGS: Settings = {
  autoRoll: false,
  autoMove: false,
  comebackDice: true,
  houseRules: NO_HOUSE_RULES,
  sound: true,
  theme: 'system',
  soundTheme: 'classic',
  volume: 0.8,
  moveButtons: 'auto',
}

function loadSettings(): Settings {
  const parsed = readJson(SETTINGS_KEY)
  const settings = { ...DEFAULT_SETTINGS }
  if (isObject(parsed)) {
    for (const key of ['autoRoll', 'autoMove', 'comebackDice', 'sound'] as const) {
      const value = parsed[key]
      if (typeof value === 'boolean') settings[key] = value
    }
    if (THEMES.includes(parsed.theme as Theme)) settings.theme = parsed.theme as Theme
    if (SOUND_THEME_IDS.includes(parsed.soundTheme as SoundThemeId)) settings.soundTheme = parsed.soundTheme as SoundThemeId
    if (typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1) settings.volume = parsed.volume
    if (MOVE_BUTTONS.includes(parsed.moveButtons as MoveButtons)) settings.moveButtons = parsed.moveButtons as MoveButtons
    if (isObject(parsed.houseRules)) {
      const saved = parsed.houseRules
      settings.houseRules = { ...NO_HOUSE_RULES }
      for (const key of HOUSE_RULE_KEYS) if (typeof saved[key] === 'boolean') settings.houseRules[key] = saved[key]
    }
  }
  return settings
}

/** Pushes the sound settings into the audio module. */
function applySound(settings: Settings): void {
  setMuted(!settings.sound)
  setVolume(settings.volume)
  setSoundTheme(settings.soundTheme)
}

// ---------------------------------------------------------------------------
// Saved local game: the initial state plus the action log (event sourcing makes
// this cheap). Online games are never saved; the host owns those.

export const SAVED_GAME_KEY = 'star-hop:game'
export const LAST_SETUP_KEY = 'star-hop:last-setup'
export const SAVE_VERSION = 3

interface SavedGame {
  v: number
  configs: PlayerConfig[]
  initial: GameState
  actions: GameAction[]
}

/**
 * Upgrades a save one version at a time. Each step is small and tested once;
 * a save from any older version walks up the chain. Returns null for a
 * version with no path forward.
 *
 * v1 -> v2: team play added `GameState.playingFor`. Old games had no teams,
 * so it is always null.
 * v2 -> v3: house rules added `GameState.rules` and the dice `pool`. Old games
 * had no house rules and start with an empty pool.
 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({ ...old, v: 2, initial: isObject(old.initial) ? { ...old.initial, playingFor: null } : old.initial }),
  2: (old) => ({ ...old, v: 3, initial: isObject(old.initial) ? { ...old.initial, rules: { ...NO_HOUSE_RULES }, pool: [] } : old.initial }),
}

export function migrateSave(raw: Record<string, unknown>): Record<string, unknown> | null {
  let save = raw
  while (save.v !== SAVE_VERSION) {
    const step = typeof save.v === 'number' ? MIGRATIONS[save.v] : undefined
    if (!step) return null
    save = step(save)
  }
  return save
}

/**
 * Reads a saved local game, or null if there is none or it does not replay
 * cleanly (unknown version, edited by hand, or from a different rules version).
 */
export function loadSavedGame(): SavedGame | null {
  const raw = readJson(SAVED_GAME_KEY)
  const parsed = isObject(raw) ? migrateSave(raw) : null
  if (!parsed) return null
  const { configs, initial, actions } = parsed as unknown as SavedGame
  if (!Array.isArray(configs) || !isObject(initial) || !Array.isArray(initial.players) || !Array.isArray(actions)) return null
  try {
    let state: GameState = initial
    for (const action of actions) {
      const next = applyAction(state, action)
      if (next === state) return null // an action that no longer applies
      state = next
    }
    if (state.phase === 'gameOver') return null
    return { v: SAVE_VERSION, configs, initial, actions }
  } catch {
    return null
  }
}

function loadLastSetup(): PlayerConfig[] | null {
  const parsed = readJson(LAST_SETUP_KEY)
  return Array.isArray(parsed) ? (parsed as PlayerConfig[]) : null
}

/** A game needs at least one human seat; bot-only games are not started. */
export function hasHuman(configs: PlayerConfig[]): boolean {
  return configs.some((c) => c.kind === 'human')
}

export interface LogEntry {
  id: string
  text: string
}

export interface GameStoreState {
  /** Seats of the current local game, or null (no game, or an online game). */
  configs: PlayerConfig[] | null
  /** The most recent seats used, so setup can prefill them. Kept between visits. */
  lastConfigs: PlayerConfig[] | null
  /** Increments on every new game, so the UI can remount cleanly. */
  session: number
  /** The starting position of the current game. */
  initial: GameState | null
  /** Every decision made so far, oldest first. The source of truth. */
  actions: GameAction[]
  /** Undone action groups, most recent first. Redo replays the top group. */
  redoStack: GameAction[][]
  /** Current game, derived from `initial` and `actions`. */
  game: GameState | null
  /** Chronological log of events, derived from `actions`. */
  log: LogEntry[]
  paused: boolean
  /** Whether the game log is expanded. Hidden by default; kept across games. */
  logOpen: boolean
  settings: Settings

  /** Starts a local game. `rng` picks bot styles and the first player (injectable for tests). */
  start: (configs: PlayerConfig[], rng?: Rng) => void
  /** Replaces the game with one received from an online host. Not saved; a local save is kept. */
  load: (initial: GameState, actions: GameAction[], paused: boolean) => void
  /** Adds a decision to the history and clears the redo stack. An illegal action is ignored. */
  record: (action: GameAction) => void
  undo: () => void
  redo: () => void
  setPaused: (paused: boolean) => void
  setLogOpen: (open: boolean) => void
  updateSettings: (patch: Partial<Settings>) => void
  /** Discards the current game and returns to setup. */
  abort: () => void
}

/** Rebuilds the derived game and log from the initial state and action list. */
function derive(initial: GameState | null, actions: GameAction[]) {
  if (!initial) return { game: null, log: [] as LogEntry[] }
  const { state, eventsPerAction } = replay(initial, actions)
  const log: LogEntry[] = []
  eventsPerAction.forEach((events, i) => {
    events.forEach((event, j) => {
      const text = describeEvent(event)
      if (text !== null) log.push({ id: `${i}-${j}`, text })
    })
  })
  return { game: state, log }
}

/**
 * Saves the local game, or clears the save when it is over. A game received
 * from an online host (no local seats) is not this device's to save, so an
 * earlier local save is left alone and comes back after leaving.
 */
function persist(s: Pick<GameStoreState, 'configs' | 'initial' | 'actions' | 'game'>): void {
  if (!s.configs) return
  // Hosted games have remote seats: the host session owns them, and a refresh
  // cannot bring the guests back, so they are never saved as local games.
  if (s.configs.some((c) => c.remote) || !s.initial || !s.game || s.game.phase === 'gameOver') {
    writeJson(SAVED_GAME_KEY, null)
    return
  }
  const saved: SavedGame = { v: SAVE_VERSION, configs: s.configs, initial: s.initial, actions: s.actions }
  writeJson(SAVED_GAME_KEY, saved)
}

/** Starting state: a saved local game resumes paused, so a refresh never costs a move. */
function initialState() {
  const settings = loadSettings()
  applySound(settings)
  applyTheme(settings.theme)
  const saved = loadSavedGame()
  return {
    configs: saved?.configs ?? null,
    lastConfigs: loadLastSetup(),
    session: 0,
    initial: saved?.initial ?? null,
    actions: saved?.actions ?? [],
    redoStack: [] as GameAction[][],
    paused: saved !== null,
    logOpen: false,
    settings,
    ...derive(saved?.initial ?? null, saved?.actions ?? []),
  }
}

export const useGameStore = create<GameStoreState>()((set, get) => ({
  ...initialState(),

  start: (configs, rng) => {
    if (!hasHuman(configs)) return
    const initial = createGame(configs, rng, get().settings.houseRules)
    writeJson(LAST_SETUP_KEY, configs)
    set((s) => ({
      configs,
      lastConfigs: configs,
      session: s.session + 1,
      initial,
      actions: [],
      redoStack: [],
      paused: false,
      ...derive(initial, []),
    }))
    persist(get())
  },

  load: (initial, actions, paused) => {
    set((s) => ({
      configs: null,
      session: s.session + 1,
      initial,
      actions,
      redoStack: [],
      paused,
      ...derive(initial, actions),
    }))
  },

  record: (action) => {
    const { game, actions, log } = get()
    if (!game) return
    // Apply just the new action: the same result as a full replay, without
    // replaying a 6-player game's thousand-plus actions on every step.
    const state = applyAction(game, action)
    if (state === game) return // not legal here: never enters the history
    const i = actions.length
    const entries = state.events.flatMap((event, j) => {
      const text = describeEvent(event)
      return text === null ? [] : [{ id: `${i}-${j}`, text }]
    })
    set({ actions: [...actions, action], redoStack: [], game: state, log: [...log, ...entries] })
    persist(get())
  },

  undo: () => {
    const { initial, actions, redoStack } = get()
    const j = undoIndex(actions)
    if (!initial || j === null) return
    const kept = actions.slice(0, j)
    const removed = actions.slice(j)
    set({ actions: kept, redoStack: [removed, ...redoStack], ...derive(initial, kept) })
    persist(get())
  },

  redo: () => {
    const { initial, actions, redoStack } = get()
    const [group, ...rest] = redoStack
    if (!initial || !group) return
    const next = [...actions, ...group]
    set({ actions: next, redoStack: rest, ...derive(initial, next) })
    persist(get())
  },

  setPaused: (paused) => set({ paused }),

  setLogOpen: (logOpen) => set({ logOpen }),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    writeJson(SETTINGS_KEY, settings)
    applySound(settings)
    applyTheme(settings.theme)
    set({ settings })
  },

  abort: () => {
    set((s) => ({
      configs: null,
      session: s.session + 1,
      initial: null,
      actions: [],
      redoStack: [],
      game: null,
      log: [],
      paused: false,
    }))
    writeJson(SAVED_GAME_KEY, null)
  },
}))
