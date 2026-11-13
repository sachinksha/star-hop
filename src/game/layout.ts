/**
 * Where every hole sits on screen, in SVG user units with the centre hole at
 * (0, 0). Pure geometry: the rules never look at this.
 *
 * Each arm points straight out from the centre. Seen from the centre looking
 * out along arm a:
 *
 *   inbound column  (loop 14a+1..5)  on the side facing arm a-1, walking outward
 *   end row         pre-start (14a+6), start (14a+7), post-start (14a+8)
 *   outbound column (loop 14a+9..13) on the side facing arm a+1, walking inward
 *   home column     (slots 0..3)     down the middle, slot 0 nearest the end row
 *   base            (4 holes)        beyond the end row
 *
 * Star S_a sits between arm a-1 and arm a. Arms are 60 degrees apart and go
 * clockwise on screen (SVG's y axis points down, so increasing angle is
 * clockwise). `bottom` names the arm drawn at the bottom, so each device can
 * put its own player nearest to them.
 */
import { ARM_COUNT, SECTOR_LENGTH, armOf } from './board'
import type { Color, Spot } from './types'

export interface Point {
  x: number
  y: number
}

/** Distance between neighbouring holes. */
export const HOLE_GAP = 1
/** Radius of a drawn hole and of a marble. */
export const HOLE_R = 0.36
export const MARBLE_R = 0.32
/** Distance from the centre to the innermost holes of each arm. */
export const ARM_INNER = 3.4
/** Sideways offset of the two loop columns from the arm's middle line. */
export const ARM_HALF = 1
/** Distance from the centre to the stars. */
export const STAR_RADIUS = 3
/** Distance from the centre to the base holes. */
const BASE_ALONG = ARM_INNER + 6.3
/** The square viewBox needed to fit everything, centred on (0, 0). */
export const VIEW_HALF = 10.6

const DEG = Math.PI / 180

/** Direction an arm points, in radians. The `bottom` arm points straight down. */
export function armAngle(arm: number, bottom: number): number {
  return (90 + (360 / ARM_COUNT) * (arm - bottom)) * DEG
}

/** A point `along` the arm's middle line and `across` it (positive toward the next arm clockwise). */
function armPoint(arm: number, bottom: number, along: number, across: number): Point {
  const t = armAngle(arm, bottom)
  return {
    x: Math.cos(t) * along - Math.sin(t) * across,
    y: Math.sin(t) * along + Math.cos(t) * across,
  }
}

/** Position of star S_arm. */
export function starPoint(arm: number, bottom: number): Point {
  const t = armAngle(arm, bottom) - (180 / ARM_COUNT) * DEG
  return { x: Math.cos(t) * STAR_RADIUS, y: Math.sin(t) * STAR_RADIUS }
}

/** Position of loop hole `pos` (0..83). */
export function loopPoint(pos: number, bottom: number): Point {
  const arm = Math.floor(pos / SECTOR_LENGTH)
  const o = pos % SECTOR_LENGTH
  if (o === 0) return starPoint(arm, bottom)
  if (o <= 5) return armPoint(arm, bottom, ARM_INNER + (o - 1) * HOLE_GAP, -ARM_HALF)
  if (o <= 8) return armPoint(arm, bottom, ARM_INNER + 5 * HOLE_GAP, (o - 7) * ARM_HALF)
  return armPoint(arm, bottom, ARM_INNER + (13 - o) * HOLE_GAP, ARM_HALF)
}

export function homePoint(color: Color, slot: number, bottom: number): Point {
  return armPoint(armOf(color), bottom, ARM_INNER + (4 - slot) * HOLE_GAP, 0)
}

export function basePoint(color: Color, slot: number, bottom: number): Point {
  return armPoint(armOf(color), bottom, BASE_ALONG, (slot - 1.5) * 0.95)
}

export const CENTER_POINT: Point = { x: 0, y: 0 }

/**
 * Where a marble is drawn. Base marbles use the base hole matching their id,
 * so each marble keeps its own place.
 */
export function marblePoint(color: Color, marbleId: number, spot: Spot, bottom: number): Point {
  switch (spot.kind) {
    case 'base':
      return basePoint(color, marbleId, bottom)
    case 'loop':
      return loopPoint(spot.pos, bottom)
    case 'center':
      return CENTER_POINT
    case 'home':
      return homePoint(color, spot.slot, bottom)
  }
}

/**
 * Corners of the backdrop for one arm (a rounded strip behind its holes), as an
 * SVG polygon points string.
 */
export function armOutline(arm: number, bottom: number): string {
  const near = ARM_INNER - 0.65
  const far = BASE_ALONG + 0.7
  const side = ARM_HALF + 0.62
  return [
    armPoint(arm, bottom, near, -side),
    armPoint(arm, bottom, far, -side - 0.35),
    armPoint(arm, bottom, far, side + 0.35),
    armPoint(arm, bottom, near, side),
  ]
    .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(' ')
}

/** Five-point star outline centred on `p`. */
export function starShape(p: Point, outer = 0.78, inner = 0.34, turn = 0): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / 5) * i - Math.PI / 2 + turn
    pts.push(`${(p.x + r * Math.cos(a)).toFixed(3)},${(p.y + r * Math.sin(a)).toFixed(3)}`)
  }
  return pts.join(' ')
}
