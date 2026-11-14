/**
 * The rules engine: pure state transitions. No React, no timers, no network.
 * `applyAction` returns the same state object when an action is not legal, so
 * callers (and the online host validating a guest's intent) can check
 * `next === state`.
 */
import { createBotProfile } from './bot'
import { COLORS, ENTRY_ROLLS, armOf, progressOf, sameSpot } from './board'
import { legalMovesFor, playersAfterMove } from './rules'
import { helperTargets, isHelperTurn, isTeammate, moverOf, sideDone, takesTurns } from './teams'
import {
  MARBLES_PER_PLAYER,
  type BotProfile,
  type Color,
  type GameAction,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerConfig,
  type Spot,
} from './types'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/** Rolling this earns another roll (R6). */
export const BONUS_ROLL = 6

/** Random source returning a number in [0, 1). Injectable for tests. */
export type Rng = () => number

export function rollDie(rng: Rng): number {
  return Math.min(6, Math.floor(rng() * 6) + 1)
}

/**
 * Uniform random number in [0, 1) from the browser's cryptographic generator,
 * falling back to Math.random where it is unavailable.
 */
export const secureRandom: Rng = () => {
  const c = globalThis.crypto
  if (!c?.getRandomValues) return Math.random()
  const buf = new Uint32Array(1)
  c.getRandomValues(buf)
  return buf[0]! / 4294967296
}

// ---------------------------------------------------------------------------
// Comeback dice (R13)

/** Fair odds of an entry roll (a 1 or a 6). */
export const BASE_ENTRY_CHANCE = ENTRY_ROLLS.length / 6
/** Stuck rolls allowed at fair odds before comeback dice start helping. */
export const COMEBACK_GRACE = 3
/** Extra chance of an entry roll for each stuck roll past the grace period. */
export const COMEBACK_STEP = 0.08
/** Comeback dice never make an entry roll more likely than this. */
export const COMEBACK_CAP = 0.6

/**
 * True when a player has nothing on the board: at least one marble in base and
 * none on the loop or in the centre, so only an entry roll moves anything out.
 */
export function isStuck(player: Player): boolean {
  return (
    player.marbles.some((m) => m.spot.kind === 'base') &&
    player.marbles.every((m) => m.spot.kind === 'base' || m.spot.kind === 'home')
  )
}

/** Chance of rolling a 1 or a 6 for this player. */
export function entryChance(player: Player, comeback: boolean): number {
  if (!comeback || !isStuck(player) || player.dryRolls < COMEBACK_GRACE) return BASE_ENTRY_CHANCE
  return Math.min(COMEBACK_CAP, BASE_ENTRY_CHANCE + (player.dryRolls - COMEBACK_GRACE + 1) * COMEBACK_STEP)
}

/**
 * Rolls the die for the player whose turn it is, or for the teammate `forColor`
 * a finished player is rolling for (comeback odds follow the marbles that
 * move). With fair odds this is exactly rollDie. With boosted odds an entry
 * roll comes up with chance `p` (1 and 6 equally likely) and 2-5 share the
 * rest evenly.
 */
export function rollFor(state: GameState, rng: Rng, comeback: boolean, forColor?: Color): number {
  const player = (forColor && state.players.find((p) => p.color === forColor)) || state.players[state.currentIndex]
  if (!player) return rollDie(rng)
  const p = entryChance(player, comeback)
  if (p === BASE_ENTRY_CHANCE) return rollDie(rng)
  const u = rng()
  if (u < p) return u < p / 2 ? 1 : 6
  return Math.min(5, Math.floor(((u - p) / (1 - p)) * 4) + 2)
}

// ---------------------------------------------------------------------------
// Setup

/**
 * Display names. A custom name wins. Otherwise bots are "Bot 1", "Bot 2"...,
 * online seats are "Friend 1"..., and local humans are "Player 1"... A single
 * local human is "You", or "Host" in an online game (where "You" would be
 * wrong on everyone else's screen).
 */
export function displayNames(configs: PlayerConfig[]): string[] {
  const local = configs.filter((c) => c.kind === 'human' && !c.remote).length
  const online = configs.some((c) => c.remote)
  let bot = 0
  let player = 0
  let friend = 0
  return configs.map((c) => {
    if (c.kind === 'bot') {
      bot += 1
      return `Bot ${bot}`
    }
    const custom = c.name?.trim()
    if (c.remote) {
      friend += 1
      return custom || `Friend ${friend}`
    }
    player += 1
    if (custom) return custom
    if (local === 1) return online ? 'Host' : 'You'
    return `Player ${player}`
  })
}

/**
 * Builds a fresh game for 2 to 6 seats on distinct arms. Seats are put in
 * clockwise arm order, since play passes clockwise. Each bot gets a random
 * playing style from `rng`, then `rng` picks who goes first (R14).
 */
export function createGame(configs: PlayerConfig[], rng: Rng = secureRandom): GameState {
  if (configs.length < MIN_PLAYERS || configs.length > MAX_PLAYERS) {
    throw new Error(`Star Hop needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`)
  }
  if (new Set(configs.map((c) => c.color)).size !== configs.length) {
    throw new Error('Each seat needs its own colour')
  }
  const teamed = configs.filter((c) => c.team !== undefined).length
  if (teamed !== 0 && teamed !== configs.length) throw new Error('In team play every seat needs a team')
  const ordered = [...configs].sort((a, b) => armOf(a.color) - armOf(b.color))
  const names = displayNames(ordered)
  const players: Player[] = ordered.map((c, i) => ({
    color: c.color,
    kind: c.kind,
    name: names[i]!,
    remote: c.kind === 'human' && c.remote === true,
    bot: c.kind === 'bot' ? createBotProfile(rng) : null,
    team: c.team ?? null,
    marbles: Array.from({ length: MARBLES_PER_PLAYER }, (_, id) => ({ id, spot: { kind: 'base' as const } })),
    finishRank: null,
    lastRoll: null,
    dryRolls: 0,
  }))

  return {
    players,
    currentIndex: Math.min(players.length - 1, Math.floor(rng() * players.length)),
    playingFor: null,
    dice: null,
    phase: 'roll',
    legalMoves: [],
    winners: [],
    actionSeq: 0,
    events: [],
  }
}

// ---------------------------------------------------------------------------
// Turn flow

/**
 * Next seat still taking turns, searching clockwise from `from`. In team play
 * that includes finished players with an unfinished teammate (R19).
 */
function nextActiveIndex(players: Player[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const idx = (from + step) % players.length
    const p = players[idx]
    if (p && takesTurns(players, p)) return idx
  }
  return from
}

/** Hands the turn to the next unfinished seat and clears per-turn state. */
function passTurn(state: GameState): GameState {
  return {
    ...state,
    currentIndex: nextActiveIndex(state.players, state.currentIndex),
    playingFor: null,
    dice: null,
    phase: 'roll',
    legalMoves: [],
  }
}

/** Wraps a state transition, bumping the action counter and storing events. */
function commit(state: GameState, events: GameEvent[]): GameState {
  return { ...state, actionSeq: state.actionSeq + 1, events }
}

function current(state: GameState): Player {
  const player = state.players[state.currentIndex]
  if (!player) throw new Error('No current player')
  return player
}

/**
 * Applies a roll with a known value (phase 'roll' only). When no move is
 * possible the turn passes, unless it was a 6 (R6, R7).
 *
 * In team play a finished player must name `forColor`, the unfinished
 * teammate whose marbles the roll moves (R19). Anyone else rolls for
 * themselves, and `forColor` must be absent or their own colour.
 */
export function rollWithValue(state: GameState, value: number, forColor?: Color): GameState {
  if (state.phase !== 'roll' || !Number.isInteger(value) || value < 1 || value > 6) return state
  const seat = state.currentIndex
  const roller = current(state)
  const targets = helperTargets(state)
  let target: Player
  if (targets.length > 0) {
    const chosen = targets.find((p) => p.color === forColor)
    if (!chosen) return state
    target = chosen
  } else {
    if (roller.finishRank !== null || (forColor !== undefined && forColor !== roller.color)) return state
    target = roller
  }
  const helping = target !== roller
  const entry = ENTRY_ROLLS.includes(value)
  const dryRolls = isStuck(target) && !entry ? target.dryRolls + 1 : 0
  const players = state.players.map((p, i) => {
    if (p === target) return { ...p, dryRolls, ...(i === seat ? { lastRoll: value } : {}) }
    return i === seat ? { ...p, lastRoll: value } : p
  })
  const rolled: GameState = { ...state, players, dice: value }
  const rollEvent: GameEvent = helping
    ? { type: 'roll', value, color: roller.color, for: target.color }
    : { type: 'roll', value, color: roller.color }

  const mover = players.find((p) => p.color === target.color)!
  const moves = legalMovesFor(players, mover, value)
  if (moves.length === 0) {
    const rollAgain = value === BONUS_ROLL
    const noMoves: GameEvent = { type: 'noMoves', color: roller.color, rollAgain }
    const next = rollAgain ? { ...rolled, dice: null } : passTurn(rolled)
    return commit(next, [rollEvent, noMoves])
  }
  return commit({ ...rolled, phase: 'move', legalMoves: moves, playingFor: helping ? target.color : null }, [rollEvent])
}

/** A finished player skips their roll for the team (R20). Only on such a turn. */
export function passRoll(state: GameState): GameState {
  if (!isHelperTurn(state)) return state
  return commit(passTurn(state), [{ type: 'pass', color: current(state).color }])
}

/** Side key for counting who is still in the race: the team, or the seat alone. */
const sideKey = (p: Player) => (p.team === null ? p.color : `team:${p.team}`)

/**
 * Plays a legal move for `marbleId` to `to`; ignored if not legal. The marble
 * belongs to the roller, or to the teammate they rolled for.
 */
export function applyMove(state: GameState, marbleId: number, to: Spot): GameState {
  if (state.phase !== 'move') return state
  const move = state.legalMoves.find((m) => m.marbleId === marbleId && sameSpot(m.to, to))
  if (!move) return state

  const roller = current(state)
  const mover = moverOf(state)
  const idx = state.players.indexOf(mover)
  const events: GameEvent[] = [
    mover === roller ? { type: 'move', move, color: mover.color } : { type: 'move', move, color: mover.color, by: roller.color },
  ]

  const players = playersAfterMove(state.players, mover.color, move)
  if (move.bumped) {
    const victim = players.find((p) => p.color === move.bumped!.color)
    const friendly = victim !== undefined && isTeammate(victim, mover)
    events.push(friendly ? { type: 'bump', color: mover.color, victim: move.bumped.color, friendly } : { type: 'bump', color: mover.color, victim: move.bumped.color })
  }

  // Finish: every marble of this seat is home.
  let finishedNow = false
  const moved = players[idx]!
  if (moved.finishRank === null && moved.marbles.every((m) => m.spot.kind === 'home')) {
    const rank = players.filter((p) => p.finishRank !== null).length + 1
    players[idx] = { ...moved, finishRank: rank }
    finishedNow = true
    events.push({ type: 'finish', color: mover.color, rank })
    const team = moved.team
    if (team !== null && sideDone(players, moved)) {
      const teamsDone = new Set(players.filter((p) => p.team !== null && sideDone(players, p)).map((p) => p.team)).size
      events.push({ type: 'teamFinish', team, rank: teamsDone })
    }
  }

  const base: GameState = { ...state, players, legalMoves: [], dice: null, playingFor: null }
  const winners: Color[] = finishedNow ? [...state.winners, mover.color] : state.winners

  // Game over when at most one seat, or one team, is still playing (R15, R21).
  // Whoever is left is ranked by progress.
  const stillPlaying = players.filter((p) => p.finishRank === null)
  if (new Set(stillPlaying.map(sideKey)).size <= 1) {
    const rest = [...stillPlaying].sort((a, b) => totalProgress(b) - totalProgress(a))
    const done = players.length - rest.length
    const finalPlayers = players.map((p) => (rest.includes(p) ? { ...p, finishRank: done + rest.indexOf(p) + 1 } : p))
    const finalWinners = [...winners, ...rest.map((p) => p.color)]
    events.push({ type: 'gameOver', winners: finalWinners })
    return commit({ ...base, players: finalPlayers, phase: 'gameOver', winners: finalWinners }, events)
  }

  // A 6 earns another roll, unless the roller just finished (R6, R16) or has
  // nobody left to roll for.
  const rollerNow = players[state.currentIndex]!
  const rollerFinishedNow = finishedNow && mover === roller
  if (state.dice === BONUS_ROLL && !rollerFinishedNow && takesTurns(players, rollerNow)) {
    return commit({ ...base, winners, phase: 'roll' }, events)
  }
  return commit(passTurn({ ...base, winners }), events)
}

/** Applies any recorded action. */
export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'roll':
      return rollWithValue(state, action.value, action.for)
    case 'pass':
      return passRoll(state)
    case 'move':
      return applyMove(state, action.marbleId, action.to)
    case 'end':
      return endGame(state)
    case 'takeover':
      return takeover(state, action.color, action.bot)
  }
}

/**
 * Hands a human seat to a bot mid-game (an online player who left). The bot is
 * named like the others ("Bot N"), derived from state so every replica and
 * replay picks the same name.
 */
export function takeover(state: GameState, color: Color, bot: BotProfile): GameState {
  const seat = state.players.find((p) => p.color === color)
  if (!seat || seat.kind === 'bot' || state.phase === 'gameOver') return state
  const name = `Bot ${state.players.filter((p) => p.kind === 'bot').length + 1}`
  const players = state.players.map((p) =>
    p.color === color ? { ...p, kind: 'bot' as const, bot, remote: false, name } : p,
  )
  return commit({ ...state, players }, [{ type: 'takeover', color, from: seat.name, to: name }])
}

/** Total progress of a player's marbles (base marbles count as zero). */
export function totalProgress(player: Player): number {
  return player.marbles.reduce((sum, m) => sum + progressOf(player.color, m.spot), 0)
}

/**
 * Ends the game now. Seats that already finished keep their places; the rest
 * are ranked by total progress, with clockwise seat order breaking ties.
 */
export function endGame(state: GameState): GameState {
  if (state.phase === 'gameOver') return state
  const finished = state.players
    .filter((p) => p.finishRank !== null)
    .sort((a, b) => (a.finishRank ?? 0) - (b.finishRank ?? 0))
  const rest = state.players
    .map((p, seat) => ({ p, seat, total: totalProgress(p) }))
    .filter(({ p }) => p.finishRank === null)
    .sort((a, b) => b.total - a.total || a.seat - b.seat)
    .map(({ p }) => p)
  const order = [...finished, ...rest]
  const players = state.players.map((p) => ({ ...p, finishRank: order.indexOf(p) + 1 }))
  const winners = order.map((p) => p.color)
  return commit(
    { ...state, players, phase: 'gameOver', winners, dice: null, legalMoves: [] },
    [{ type: 'gameOver', winners, early: true }],
  )
}

/** Colours in clockwise arm order that are seated in this game. */
export function seatedColors(state: GameState): Color[] {
  return COLORS.filter((c) => state.players.some((p) => p.color === c))
}
