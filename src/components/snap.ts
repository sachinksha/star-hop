import type { Point } from '../game/layout'

/** How far (board units, about 21px on a phone) a tap may be from a piece and still pick it. */
export const SNAP_R = 1.25
/** The nearest piece must be at least this much closer than the next, or the tap is ambiguous and ignored. */
export const SNAP_MARGIN = 0.3

/**
 * Picks the target nearest a tap, or null. Only candidates count (the few
 * marbles or badges that can be used right now), so each one effectively owns
 * the whole region of the board closer to it than to any other candidate: a
 * Voronoi cell, capped at SNAP_R. When two candidates are about equally close
 * the tap is ambiguous, and doing nothing is safer than guessing.
 */
export function snapTap<T>(at: Point, candidates: { p: Point; value: T }[]): T | null {
  const ranked = candidates
    .map((c) => ({ value: c.value, d: Math.hypot(c.p.x - at.x, c.p.y - at.y) }))
    .sort((a, b) => a.d - b.d)
  const [first, second] = ranked
  if (!first || first.d > SNAP_R) return null
  if (second && second.d - first.d < SNAP_MARGIN) return null
  return first.value
}

