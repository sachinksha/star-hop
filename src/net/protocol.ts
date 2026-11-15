/**
 * Wire protocol for online games. Every message is a small JSON object with a
 * `t` (type) field.
 *
 * The host is authoritative: guests only send *intents* ("I want to roll"),
 * and the host decides the outcome (including the dice value) and broadcasts
 * the resulting action. Guests replay those actions with the same engine, so
 * every screen shows the same game.
 *
 * Anything that arrives from another device is untrusted, so the host parses
 * guest messages strictly before acting on them.
 */
import { COLORS, HOME_SLOTS, LOOP_LENGTH } from '../game/board'
import { MAX_NAME_LENGTH, MARBLES_PER_PLAYER, type Color, type GameAction, type GameState, type PlayerKind, type Spot } from '../game/types'

/** Bumped whenever the message format changes incompatibly. 2: team play. 3: house rules. */
export const PROTOCOL_VERSION = 3

/** A seat as shown in the lobby and on every guest's screen. */
export interface SeatView {
  color: Color
  kind: PlayerKind
  /** Played from another device. */
  remote: boolean
  name: string
  /** Team number in team play. */
  team?: number
  /** A guest has claimed this online seat. */
  joined: boolean
  /** The guest who claimed it is currently connected. */
  connected: boolean
}

/** Everything a guest needs to rebuild the game from scratch. */
export interface Snapshot {
  /** Increments for every new game in the same session, so stale actions are ignored. */
  gameId: number
  initial: GameState
  actions: GameAction[]
  paused: boolean
}

/**
 * What a guest may ask the host to do on its turn. A move names the marble and
 * where it goes; the host checks it against the legal moves. In team play a
 * finished player's roll names the teammate it is for, or they pass.
 */
export type Intent = { action: 'roll'; for?: Color } | { action: 'move'; marbleId: number; to: Spot; die?: number } | { action: 'pass' }

/**
 * Team play: a suggestion to the finished teammate who is about to roll.
 * "Roll for Blue" or "pass this one". Advice only; the roller decides.
 */
export type Nudge = { kind: 'rollFor'; color: Color } | { kind: 'pass' }

/** A nudge as shared with the team: who suggested it, for which game position. */
export interface TeamNudge {
  from: Color
  /** The action count it was given at. It expires as soon as anything happens. */
  seq: number
  nudge: Nudge
}

export type GuestMessage =
  | { t: 'hello'; v: number; token: string; name: string; secret?: string }
  /** `seq` is how many actions the guest has applied, so stale intents are dropped. */
  | ({ t: 'intent'; seq: number } & Intent)
  | { t: 'nudge'; seq: number; nudge: Nudge }
  | { t: 'resync' }
  | { t: 'leave' }

export type RejectReason = 'invalid' | 'expired' | 'full' | 'started' | 'version'

export type HostMessage =
  | { t: 'welcome'; color: Color; secret: string }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'lobby'; seats: SeatView[]; expiresAt: number }
  | { t: 'sync'; snapshot: Snapshot }
  /** `seq` is the action's index in the game's action list. */
  | { t: 'action'; gameId: number; seq: number; action: GameAction }
  | { t: 'paused'; paused: boolean }
  /** Team play: the current suggestions for the roller, sent only to that team. */
  | { t: 'nudges'; nudges: TeamNudge[] }
  | { t: 'ended' }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isInt = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max
const isShortString = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max

/**
 * Validates a message from a guest. Returns null for anything malformed, so
 * the host can ignore it. Only the fields listed here are kept.
 */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!isObject(raw)) return null
  switch (raw.t) {
    case 'hello': {
      if (!isInt(raw.v, 0, 1000) || !isShortString(raw.token, 64) || !isShortString(raw.name, 64)) return null
      if (raw.secret !== undefined && !isShortString(raw.secret, 64)) return null
      return { t: 'hello', v: raw.v, token: raw.token, name: raw.name, ...(raw.secret ? { secret: raw.secret } : {}) }
    }
    case 'intent': {
      if (!isInt(raw.seq, 0, 1_000_000)) return null
      if (raw.action === 'roll') {
        if (raw.for === undefined) return { t: 'intent', seq: raw.seq, action: 'roll' }
        return isColor(raw.for) ? { t: 'intent', seq: raw.seq, action: 'roll', for: raw.for } : null
      }
      if (raw.action === 'pass') return { t: 'intent', seq: raw.seq, action: 'pass' }
      if (raw.action === 'move' && isInt(raw.marbleId, 0, MARBLES_PER_PLAYER - 1)) {
        const to = parseSpot(raw.to)
        if (raw.die !== undefined && !isInt(raw.die, 1, 6)) return null
        if (to) return { t: 'intent', seq: raw.seq, action: 'move', marbleId: raw.marbleId, to, ...(raw.die !== undefined ? { die: raw.die } : {}) }
      }
      return null
    }
    case 'nudge': {
      if (!isInt(raw.seq, 0, 1_000_000) || !isObject(raw.nudge)) return null
      const n = raw.nudge
      if (n.kind === 'pass') return { t: 'nudge', seq: raw.seq, nudge: { kind: 'pass' } }
      if (n.kind === 'rollFor' && isColor(n.color)) return { t: 'nudge', seq: raw.seq, nudge: { kind: 'rollFor', color: n.color } }
      return null
    }
    case 'resync':
      return { t: 'resync' }
    case 'leave':
      return { t: 'leave' }
    default:
      return null
  }
}

/**
 * Light shape check for messages from the host. The host is the authority, so
 * guests trust its content; this only filters out junk.
 */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isObject(raw) || typeof raw.t !== 'string') return null
  const known = ['welcome', 'reject', 'lobby', 'sync', 'action', 'paused', 'nudges', 'ended']
  return known.includes(raw.t) ? (raw as unknown as HostMessage) : null
}

/**
 * Cleans a name typed by a guest: strips control characters, collapses spaces
 * and trims to the length limit. Returns '' when nothing usable is left.
 */
export function sanitizeName(raw: string): string {
  const printable = [...raw].filter((ch) => {
    const code = ch.charCodeAt(0)
    return code >= 0x20 && code !== 0x7f
  })
  return printable
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim()
}

/** True if `x` is one of the six colours. */
export function isColor(x: unknown): x is Color {
  return typeof x === 'string' && (COLORS as readonly string[]).includes(x)
}

/**
 * Validates a board spot from another device and rebuilds it, dropping any
 * extra fields. Returns null for anything that is not a real hole.
 */
export function parseSpot(raw: unknown): Spot | null {
  if (!isObject(raw)) return null
  switch (raw.kind) {
    case 'base':
      return { kind: 'base' }
    case 'center':
      return { kind: 'center' }
    case 'loop':
      return isInt(raw.pos, 0, LOOP_LENGTH - 1) ? { kind: 'loop', pos: raw.pos } : null
    case 'home':
      return isInt(raw.slot, 0, HOME_SLOTS - 1) ? { kind: 'home', slot: raw.slot } : null
    default:
      return null
  }
}
