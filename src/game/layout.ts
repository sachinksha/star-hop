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
/**
 * Radius of a drawn hole and of a marble. Holes are 1 apart, so a marble is
 * 0.76 of the spacing: as large as it can be while neighbours still read as
 * separate pieces. (They were 0.64 before the phone tap-target work.)
 */
export const HOLE_R = 0.4
export const MARBLE_R = 0.38
/** Distance from the centre to the innermost holes of each arm. */
export const ARM_INNER = 3.4
/** Sideways offset of the two loop columns from the arm's middle line. */
export const ARM_HALF = 1
/** Distance from the centre to the stars. */
export const STAR_RADIUS = 3
/** Distance from the centre to the base holes. */
const BASE_ALONG = ARM_INNER + 6.3
/**
 * The board's background: a rounded rectangle just big enough for the arms.
 * With the bottom arm pointing down, arms reach about 10.3 up and down but
 * only 9.95 sideways, so a rectangle (not the old circle, radius 10.65) gives
 * a portrait phone, where width is what limits the board, about 7% more pixels
 * per hole.
 */
export const BOARD_HALF_X = 10.15
export const BOARD_HALF_Y = 10.5
export const BOARD_CORNER = 2.4
/** Half the viewBox width and height, centred on (0, 0): the board plus its edge. */
export const VIEW_HALF_X = BOARD_HALF_X + 0.15
export const VIEW_HALF_Y = BOARD_HALF_Y + 0.15

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

/**
 * Base holes in marble order, 1 to 4 reading left to right on the bottom arm
 * (seen from the centre that is counter-clockwise, hence the negative offset).
 */
export function basePoint(color: Color, slot: number, bottom: number): Point {
  return armPoint(armOf(color), bottom, BASE_ALONG, (1.5 - slot) * 0.95)
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

const fmtPoint = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`

/**
 * Corners of the backdrop for one arm: a strip behind its holes, widening a
 * little toward the base. The far end runs under the base pad, which caps it.
 */
export function armCorners(arm: number, bottom: number): Point[] {
  const near = ARM_INNER - 0.65
  const far = BASE_ALONG
  const side = ARM_HALF + 0.62
  return [
    armPoint(arm, bottom, near, -side),
    armPoint(arm, bottom, far, -side - 0.35),
    armPoint(arm, bottom, far, side + 0.35),
    armPoint(arm, bottom, near, side),
  ]
}

/** Corners of the solid pad behind an arm's four base holes. */
export function baseCorners(arm: number, bottom: number): Point[] {
  const near = BASE_ALONG - 0.6
  const far = BASE_ALONG + 0.6
  const side = 2.05
  return [
    armPoint(arm, bottom, near, -side),
    armPoint(arm, bottom, far, -side),
    armPoint(arm, bottom, far, side),
    armPoint(arm, bottom, near, side),
  ]
}

/**
 * An SVG path through `points` with each corner rounded off: the path stops
 * `radius` short of the corner and curves (a quadratic Bezier with the corner
 * as its control point) to the same distance along the next edge. `radius`
 * can be one number or one per corner (0 keeps that corner sharp).
 */
export function roundedPath(points: readonly Point[], radius: number | readonly number[]): string {
  const n = points.length
  const toward = (from: Point, to: Point, r: number): Point => {
    const len = Math.hypot(to.x - from.x, to.y - from.y)
    const k = Math.min(r / len, 0.5)
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
  }
  let d = ''
  points.forEach((p, i) => {
    const r = typeof radius === 'number' ? radius : (radius[i] ?? 0)
    const a = toward(p, points[(i + n - 1) % n]!, r)
    const b = toward(p, points[(i + 1) % n]!, r)
    d += `${i === 0 ? 'M' : 'L'}${fmtPoint(a)} Q${fmtPoint(p)} ${fmtPoint(b)} `
  })
  return `${d}Z`
}

/** An arm's backdrop as a path, its inner corners rounded. The outer ones hide under the base pad. */
export function armOutline(arm: number, bottom: number): string {
  return roundedPath(armCorners(arm, bottom), [0.55, 0, 0, 0.55])
}

/** An arm's base pad as a path, with rounded corners. */
export function baseOutline(arm: number, bottom: number): string {
  return roundedPath(baseCorners(arm, bottom), 0.5)
}

/**
 * A chevron (a bold "›") centred on `p`, pointing at `angle` (radians,
 * SVG convention: clockwise from +x), as polygon points. `halfWidth` is half
 * its span across the direction, `depth` how far the point sticks out, and
 * `thickness` the stroke weight, measured along the direction.
 */
export function chevron(p: Point, angle: number, halfWidth: number, depth: number, thickness: number): string {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const back = -(depth + thickness) / 2
  const local: [number, number][] = [
    [back, -halfWidth],
    [back + thickness, -halfWidth],
    [back + thickness + depth, 0],
    [back + thickness, halfWidth],
    [back, halfWidth],
    [back + depth, 0],
  ]
  return local.map(([u, v]) => fmtPoint({ x: p.x + u * c - v * s, y: p.y + u * s + v * c })).join(' ')
}

/**
 * A filled arrow (shaft and triangular head) centred on `p`, pointing at
 * `angle`, `length` long overall, as polygon points.
 */
export function arrow(p: Point, angle: number, length: number, shaft: number, head: number): string {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const back = -length / 2
  const neck = length / 2 - head * 0.75
  const local: [number, number][] = [
    [back, -shaft / 2],
    [neck, -shaft / 2],
    [neck, -head / 2],
    [length / 2, 0],
    [neck, head / 2],
    [neck, shaft / 2],
    [back, shaft / 2],
  ]
  return local.map(([u, v]) => fmtPoint({ x: p.x + u * c - v * s, y: p.y + u * s + v * c })).join(' ')
}

/** Midpoint of two points and the direction from the first to the second. */
export function stepBetween(a: Point, b: Point): { p: Point; angle: number } {
  return { p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** Width of the thin band joining the stars (it runs along the star circle). */
export const STAR_BAND_WIDTH = 0.3

/**
 * Where the star band's chevrons sit: on the stretch between two stars, each
 * pointing clockwise along the band, like the warning chevrons on a bend in
 * the road (star hops go clockwise). Each stretch crosses the inner end of an
 * arm, where the last home hole touches the circle, so the chevrons come in
 * two pairs either side of it, clear of the stars and every hole.
 */
export function starRingChevrons(bottom: number): { p: Point; angle: number }[] {
  const out: { p: Point; angle: number }[] = []
  for (let arm = 0; arm < ARM_COUNT; arm++) {
    for (const off of [-12, -6, 6, 12]) {
      const t = armAngle(arm, bottom) + off * DEG
      out.push({ p: { x: Math.cos(t) * STAR_RADIUS, y: Math.sin(t) * STAR_RADIUS }, angle: t + Math.PI / 2 })
    }
  }
  return out
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
