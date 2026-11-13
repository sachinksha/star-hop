/**
 * One block per rule in the README's "Choices we made" table. Red sits on arm 0
 * (start 7, pre-start 6, home star 0); blue on arm 4 (start 63).
 */
import { describe, expect, it } from 'vitest'
import { autoMove } from './rules'
import { CENTER, destinations, game, home, loop, place, rollAs } from './testUtils'

describe('R2: entering from base', () => {
  it('enters start on a 1 or a 6 only', () => {
    for (const value of [1, 6]) {
      expect(destinations(rollAs(game(), 'red', value), 0)).toEqual([loop(7)])
    }
    for (const value of [2, 3, 4, 5]) {
      expect(rollAs(game(), 'red', value).legalMoves).toEqual([])
    }
  })

  it('cannot enter while an own marble is on start', () => {
    const g = rollAs(place(game(), 'red', [loop(7)]), 'red', 6)
    expect(destinations(g, 1)).toEqual([])
    expect(destinations(g, 0)).toEqual([loop(13)])
  })

  it('bumps an opponent sitting on start', () => {
    const g = rollAs(place(game(), 'blue', [loop(7)]), 'red', 1)
    expect(g.legalMoves[0]?.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })
})

describe('R3, R4: walking and jumping', () => {
  it('walks the full count clockwise', () => {
    expect(destinations(rollAs(place(game(), 'red', [loop(30)]), 'red', 5), 0)).toEqual([loop(35)])
  })

  it('wraps from hole 83 to hole 0', () => {
    expect(destinations(rollAs(place(game(), 'blue', [loop(82)]), 'blue', 4), 0)).toEqual([loop(2)])
  })

  it('jumps over opponents', () => {
    const g = place(place(game(), 'red', [loop(30)]), 'blue', [loop(32)])
    expect(destinations(rollAs(g, 'red', 4), 0)).toEqual([loop(34)])
  })

  it('never jumps over or lands on an own marble', () => {
    const g = place(game(), 'red', [loop(30), loop(32)])
    const rolled = rollAs(g, 'red', 4)
    expect(destinations(rolled, 0)).toEqual([])
    expect(destinations(rolled, 1)).toEqual([loop(36)])
    expect(destinations(rollAs(g, 'red', 2), 0)).toEqual([])
  })
})

describe('R5: bumping', () => {
  it('never bumps a marble in its base or home', () => {
    // Blue sits in its base (3 marbles) and its home. Red, walking or entering,
    // can never land on either: no move of red's ever bumps one of them.
    let g = place(game(), 'blue', [home(0), home(1), home(2)])
    g = place(g, 'red', [loop(60), loop(62), CENTER])
    for (let value = 1; value <= 6; value++) {
      const bumps = rollAs(g, 'red', value).legalMoves.filter((m) => m.bumped)
      expect(bumps).toEqual([])
    }
  })

  it('bumps on an exact landing, on loop holes and stars', () => {
    const g = place(place(game(), 'red', [loop(30)]), 'blue', [loop(33), loop(42)])
    expect(rollAs(g, 'red', 3).legalMoves[0]?.bumped).toEqual({ color: 'blue', marbleId: 0 })
    expect(rollAs(g, 'red', 2).legalMoves[0]?.bumped).toBeNull()
  })

  it('bumps a marble in the centre', () => {
    const g = place(place(game(), 'red', [loop(12)]), 'blue', [CENTER])
    const toCenter = rollAs(g, 'red', 3).legalMoves.find((m) => m.to.kind === 'center')
    expect(toCenter?.bumped).toEqual({ color: 'blue', marbleId: 0 })
  })
})

describe('R8: star hops', () => {
  it('offers walking, hopping then walking, and stopping on a star', () => {
    // Red on star 14, roll 3: walk to 17; hop 1 then walk 2 (30); hop 2 then
    // walk 1 (43); hop 3 (56). Ordered closest to red's home first.
    const g = rollAs(place(game(), 'red', [loop(14)]), 'red', 3)
    expect(destinations(g, 0)).toEqual([loop(56), loop(43), loop(30), loop(17)])
    const hop2 = g.legalMoves.find((m) => m.hops === 2)
    expect(hop2?.path).toEqual([loop(28), loop(42), loop(43)])
    expect(hop2?.via).toBe('hop')
  })

  it('does not allow a hop from a star passed during a walk', () => {
    const g = rollAs(place(game(), 'red', [loop(12)]), 'red', 4)
    expect(destinations(g, 0)).toEqual([loop(16)])
  })

  it('cannot hop over an own marble on a star', () => {
    const g = rollAs(place(game(), 'red', [loop(14), loop(28)]), 'red', 2)
    expect(destinations(g, 0)).toEqual([loop(16)])
  })

  it('hops over an opponent on a star and bumps one on the last star', () => {
    const g = place(place(game(), 'red', [loop(14)]), 'blue', [loop(28), loop(42)])
    const rolled = rollAs(g, 'red', 2)
    const hop2 = rolled.legalMoves.find((m) => m.hops === 2)
    expect(hop2?.to).toEqual(loop(42))
    expect(hop2?.bumped).toEqual({ color: 'blue', marbleId: 1 })
  })
})

describe('R9: hopping all the way round', () => {
  it('may hop past the home star and keep going', () => {
    // Red on star 70, roll 2: hop over red's home star (0) to star 14.
    const g = rollAs(place(game(), 'red', [loop(70)]), 'red', 2)
    expect(destinations(g, 0)).toEqual([loop(1), loop(72), loop(14)])
  })

  it('does not count a full lap of the stars back to the same star as a move', () => {
    const g = rollAs(place(game(), 'red', [loop(14)]), 'red', 6)
    expect(destinations(g, 0)).not.toContainEqual(loop(14))
    expect(destinations(g, 0)).toHaveLength(6)
  })
})

describe('R10: into the centre', () => {
  it('enters from the star the marble sits on with a 1', () => {
    const g = rollAs(place(game(), 'red', [loop(14)]), 'red', 1)
    expect(destinations(g, 0)).toEqual([loop(28), loop(15), CENTER])
  })

  it('does not enter from the star the marble sits on with more than 1', () => {
    for (const value of [2, 3, 4, 5, 6]) {
      const g = rollAs(place(game(), 'red', [loop(14)]), 'red', value)
      expect(destinations(g, 0)).not.toContainEqual(CENTER)
    }
  })

  it('enters as the last step of a walk that would leave a star', () => {
    // From 12, roll 3: 13, 14 (star), then the centre instead of 15.
    const g = rollAs(place(game(), 'red', [loop(12)]), 'red', 3)
    expect(destinations(g, 0)).toEqual([loop(15), CENTER])
    expect(g.legalMoves[1]?.path).toEqual([loop(13), loop(14), CENTER])
  })

  it('does not enter when the walk passes a star earlier', () => {
    const g = rollAs(place(game(), 'red', [loop(12)]), 'red', 5)
    expect(destinations(g, 0)).toEqual([loop(17)])
  })

  it('cannot enter when an own marble is in the centre', () => {
    const g = rollAs(place(game(), 'red', [loop(12), CENTER]), 'red', 3)
    expect(destinations(g, 0)).toEqual([loop(15)])
  })
})

describe('R11: out of the centre', () => {
  it('leaves with a 1 to any star, the home star first', () => {
    const g = rollAs(place(game(), 'red', [CENTER]), 'red', 1)
    expect(destinations(g, 0)).toEqual([loop(0), loop(70), loop(56), loop(42), loop(28), loop(14)])
    expect(g.legalMoves.filter((m) => m.marbleId === 0).every((m) => m.via === 'fromCenter')).toBe(true)
  })

  it('stays put on any other roll', () => {
    for (const value of [2, 3, 4, 5, 6]) {
      expect(destinations(rollAs(place(game(), 'red', [CENTER]), 'red', value), 0)).toEqual([])
    }
  })

  it('skips stars with an own marble and bumps an opponent', () => {
    const g = place(place(game(), 'red', [CENTER, loop(0)]), 'blue', [loop(70)])
    const rolled = rollAs(g, 'red', 1)
    expect(destinations(rolled, 0)).not.toContainEqual(loop(0))
    expect(rolled.legalMoves.find((m) => m.marbleId === 0 && m.to.kind === 'loop' && m.to.pos === 70)?.bumped).toEqual({
      color: 'blue',
      marbleId: 0,
    })
  })
})

describe('R12: home', () => {
  it('turns into home from the pre-start hole', () => {
    const g = rollAs(place(game(), 'red', [loop(4)]), 'red', 4)
    expect(destinations(g, 0)).toEqual([home(1)])
    expect(g.legalMoves[0]?.reachesHome).toBe(true)
  })

  it('needs an exact count: no overshooting the last home hole', () => {
    expect(destinations(rollAs(place(game(), 'red', [loop(6)]), 'red', 4), 0)).toEqual([home(3)])
    expect(destinations(rollAs(place(game(), 'red', [loop(6)]), 'red', 5), 0)).toEqual([])
  })

  it('moves further up inside home, without jumping own marbles', () => {
    const g = place(game(), 'red', [home(0), home(2)])
    expect(destinations(rollAs(g, 'red', 1), 0)).toEqual([home(1)])
    expect(destinations(rollAs(g, 'red', 3), 0)).toEqual([])
    expect(destinations(rollAs(g, 'red', 1), 1)).toEqual([home(3)])
  })

  it('does not enter another colour\'s home', () => {
    const g = rollAs(place(game(), 'blue', [loop(4)]), 'blue', 4)
    expect(destinations(g, 0)).toEqual([loop(8)])
  })
})

describe('auto moves', () => {
  it('plays automatically when every option is the same (base marbles entering)', () => {
    const g = rollAs(game(), 'red', 6)
    expect(g.legalMoves).toHaveLength(4)
    expect(autoMove('red', g.legalMoves)?.to).toEqual(loop(7))
  })

  it('plays automatically when there is only one move', () => {
    const g = rollAs(place(game(), 'red', [loop(30)]), 'red', 3)
    expect(autoMove('red', g.legalMoves)?.to).toEqual(loop(33))
  })

  it('waits when a marble has a choice of destination', () => {
    const g = rollAs(place(game(), 'red', [loop(12), home(3), home(2), home(1)]), 'red', 3)
    expect(g.legalMoves).toHaveLength(2)
    expect(autoMove('red', g.legalMoves)).toBeNull()
  })

  it('waits when different marbles could move', () => {
    const g = rollAs(place(game(), 'red', [loop(30)]), 'red', 6)
    expect(autoMove('red', g.legalMoves)).toBeNull()
  })

  it('returns null with no moves', () => {
    expect(autoMove('red', [])).toBeNull()
  })
})
