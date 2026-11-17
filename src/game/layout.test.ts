import { describe, expect, it } from 'vitest'
import { COLORS, LOOP_LENGTH, nextWalk } from './board'
import { BOARD_HALF_X, BOARD_HALF_Y, HOLE_R, VIEW_HALF_X, VIEW_HALF_Y, armCorners, baseCorners, starRingChevrons, chevron, roundedPath, basePoint, homePoint, loopPoint, marblePoint, starPoint, type Point } from './layout'
import type { Spot } from './types'

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Every hole on the board for a given rotation. */
function allHoles(bottom: number): { name: string; p: Point }[] {
  const holes = Array.from({ length: LOOP_LENGTH }, (_, pos) => ({ name: `loop ${pos}`, p: loopPoint(pos, bottom) }))
  for (const c of COLORS) {
    for (let s = 0; s < 4; s++) {
      holes.push({ name: `${c} home ${s}`, p: homePoint(c, s, bottom) })
      holes.push({ name: `${c} base ${s}`, p: basePoint(c, s, bottom) })
    }
  }
  holes.push({ name: 'centre', p: { x: 0, y: 0 } })
  return holes
}

describe('board layout', () => {
  for (const bottom of [0, 3]) {
    it(`never overlaps two holes (bottom arm ${bottom})`, () => {
      const holes = allHoles(bottom)
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          const d = dist(holes[i]!.p, holes[j]!.p)
          expect(d, `${holes[i]!.name} vs ${holes[j]!.name}`).toBeGreaterThan(HOLE_R * 2.2)
        }
      }
    })
  }

  it('fits inside the view box, for every rotation', () => {
    for (let bottom = 0; bottom < 6; bottom++) {
      for (const { p } of allHoles(bottom)) {
        expect(Math.abs(p.x) + HOLE_R).toBeLessThan(VIEW_HALF_X)
        expect(Math.abs(p.y) + HOLE_R).toBeLessThan(VIEW_HALF_Y)
      }
    }
  })

  it('keeps the arms and base pads inside the board, with a margin', () => {
    for (let bottom = 0; bottom < 6; bottom++) {
      for (let arm = 0; arm < 6; arm++) {
        for (const { x, y } of [...armCorners(arm, bottom), ...baseCorners(arm, bottom)]) {
          expect(Math.abs(x)).toBeLessThan(BOARD_HALF_X - 0.15)
          expect(Math.abs(y)).toBeLessThan(BOARD_HALF_Y - 0.15)
        }
      }
    }
  })

  it('keeps every walking step short, so the path reads as a path', () => {
    for (const color of COLORS) {
      let at: Spot = { kind: 'loop', pos: 0 }
      for (let i = 0; i < LOOP_LENGTH + 4; i++) {
        const next = nextWalk(color, at)
        if (!next) break
        const d = dist(marblePoint(color, 0, at, 0), marblePoint(color, 0, next, 0))
        expect(d).toBeLessThan(1.5)
        at = next
      }
    }
  })

  it('draws the bottom arm at the bottom and goes clockwise', () => {
    const start = loopPoint(7, 0) // red's start
    expect(start.y).toBeGreaterThan(8)
    expect(Math.abs(start.x)).toBeLessThan(0.01)
    const blueStart = loopPoint(4 * 14 + 7, 4)
    expect(blueStart.y).toBeGreaterThan(8)
    // Clockwise at the bottom of the board means right to left: marbles come
    // down the right side of the bottom arm and go back up the left side.
    expect(loopPoint(1, 0).x).toBeGreaterThan(0)
    expect(loopPoint(13, 0).x).toBeLessThan(0)
  })

  it('numbers the base marbles 1 to 4 from left to right on the bottom arm', () => {
    for (let bottom = 0; bottom < 6; bottom++) {
      const xs = [0, 1, 2, 3].map((slot) => basePoint(COLORS[bottom]!, slot, bottom).x)
      expect(xs).toEqual([...xs].sort((a, b) => a - b))
    }
  })

  it('puts each star between two arms, equally far from both', () => {
    const s = starPoint(1, 0)
    expect(dist(s, loopPoint(13, 0))).toBeCloseTo(dist(s, loopPoint(15, 0)), 5)
  })

  it('rounds corners only where asked', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]
    expect(roundedPath(square, 1)).toBe('M0.000,1.000 Q0.000,0.000 1.000,0.000 L3.000,0.000 Q4.000,0.000 4.000,1.000 L4.000,3.000 Q4.000,4.000 3.000,4.000 L1.000,4.000 Q0.000,4.000 0.000,3.000 Z')
    // A zero radius leaves that corner sharp: the curve collapses onto the corner.
    expect(roundedPath(square, [0, 1, 1, 1])).toMatch(/^M0\.000,0\.000 Q0\.000,0\.000 0\.000,0\.000 /)
  })

  it('points a chevron where it is told', () => {
    const tip = (points: string) => points.split(' ').map((xy) => xy.split(',').map(Number) as [number, number])[2]!
    const [x, y] = tip(chevron({ x: 0, y: 0 }, Math.PI / 2, 0.2, 0.1, 0.05))
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeGreaterThan(0) // pointing down the screen
  })

  it('turns the star band chevrons clockwise, clear of the stars and holes', () => {
    for (const { p, angle } of starRingChevrons(0)) {
      // Clockwise on screen: the direction is the radius turned +90 degrees.
      const radial = Math.atan2(p.y, p.x)
      expect(Math.cos(angle - radial - Math.PI / 2)).toBeCloseTo(1, 5)
      for (let arm = 0; arm < 6; arm++) expect(dist(p, starPoint(arm, 0))).toBeGreaterThan(0.78 + 0.1) // star points
      for (const hole of allHoles(0)) expect(dist(p, hole.p), hole.name).toBeGreaterThan(HOLE_R + 0.1)
    }
  })
})
