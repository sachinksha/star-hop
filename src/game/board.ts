/**
 * Board geometry. Pure numbers: where things are on screen lives in layout.ts.
 *
 * Six arms, numbered 0..5 clockwise, one per colour. The shared loop has 84
 * holes, 14 per sector. Sector `a` covers absolute holes 14a .. 14a+13, in
 * travel order:
 *
 *   14a + 0        star S_a          (inner corner where arm a-1 meets arm a)
 *   14a + 1..5     inbound column    (outward along arm a)
 *   14a + 6        pre-start         (arm a's marbles step from here into home)
 *   14a + 7        start of arm a
 *   14a + 8        post-start
 *   14a + 9..13    outbound column   (back toward the centre, then S_{a+1})
 *
 * S_a is arm a's "home star": walking from it leads down arm a to home.
 */
import type { Color, Spot } from './types'

/** Colours in clockwise arm order. A colour's index is its arm number. */
export const COLORS: readonly Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

export const ARM_COUNT = 6
export const SECTOR_LENGTH = 14
export const LOOP_LENGTH = ARM_COUNT * SECTOR_LENGTH
export const HOME_SLOTS = 4

const PRE_START_OFFSET = 6
const START_OFFSET = 7

/** Rolls that bring a marble out of base. */
export const ENTRY_ROLLS: readonly number[] = [1, 6]

/** The only roll that enters the centre from a star a marble is sitting on, or leaves the centre. */
export const CENTER_ROLL = 1

export function armOf(color: Color): number {
  return COLORS.indexOf(color)
}

/** Wraps any integer onto the loop (0..83). */
export function wrap(pos: number): number {
  return ((pos % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH
}

export function startIndex(color: Color): number {
  return armOf(color) * SECTOR_LENGTH + START_OFFSET
}

export function preStartIndex(color: Color): number {
  return armOf(color) * SECTOR_LENGTH + PRE_START_OFFSET
}

/** Absolute index of star S_arm. */
export function starIndex(arm: number): number {
  return wrap(arm) * SECTOR_LENGTH
}

/** The colour's home star: the last star before its home arm. */
export function homeStarIndex(color: Color): number {
  return starIndex(armOf(color))
}

export function isStar(pos: number): boolean {
  return pos % SECTOR_LENGTH === 0
}

/** All six star holes, in clockwise order from S_0. */
export const STAR_INDICES: readonly number[] = Array.from({ length: ARM_COUNT }, (_, a) => starIndex(a))

/** The star after `pos` (a star) going clockwise. */
export function nextStar(pos: number): number {
  return wrap(pos + SECTOR_LENGTH)
}

/**
 * The hole one step on from `spot` when walking, or null when there is none.
 * Walking follows the loop clockwise, except that the colour's own pre-start
 * hole leads into home. Home holes lead deeper until the last one. Base and
 * the centre are left by special moves, never by walking.
 */
export function nextWalk(color: Color, spot: Spot): Spot | null {
  switch (spot.kind) {
    case 'loop':
      if (spot.pos === preStartIndex(color)) return { kind: 'home', slot: 0 }
      return { kind: 'loop', pos: wrap(spot.pos + 1) }
    case 'home':
      return spot.slot + 1 < HOME_SLOTS ? { kind: 'home', slot: spot.slot + 1 } : null
    case 'base':
    case 'center':
      return null
  }
}

/**
 * Walking steps from a loop hole to the first home hole. Start is 84 steps
 * away; pre-start is 1. Star hops can carry a marble anywhere, so this is the
 * measure of progress rather than distance travelled.
 */
export function loopStepsToHome(color: Color, pos: number): number {
  return wrap(preStartIndex(color) - pos) + 1
}

/** Steps to home from start, plus the entry move itself. */
export const BASE_STEPS_TO_HOME = loopStepsToHome('red', startIndex('red')) + 1

/**
 * Stand-in distance for a marble in the centre: one 1-roll to the home star,
 * then 7 steps down the arm, plus a few steps' worth of turns spent waiting for
 * the 1. Only used for ranking and bot estimates.
 */
export const CENTER_STEPS_TO_HOME = 1 + loopStepsToHome('red', homeStarIndex('red')) + 6

/**
 * How far a marble still has to go to reach home slot 0. Lower is better.
 * Marbles already in home score 0 at the entry and negative deeper in, so
 * moving up inside home still counts as progress.
 */
export function stepsToHome(color: Color, spot: Spot): number {
  switch (spot.kind) {
    case 'base':
      return BASE_STEPS_TO_HOME
    case 'loop':
      return loopStepsToHome(color, spot.pos)
    case 'center':
      return CENTER_STEPS_TO_HOME
    case 'home':
      return -spot.slot
  }
}

/** Progress made by a marble, 0 in base and highest deep in home. */
export function progressOf(color: Color, spot: Spot): number {
  return BASE_STEPS_TO_HOME - stepsToHome(color, spot)
}

/**
 * A key that identifies a hole. Home holes are private per colour, so their
 * key includes the colour. All base marbles share one key.
 */
export function spotKey(color: Color, spot: Spot): string {
  switch (spot.kind) {
    case 'base':
      return `base:${color}`
    case 'loop':
      return `loop:${spot.pos}`
    case 'center':
      return 'center'
    case 'home':
      return `home:${color}:${spot.slot}`
  }
}

export function sameSpot(a: Spot, b: Spot): boolean {
  switch (a.kind) {
    case 'base':
    case 'center':
      return b.kind === a.kind
    case 'loop':
      return b.kind === 'loop' && b.pos === a.pos
    case 'home':
      return b.kind === 'home' && b.slot === a.slot
  }
}
