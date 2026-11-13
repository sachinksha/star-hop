/**
 * Move generation: every legal way to use a die roll. Pure functions of the
 * players' marbles; no turn or phase logic (that is engine.ts).
 *
 * The rules (README "Choices we made", R2-R12):
 *  - Base to start on a 1 or a 6.
 *  - Walk clockwise the full count; own pre-start leads into home; exact count
 *    into and inside home.
 *  - Never jump over or land on your own marble. Jump opponents freely; land on
 *    one to bump it back to its base.
 *  - A marble that starts its turn on a star may hop star to star (each star is
 *    one step, round and round if you like), then walk the rest of the count
 *    down the arm of the star it stopped on.
 *  - Centre in: from the star the marble sits on with a 1, or as the last step
 *    of a walk that would leave a star. Not straight after a hop.
 *  - Centre out: with a 1, to any star.
 */
import {
  CENTER_ROLL,
  ENTRY_ROLLS,
  STAR_INDICES,
  isStar,
  nextStar,
  nextWalk,
  sameSpot,
  spotKey,
  startIndex,
  stepsToHome,
} from './board'
import type { Color, Marble, Move, MoveVia, Player, Spot } from './types'

/** Who sits on each hole, keyed by spotKey. Base marbles are left out. */
export type Occupancy = Map<string, { color: Color; marbleId: number }>

export function occupancy(players: Player[]): Occupancy {
  const map: Occupancy = new Map()
  for (const p of players) {
    for (const m of p.marbles) {
      if (m.spot.kind === 'base') continue
      map.set(spotKey(p.color, m.spot), { color: p.color, marbleId: m.id })
    }
  }
  return map
}

/** `n` walking steps from `from`, or null if the walk runs out of holes (overshooting home). */
export function walkPath(color: Color, from: Spot, n: number): Spot[] | null {
  const path: Spot[] = []
  let at = from
  for (let i = 0; i < n; i++) {
    const next = nextWalk(color, at)
    if (!next) return null
    path.push(next)
    at = next
  }
  return path
}

/** Raw candidate routes for one marble, before blocking checks. */
interface Route {
  path: Spot[]
  via: MoveVia
  hops: number
}

function routesFor(color: Color, marble: Marble, dice: number): Route[] {
  const from = marble.spot
  switch (from.kind) {
    case 'base':
      return ENTRY_ROLLS.includes(dice)
        ? [{ path: [{ kind: 'loop', pos: startIndex(color) }], via: 'enter', hops: 0 }]
        : []

    case 'center':
      return dice === CENTER_ROLL
        ? STAR_INDICES.map((pos) => ({ path: [{ kind: 'loop', pos }], via: 'fromCenter', hops: 0 }))
        : []

    case 'home': {
      const path = walkPath(color, from, dice)
      return path ? [{ path, via: 'walk', hops: 0 }] : []
    }

    case 'loop': {
      const routes: Route[] = []
      const walk = walkPath(color, from, dice)
      if (walk) {
        routes.push({ path: walk, via: 'walk', hops: 0 })
        // The hole the last step leaves: the starting hole for a 1, else the
        // second to last hole of the walk. If it is a star, the last step may
        // go into the centre instead (R10).
        const before = dice === 1 ? from : walk[dice - 2]
        if (before && before.kind === 'loop' && isStar(before.pos)) {
          routes.push({ path: [...walk.slice(0, dice - 1), { kind: 'center' }], via: 'toCenter', hops: 0 })
        }
      }
      // Star hops (R8, R9): only from a star the marble started on.
      if (isStar(from.pos)) {
        const stars: Spot[] = []
        let star = from.pos
        for (let h = 1; h <= dice; h++) {
          star = nextStar(star)
          stars.push({ kind: 'loop', pos: star })
          const rest = walkPath(color, { kind: 'loop', pos: star }, dice - h)
          if (rest) routes.push({ path: [...stars, ...rest], via: 'hop', hops: h })
        }
      }
      return routes
    }
  }
}

/**
 * Turns a route into a Move, or null when it is blocked: an own marble on any
 * hole of the path, or a route that ends where it began (a full lap of the stars).
 */
function toMove(occ: Occupancy, player: Player, marble: Marble, route: Route): Move | null {
  const to = route.path[route.path.length - 1]
  if (!to || sameSpot(to, marble.spot)) return null
  let bumped: Move['bumped'] = null
  for (let i = 0; i < route.path.length; i++) {
    const spot = route.path[i]!
    const who = occ.get(spotKey(player.color, spot))
    if (!who) continue
    if (who.color === player.color) {
      if (who.marbleId !== marble.id) return null
      continue
    }
    if (i === route.path.length - 1) bumped = who
  }
  return {
    marbleId: marble.id,
    from: marble.spot,
    to,
    path: route.path,
    via: route.via,
    hops: route.hops,
    bumped,
    reachesHome: to.kind === 'home' && marble.spot.kind !== 'home',
  }
}

/**
 * Sort key for one marble's destinations: closest to home first, the centre
 * always last. The UI numbers destinations 1..N in this order.
 */
function destinationRank(color: Color, to: Spot): number {
  return to.kind === 'center' ? Number.POSITIVE_INFINITY : stepsToHome(color, to)
}

/** Every legal move for one marble, ordered for display. One move per destination. */
export function movesForMarble(players: Player[], player: Player, marble: Marble, dice: number, occ = occupancy(players)): Move[] {
  const byDestination = new Map<string, Move>()
  for (const route of routesFor(player.color, marble, dice)) {
    const move = toMove(occ, player, marble, route)
    if (!move) continue
    const key = spotKey(player.color, move.to)
    if (!byDestination.has(key)) byDestination.set(key, move)
  }
  return [...byDestination.values()].sort(
    (a, b) => destinationRank(player.color, a.to) - destinationRank(player.color, b.to),
  )
}

/** Every legal move for a player with the given die, by marble id then display order. */
export function legalMovesFor(players: Player[], player: Player, dice: number): Move[] {
  const occ = occupancy(players)
  return player.marbles.flatMap((m) => movesForMarble(players, player, m, dice, occ))
}

/**
 * The move to play automatically, or null when the player has a real choice.
 * Automatic when there is one legal move, or when every legal move starts and
 * ends on the same holes (several base marbles that can only enter start), so
 * which marble moves makes no difference. Any choice of destination waits for
 * the player.
 */
export function autoMove(color: Color, legalMoves: Move[]): Move | null {
  const first = legalMoves[0]
  if (!first) return null
  const from = spotKey(color, first.from)
  const to = spotKey(color, first.to)
  const same = legalMoves.every((m) => spotKey(color, m.from) === from && spotKey(color, m.to) === to)
  return same ? first : null
}

/**
 * The players after `color` plays `move`: the marble moves, and a bumped
 * opponent goes back to its base. Turn order, ranks and events are the
 * engine's job; bots use this to look at the board after a candidate move.
 */
export function playersAfterMove(players: Player[], color: Color, move: Move): Player[] {
  return players.map((p) => {
    if (p.color === color) {
      return { ...p, marbles: p.marbles.map((m) => (m.id === move.marbleId ? { ...m, spot: move.to } : m)) }
    }
    if (move.bumped && p.color === move.bumped.color) {
      const victim = move.bumped.marbleId
      return { ...p, marbles: p.marbles.map((m) => (m.id === victim ? { ...m, spot: { kind: 'base' as const } } : m)) }
    }
    return p
  })
}
