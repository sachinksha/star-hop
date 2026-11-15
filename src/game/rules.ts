/**
 * Move generation: every legal way to use a die roll. Pure functions of the
 * players' marbles and the game's house rules; no turn or phase logic (that is
 * engine.ts).
 *
 * The rules (README "Choices we made", R2-R12):
 *  - Base to start on a 1 or a 6.
 *  - Walk clockwise the full count; own pre-start leads into home; exact count
 *    into and inside home.
 *  - Never jump over or land on your own marble. Jump opponents freely; land on
 *    one to bump it back to its base. In team play a teammate's marble is
 *    treated the same: landing on it bumps it too (R18), so players avoid it.
 *  - A marble that starts its turn on a star may hop star to star (each star is
 *    one step, round and round if you like), then walk the rest of the count
 *    down the arm of the star it stopped on.
 *  - Centre in: from the star the marble sits on with a 1, or as the last step
 *    of a walk that would leave a star. Not straight after a hop.
 *  - Centre out: with a 1, to any star.
 *
 * House rules (R23, R24), each only when switched on for the game:
 *  - Crossing the centre: a marble that starts its turn on a star walks a
 *    network of stars and the centre: clockwise star to star, star to centre,
 *    centre to any star, never straight back to the hole it just left. It may
 *    stop anywhere in the network (even back where it began), or stop on a
 *    star and walk the rest down that star's arm.
 *  - Safe starts: a start hole is safe for its owner. Another player may land
 *    there and share it; the owner entering from base still bumps a visitor.
 */
import {
  CENTER_ROLL,
  COLORS,
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
import { NO_HOUSE_RULES, type Color, type HouseRules, type Marble, type Move, type MoveVia, type Player, type Spot } from './types'

export interface Occupant {
  color: Color
  marbleId: number
  team: number | null
}

/**
 * Who sits on each hole, keyed by spotKey. Base marbles are left out. Normally
 * one marble per hole; with safe starts (R24) a start hole can hold its owner
 * and one visitor.
 */
export type Occupancy = Map<string, Occupant[]>

export function occupancy(players: Player[]): Occupancy {
  const map: Occupancy = new Map()
  for (const p of players) {
    for (const m of p.marbles) {
      if (m.spot.kind === 'base') continue
      const key = spotKey(p.color, m.spot)
      map.set(key, [...(map.get(key) ?? []), { color: p.color, marbleId: m.id, team: p.team }])
    }
  }
  return map
}

/** The colour whose start hole `spot` is, or null. */
export function startOwner(spot: Spot): Color | null {
  if (spot.kind !== 'loop') return null
  return COLORS.find((c) => startIndex(c) === spot.pos) ?? null
}

/**
 * True when a marble of `color` on `spot` can't be bumped: its own start hole,
 * under the safe-starts house rule. Base and home are never at risk anyway.
 */
export function isSafeFor(color: Color, spot: Spot, rules: HouseRules): boolean {
  return rules.safeStarts && startOwner(spot) === color
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

const CENTER: Spot = { kind: 'center' }
const starSpot = (pos: number): Spot => ({ kind: 'loop', pos })

/**
 * House rule R23: every route through the star network for a marble that
 * starts on a star. A depth-first search over (hole, previous hole, steps
 * left). Own marbles block as anywhere else, so blocked holes are never
 * entered; that makes the reachable set depend only on that state, which is
 * memoised. There are at most 7 holes x 8 previous holes x 6 steps, so the
 * search stays tiny even though the number of distinct paths can run into
 * thousands.
 */
function networkRoutes(color: Color, from: number, dice: number, blocked: (spot: Spot) => boolean): Route[] {
  const routes: Route[] = []
  const seen = new Set<string>()
  // `at` is a star position or -1 for the centre; `prev` likewise, or null at the start.
  const visit = (at: number, prev: number | null, left: number, path: Spot[], crossed: boolean) => {
    const key = `${at}|${prev}|${left}`
    if (seen.has(key)) return
    seen.add(key)
    const here = at === -1 ? CENTER : starSpot(at)
    if (left === 0) {
      if (path.length > 0) routes.push({ path, via: at === -1 ? 'toCenter' : crossed ? 'cross' : 'hop', hops: path.length })
      return
    }
    if (at === -1) {
      // From the centre: to any star except the one just left (no U-turns).
      for (const pos of STAR_INDICES) {
        if (pos === prev || blocked(starSpot(pos))) continue
        visit(pos, -1, left - 1, [...path, starSpot(pos)], true)
      }
      return
    }
    // From a star: walk the rest down this star's arm (after at least one network step;
    // the plain walk from the starting star is generated separately)...
    if (path.length > 0) {
      const rest = walkPath(color, here, left)
      if (rest) routes.push({ path: [...path, ...rest], via: crossed ? 'cross' : 'hop', hops: path.length })
    }
    // ...or on to the next star clockwise...
    const next = nextStar(at)
    if (!blocked(starSpot(next))) visit(next, at, left - 1, [...path, starSpot(next)], crossed)
    // ...or into the centre, unless that is where it just came from.
    if (prev !== -1 && !blocked(CENTER)) visit(-1, at, left - 1, [...path, CENTER], crossed)
  }
  visit(from, null, dice, [], false)
  return routes
}

function routesFor(color: Color, marble: Marble, dice: number, rules: HouseRules, blocked: (spot: Spot) => boolean): Route[] {
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
      if (!isStar(from.pos)) return routes
      if (rules.crossCentre) return [...routes, ...networkRoutes(color, from.pos, dice, blocked)]
      // Star hops (R8, R9): only from a star the marble started on.
      const stars: Spot[] = []
      let star = from.pos
      for (let h = 1; h <= dice; h++) {
        star = nextStar(star)
        stars.push({ kind: 'loop', pos: star })
        const rest = walkPath(color, { kind: 'loop', pos: star }, dice - h)
        if (rest) routes.push({ path: [...stars, ...rest], via: 'hop', hops: h })
      }
      return routes
    }
  }
}

/**
 * Turns a route into a Move, or null when it is blocked: an own marble on any
 * hole of the path, or (without the crossing-the-centre rule) a route that
 * ends where it began, a full lap of the stars. Under R23 coming back to the
 * starting star is allowed, in effect choosing to stay put.
 *
 * Whoever else is on the last hole is bumped, a teammate included (R18),
 * except an owner sitting on their own start hole under safe starts (R24): a
 * visitor then shares the hole with them.
 */
function toMove(occ: Occupancy, player: Player, marble: Marble, route: Route, dice: number, rules: HouseRules): Move | null {
  const to = route.path[route.path.length - 1]
  if (!to) return null
  if (sameSpot(to, marble.spot) && !rules.crossCentre) return null
  let bumped: Move['bumped'] = null
  for (let i = 0; i < route.path.length; i++) {
    const spot = route.path[i]!
    const here = occ.get(spotKey(player.color, spot)) ?? []
    if (here.some((o) => o.color === player.color && o.marbleId !== marble.id)) return null
    if (i < route.path.length - 1) continue
    const victim = here.find((o) => o.color !== player.color && !isSafeFor(o.color, spot, rules))
    if (victim) bumped = { color: victim.color, marbleId: victim.marbleId }
  }
  return {
    die: dice,
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
export function movesForMarble(
  players: Player[],
  player: Player,
  marble: Marble,
  dice: number,
  occ = occupancy(players),
  rules: HouseRules = NO_HOUSE_RULES,
): Move[] {
  const blocked = (spot: Spot) =>
    (occ.get(spotKey(player.color, spot)) ?? []).some((o) => o.color === player.color && o.marbleId !== marble.id)
  const byDestination = new Map<string, Move>()
  for (const route of routesFor(player.color, marble, dice, rules, blocked)) {
    const move = toMove(occ, player, marble, route, dice, rules)
    if (!move) continue
    const key = spotKey(player.color, move.to)
    if (!byDestination.has(key)) byDestination.set(key, move)
  }
  return [...byDestination.values()].sort(
    (a, b) => destinationRank(player.color, a.to) - destinationRank(player.color, b.to),
  )
}

/** Every legal move for a player with the given die, by marble id then display order. */
export function legalMovesFor(players: Player[], player: Player, dice: number, rules: HouseRules = NO_HOUSE_RULES): Move[] {
  const occ = occupancy(players)
  return player.marbles.flatMap((m) => movesForMarble(players, player, m, dice, occ, rules))
}

/** Distinct values in a dice pool, in the order they were rolled. */
export function distinctDice(pool: readonly number[]): number[] {
  return [...new Set(pool)]
}

/** Every legal move for any die in the pool, grouped by die in pool order (R22). */
export function legalMovesForPool(players: Player[], player: Player, pool: readonly number[], rules: HouseRules = NO_HOUSE_RULES): Move[] {
  return distinctDice(pool).flatMap((d) => legalMovesFor(players, player, d, rules))
}

/**
 * The move to play automatically, or null when the player has a real choice.
 * Automatic when there is one legal move, or when every legal move starts and
 * ends on the same holes (several base marbles that can only enter start), so
 * which marble moves makes no difference. Any choice of destination waits for
 * the player, and so does a choice between dice (R22): the order matters.
 */
export function autoMove(color: Color, legalMoves: Move[]): Move | null {
  const first = legalMoves[0]
  if (!first) return null
  const from = spotKey(color, first.from)
  const to = spotKey(color, first.to)
  const same = legalMoves.every((m) => m.die === first.die && spotKey(color, m.from) === from && spotKey(color, m.to) === to)
  return same ? first : null
}

/**
 * The players after `color` plays `move`: the marble moves, and a bumped
 * marble goes back to its base. Turn order, ranks and events are the
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
