import { describe, expect, it } from 'vitest'
import {
  BASE_STEPS_TO_HOME,
  COLORS,
  LOOP_LENGTH,
  STAR_INDICES,
  homeStarIndex,
  isStar,
  loopStepsToHome,
  nextStar,
  nextWalk,
  preStartIndex,
  progressOf,
  spotKey,
  startIndex,
  stepsToHome,
} from './board'

describe('board geometry', () => {
  it('has 84 loop holes and 6 stars, one every 14 holes', () => {
    expect(LOOP_LENGTH).toBe(84)
    expect(STAR_INDICES).toEqual([0, 14, 28, 42, 56, 70])
    expect(STAR_INDICES.every(isStar)).toBe(true)
    expect(isStar(7)).toBe(false)
  })

  it('places each arm\'s pre-start, start and home star in its sector', () => {
    COLORS.forEach((c, arm) => {
      expect(homeStarIndex(c)).toBe(14 * arm)
      expect(preStartIndex(c)).toBe(14 * arm + 6)
      expect(startIndex(c)).toBe(14 * arm + 7)
    })
  })

  it('walks clockwise and wraps from hole 83 to hole 0', () => {
    expect(nextWalk('red', { kind: 'loop', pos: 10 })).toEqual({ kind: 'loop', pos: 11 })
    expect(nextWalk('red', { kind: 'loop', pos: 83 })).toEqual({ kind: 'loop', pos: 0 })
  })

  it('turns into home only from the colour\'s own pre-start', () => {
    expect(nextWalk('red', { kind: 'loop', pos: 6 })).toEqual({ kind: 'home', slot: 0 })
    expect(nextWalk('orange', { kind: 'loop', pos: 6 })).toEqual({ kind: 'loop', pos: 7 })
    expect(nextWalk('orange', { kind: 'loop', pos: 20 })).toEqual({ kind: 'home', slot: 0 })
  })

  it('walks up home to the last slot and no further', () => {
    expect(nextWalk('red', { kind: 'home', slot: 2 })).toEqual({ kind: 'home', slot: 3 })
    expect(nextWalk('red', { kind: 'home', slot: 3 })).toBeNull()
    expect(nextWalk('red', { kind: 'base' })).toBeNull()
    expect(nextWalk('red', { kind: 'center' })).toBeNull()
  })

  it('goes to the next star clockwise, wrapping round', () => {
    expect(nextStar(0)).toBe(14)
    expect(nextStar(70)).toBe(0)
  })

  it('measures steps to home from any hole', () => {
    expect(loopStepsToHome('red', startIndex('red'))).toBe(84)
    expect(loopStepsToHome('red', preStartIndex('red'))).toBe(1)
    expect(loopStepsToHome('red', homeStarIndex('red'))).toBe(7)
    expect(loopStepsToHome('blue', homeStarIndex('blue'))).toBe(7)
    expect(stepsToHome('red', { kind: 'base' })).toBe(BASE_STEPS_TO_HOME)
    expect(stepsToHome('red', { kind: 'home', slot: 3 })).toBe(-3)
  })

  it('counts progress from 0 in base, rising into home', () => {
    expect(progressOf('red', { kind: 'base' })).toBe(0)
    expect(progressOf('red', { kind: 'loop', pos: startIndex('red') })).toBe(1)
    expect(progressOf('red', { kind: 'home', slot: 0 })).toBe(BASE_STEPS_TO_HOME)
  })

  it('gives home holes a private key per colour', () => {
    expect(spotKey('red', { kind: 'home', slot: 1 })).not.toBe(spotKey('blue', { kind: 'home', slot: 1 }))
    expect(spotKey('red', { kind: 'loop', pos: 5 })).toBe(spotKey('blue', { kind: 'loop', pos: 5 }))
  })
})
