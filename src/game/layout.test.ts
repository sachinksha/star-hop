import { describe, expect, it } from 'vitest'
import { COLORS, LOOP_LENGTH, nextWalk } from './board'
import { HOLE_R, VIEW_HALF, armOutline, baseOutline, basePoint, homePoint, loopPoint, marblePoint, starPoint, type Point } from './layout'
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

  it('fits inside the view box', () => {
    for (const { p } of allHoles(0)) {
      expect(Math.abs(p.x) + HOLE_R).toBeLessThan(VIEW_HALF)
      expect(Math.abs(p.y) + HOLE_R).toBeLessThan(VIEW_HALF)
    }
  })

  it('keeps the arms and base pads inside the round board', () => {
    const corners = (points: string) => points.split(' ').map((xy) => xy.split(',').map(Number) as [number, number])
    for (let arm = 0; arm < 6; arm++) {
      for (const [x, y] of [...corners(armOutline(arm, 0)), ...corners(baseOutline(arm, 0))]) {
        expect(Math.hypot(x, y)).toBeLessThan(VIEW_HALF - 0.15)
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

  it('puts each star between two arms, equally far from both', () => {
    const s = starPoint(1, 0)
    expect(dist(s, loopPoint(13, 0))).toBeCloseTo(dist(s, loopPoint(15, 0)), 5)
  })
})
