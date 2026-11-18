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

/**
 * Optional house rules (README R22-R24), chosen at setup and fixed for the
 * game. They live in the game state, so replays, saved games and online
 * guests all play by the same rules.
 */
export interface HouseRules {
  /**
   * R22: after a 6, make every bonus roll first (until a roll that isn't a 6),
   * then use the dice in any order, one marble move per die.
   */
  rollSixesFirst: boolean
  /** R23: a marble that starts its turn on a star may walk through the centre as well as round the stars. */
  crossCentre: boolean
  /** R24: a start hole is safe for its owner. Others may share it with the owner. */
  safeStarts: boolean
}

export const NO_HOUSE_RULES: HouseRules = { rollSixesFirst: false, crossCentre: false, safeStarts: false }
/** Every house rule on: how the game is played. New games always use these. */
export const ALL_HOUSE_RULES: HouseRules = { rollSixesFirst: true, crossCentre: true, safeStarts: true }
export const HOUSE_RULE_KEYS: readonly (keyof HouseRules)[] = ['rollSixesFirst', 'crossCentre', 'safeStarts']

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
  /**
   * Team number (0, 1, 2) in team play, or null when everyone plays alone.
   * Teammates can't bump each other, and a finished player keeps taking turns
   * to roll for an unfinished teammate.
   */
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
 *  - 'cross'      : house rule R23, from a star through the centre to another
 *                   star (then possibly walking down its arm)
 */
export type MoveVia = 'enter' | 'walk' | 'hop' | 'toCenter' | 'fromCenter' | 'cross'

export interface Move {
  /** The die this move uses. With several dice in the pool (R22) moves are listed for each. */
  die: number
  marbleId: number
  from: Spot
  to: Spot
  /** Every hole stepped on in order, ending with `to`. Used for blocking and animation. */
  path: Spot[]
  via: MoveVia
  /** Star-network steps (star to star, or via the centre) before walking. 0 for a plain walk. */
  hops: number
  /** The marble on `to` (an opponent's, or in team play possibly a teammate's), which goes back to its base. */
  bumped: { color: Color; marbleId: number } | null
  /** The marble enters home with this move (it was not in home before). */
  reachesHome: boolean
}

export type Phase = 'roll' | 'move' | 'gameOver'

export interface GameState {
  players: Player[]
  /** Index into players of the seat whose turn it is (the one who rolls). */
  currentIndex: number
  /**
   * Team play: the teammate whose marbles this turn's roll moves, when a
   * finished player rolls for them. Null when players move their own marbles.
   * Set by the roll and cleared when the turn moves on.
   */
  playingFor: Color | null
  /** The most recent roll this turn, for display (null when the turn has moved on). */
  dice: number | null
  /**
   * Dice rolled this turn and not used yet. Normally one die. With R22 every
   * bonus roll after a 6 is banked here first, and moves then use them in any
   * order.
   */
  pool: number[]
  /** House rules for this game, fixed at setup. */
  rules: HouseRules
  phase: Phase
  /**
   * Legal choices for the current player, empty unless phase is 'move'.
   * Grouped by die (in pool order), then by marble id, then for each marble
   * with the destination closest to home first and the centre last. The UI
   * numbers one die's destinations in this order.
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
  /** `for` names the teammate the roll was for, when a finished player rolled for them. */
  | { type: 'roll'; value: number; color: Color; for?: Color }
  /** `color` owns the marble that moved; `by` is the roller when that was a teammate. */
  | { type: 'move'; move: Move; color: Color; by?: Color }
  /** `friendly` marks a teammate's marble bumped in team play (allowed, but best avoided). */
  | { type: 'bump'; color: Color; victim: Color; friendly?: boolean }
  /**
   * The roll allowed no move. `rollAgain` is true after a 6 (R6). With R22,
   * `unused` lists dice left over that no marble could use (they are lost).
   */
  | { type: 'noMoves'; color: Color; rollAgain: boolean; unused?: number[] }
  | { type: 'finish'; color: Color; rank: number }
  | { type: 'gameOver'; winners: Color[]; early?: boolean }
  /** A finished player chose not to roll for their team this turn. */
  | { type: 'pass'; color: Color }
  /** Every member of a team has finished. `rank` is the team's place. */
  | { type: 'teamFinish'; team: number; rank: number }
  /** A bot took a seat. Both names are kept so every screen can explain the change. */
  | { type: 'takeover'; color: Color; from: string; to: string }

/**
 * A recorded decision. Rolls store their value, so replays reproduce the same
 * dice. A move names the marble and its destination, which must match one of
 * the legal moves; anything else is ignored.
 */
export type GameAction =
  /**
   * `for` is set on a finished player's roll in team play: the unfinished
   * teammate whose marbles the roll moves. It is chosen before rolling.
   */
  | { type: 'roll'; value: number; actor: PlayerKind; for?: Color }
  /** A finished player in team play skips their roll. */
  | { type: 'pass'; actor: PlayerKind }
  /** `die` picks which pooled die the move uses (R22). Optional: the first matching die otherwise. */
  | { type: 'move'; marbleId: number; to: Spot; actor: PlayerKind; die?: number }
  /** Ends the game early, ranking unfinished seats by progress. */
  | { type: 'end'; actor: PlayerKind }
  /** A bot takes over a seat (an online player who left). The profile is recorded for replays. */
  | { type: 'takeover'; color: Color; bot: BotProfile; actor: PlayerKind }

/**
 * A seat chosen on the setup screen. `name` is an optional display label for
 * humans. `remote` marks a human seat played from another device (online).
 * `team` groups seats into teams (0, 1, 2); leave it out for solo play.
 * `you` marks the seat this device's player chose as their own: it is drawn
 * at the bottom of the board, and players are numbered clockwise from it.
 */
export type PlayerConfig = {
  color: Color
  kind: PlayerKind
  name?: string
  remote?: boolean
  team?: number
  you?: boolean
}
