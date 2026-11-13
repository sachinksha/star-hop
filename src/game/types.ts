/**
 * Shared domain types for the Star Hop rules engine.
 *
 * The game is event sourced: a game is its initial GameState plus the list of
 * GameActions applied to it. Dice values are stored in the actions, so a replay
 * reproduces the same game exactly.
 */

/** Seat colours, one per arm, in clockwise arm order (see board.ts COLORS). */
export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export type PlayerKind = 'human' | 'bot'

/** Number of marbles each player owns. */
export const MARBLES_PER_PLAYER = 4

/** Longest player name allowed, so names never stretch the player panels. */
export const MAX_NAME_LENGTH = 12

/**
 * Where a marble is:
 *  - 'base'   : waiting to enter (needs a 1 or a 6)
 *  - 'loop'   : on the shared 84-hole loop, absolute index 0..83. Stars are
 *               loop holes too (every 14th, see board.ts)
 *  - 'center' : the single centre hole, left only with a 1
 *  - 'home'   : one of the owner's 4 home holes, slot 0 (entry) .. 3 (deepest)
 */
export type Spot =
  | { kind: 'base' }
  | { kind: 'loop'; pos: number }
  | { kind: 'center' }
  | { kind: 'home'; slot: number }

export interface Marble {
  id: number
  spot: Spot
}

/** Bot playing styles. Every style still takes an obvious bump or home run. */
export type Persona = 'balanced' | 'hunter' | 'guardian' | 'racer'

/** Weights a bot applies to each feature of a candidate move (tuned in bot.ts). */
export interface BotWeights {
  /** A marble enters home. */
  home: number
  /** Flat value of bumping an opponent back to base. */
  bump: number
  /** Extra bump value per step the victim had already covered. */
  bumpProgress: number
  /** Bringing a marble out of base. */
  enter: number
  /** Value per step closer to home. */
  progress: number
  /** Preference for advancing marbles that are already close to home. */
  lead: number
  /** Fear of ending where opponents can bump the marble next turn. */
  danger: number
  /** Ending on a star (a shortcut available next turn). */
  star: number
  /** Entering the centre (a big shortcut, but only a 1 gets out). */
  center: number
  /** Ending where opponents are within reach next turn. */
  attack: number
  /** Size of the random nudge added to each move's score. */
  noise: number
}

export interface BotProfile {
  persona: Persona
  weights: BotWeights
}

export interface Player {
  color: Color
  kind: PlayerKind
  /** Display name shown on the player's panel, e.g. "You" or "Bot 1". */
  name: string
  /** A human playing from another device in an online game. */
  remote: boolean
  /** Playing style for bots, chosen at random each game. Null for humans. */
  bot: BotProfile | null
  /** Team number for team play. Always null until team play exists. */
  team: number | null
  marbles: Marble[]
  finishRank: number | null
  /** This player's most recent die result, or null before their first roll. */
  lastRoll: number | null
  /**
   * Consecutive rolls this player made while stuck (nothing on the board, at
   * least one marble in base) without rolling a 1 or a 6. Drives the optional
   * comeback dice, and resets as soon as an entry roll comes up.
   */
  dryRolls: number
}

/**
 * How a move travels:
 *  - 'enter'      : base to start, on a 1 or a 6
 *  - 'walk'       : hole by hole along the loop and/or into and up home
 *  - 'hop'        : star to star (at least one hop), then possibly walking
 *  - 'toCenter'   : ends in the centre
 *  - 'fromCenter' : centre to a star, on a 1
 */
export type MoveVia = 'enter' | 'walk' | 'hop' | 'toCenter' | 'fromCenter'

export interface Move {
  marbleId: number
  from: Spot
  to: Spot
  /** Every hole stepped on in order, ending with `to`. Used for blocking and animation. */
  path: Spot[]
  via: MoveVia
  /** Stars hopped before walking (0 unless via is 'hop'). */
  hops: number
  /** The opponent marble on `to`, which goes back to its base. */
  bumped: { color: Color; marbleId: number } | null
  /** The marble enters home with this move (it was not in home before). */
  reachesHome: boolean
}

export type Phase = 'roll' | 'move' | 'gameOver'

export interface GameState {
  players: Player[]
  /** Index into players of the seat whose turn it is. */
  currentIndex: number
  /** Die value for the move being chosen (null when not waiting on a move). */
  dice: number | null
  phase: Phase
  /**
   * Legal choices for the current player, empty unless phase is 'move'.
   * Ordered by marble id, then for each marble with the destination closest
   * to home first and the centre last. The UI numbers destinations in this order.
   */
  legalMoves: Move[]
  /** Colours in finishing order, filled in as players finish. */
  winners: Color[]
  /** Increments once for every applied action. */
  actionSeq: number
  /** Events produced by the most recent action, in order. */
  events: GameEvent[]
}

export type GameEvent =
  | { type: 'roll'; value: number; color: Color }
  | { type: 'move'; move: Move; color: Color }
  | { type: 'bump'; color: Color; victim: Color }
  /** The roll allowed no move. `rollAgain` is true after a 6 (R6). */
  | { type: 'noMoves'; color: Color; rollAgain: boolean }
  | { type: 'finish'; color: Color; rank: number }
  | { type: 'gameOver'; winners: Color[]; early?: boolean }
  /** A bot took a seat. Both names are kept so every screen can explain the change. */
  | { type: 'takeover'; color: Color; from: string; to: string }

/**
 * A recorded decision. Rolls store their value, so replays reproduce the same
 * dice. A move names the marble and its destination, which must match one of
 * the legal moves; anything else is ignored.
 */
export type GameAction =
  | { type: 'roll'; value: number; actor: PlayerKind }
  | { type: 'move'; marbleId: number; to: Spot; actor: PlayerKind }
  /** Ends the game early, ranking unfinished seats by progress. */
  | { type: 'end'; actor: PlayerKind }
  /** A bot takes over a seat (an online player who left). The profile is recorded for replays. */
  | { type: 'takeover'; color: Color; bot: BotProfile; actor: PlayerKind }

/**
 * A seat chosen on the setup screen. `name` is an optional display label for
 * humans. `remote` marks a human seat played from another device (online).
 * `team` is reserved for team play.
 */
export type PlayerConfig = {
  color: Color
  kind: PlayerKind
  name?: string
  remote?: boolean
  team?: number
}
