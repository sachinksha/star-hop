# 1. Modelling a graph-shaped domain

Ludo's board is a line: a token's state is one number, "steps travelled", and everything is arithmetic on it. Star Hop's board is a **graph**: a loop of 84 holes, six stars you can hop between in circles, a centre linked to every star, and a private home branch per colour. That one change forced better modelling, and the techniques transfer to any UI whose domain is a graph: seat maps, workflow editors, org charts, transit maps, dependency views.

Code: [types.ts](../src/game/types.ts), [board.ts](../src/game/board.ts), [rules.ts](../src/game/rules.ts).

## Position is data; progress is computed

The obvious model, "steps travelled", breaks here. A marble can circle the stars forever (rule R9), so distance travelled says nothing about how close it is to home. Instead a marble stores **where it is**, and progress is a function of that:

```ts
export type Spot =
  | { kind: 'base' }
  | { kind: 'loop'; pos: number }   // 0..83, stars are every 14th hole
  | { kind: 'center' }
  | { kind: 'home'; slot: number }  // 0..3

export function stepsToHome(color: Color, spot: Spot): number { ... }
```

This is the general rule **store facts, derive judgements**. "Where is it" is a fact. "How good is that" is a judgement that can change (the centre's value is a tuned estimate, `CENTER_STEPS_TO_HOME`) without touching saved games or the network protocol.

Interview angle: when an interviewer asks you to model a domain, start by naming which values are **source facts** and which are **derived**. A shopping cart stores line items, not the total. A calendar stores events, not the layout of overlapping boxes.

## Value identity: `sameSpot` and `spotKey`

Two `{ kind: 'loop', pos: 14 }` objects are different references but the same hole. JavaScript gives you no structural equality, so the codebase defines two helpers and uses them everywhere:

- `sameSpot(a, b)`: structural equality, written as an exhaustive `switch`, so adding a fifth kind of spot is a compile error until equality handles it.
- `spotKey(color, spot)`: a **string key** for `Map` and `Set`. Home holes are private, so their key includes the colour (`home:red:2`), while loop holes are shared (`loop:30`). The key encodes the domain rule "two home holes with the same slot are different places".

`occupancy()` turns all the players' marbles into a `Map<spotKey, owner>` once per position, so "who is on this hole?" is an O(1) lookup during move generation.

**Why not compare with `JSON.stringify`?** It depends on key order and is slow. Note also that `Move.from` and `Move.to` are compared with `sameSpot`, but `playMove` in the hook checks `g.legalMoves.includes(move)`, which is **reference** equality on purpose: a badge on the board holds the exact `Move` object from the current position, so a stale badge from an earlier position can never match. Choosing value or reference equality deliberately, per use, is a good thing to say out loud in an interview.

## Moves carry their path

```ts
export interface Move {
  marbleId: number
  from: Spot
  to: Spot
  path: Spot[]   // every hole stepped on, ending with `to`
  via: MoveVia   // 'enter' | 'walk' | 'hop' | 'toCenter' | 'fromCenter'
  hops: number
  bumped: { color: Color; marbleId: number } | null
  reachesHome: boolean
}
```

The path is computed once, in the rules, and then read by everyone:

| Reader | Uses the path to |
| --- | --- |
| [rules.ts](../src/game/rules.ts) `toMove` | Reject a move if any hole on it holds your own marble (R4) |
| [useStarHopGame.ts](../src/hooks/useStarHopGame.ts) `animate` | Step the marble hole by hole, with longer arcs for hops (`isArc`) |
| [Board.tsx](../src/components/Board.tsx) | Draw the dashed preview when a badge is hovered or focused, and the last-move trail |
| [describe.ts](../src/game/describe.ts) | Say "Hop 2 stars, then 4 holes" to screen readers and in the log |
| [bot.ts](../src/game/bot.ts) | Score the destination and the danger there |

Without the path, each of those would re-derive the route and could disagree with the rules. This is the **"make the important data explicit"** idea from the [README](README.md). In product terms: if three teams each re-implement "which items are in stock", they will ship three answers.

## Generate, then filter

`rules.ts` works in two stages:

1. `routesFor(color, marble, dice)` lists **every candidate route** for one marble, ignoring blocking: walk, star hops of 1 to `dice` stars each followed by a walk, into the centre, out of the centre to each star.
2. `toMove(occ, player, marble, route)` turns a route into a `Move` **or rejects it**: own marble on the path, or a full lap of the stars that ends where it began.

Then `movesForMarble` **deduplicates by destination** (two routes can reach the same hole; the player chooses a hole, not a route) and **sorts** for display.

Generate-then-filter keeps each rule in one place. The alternative, checking blocking while walking, mixes geometry with rules and duplicates the walking code across hops, the centre and home. It costs a little efficiency (some candidate routes are thrown away), which does not matter at this size. Know the trade-off: for a search over millions of states you would prune early instead.

## Ordering is an API contract

```ts
function destinationRank(color: Color, to: Spot): number {
  return to.kind === 'center' ? Number.POSITIVE_INFINITY : stepsToHome(color, to)
}
```

Destinations are sorted closest-to-home first, with the centre always last. The UI numbers badges 1, 2, 3 in that order, and keyboard players press those numbers. So the sort order is part of the **public contract** between the rules and the UI, and it is tested ([Board.test.tsx](../src/components/Board.test.tsx): "closest to home first and the centre last").

Lists that users act on by position (keyboard shortcuts, "press 2", screen reader "item 2 of 3") need a **stable, meaningful order**. A `Map` iteration order or a hash set would make "2" mean different things on different turns.

## Choosing a move: marble plus destination

Ludo's move action was `{ tokenId }`. Star Hop's is `{ marbleId, to }`, because a marble on a star or in the centre can have up to seven destinations. That one change touched the action type, the engine (`applyMove` finds the legal move matching both), the network intent, the hook (`selection` state), the board (badges) and the keyboard (two-step digits).

`autoMove` decides when **not** to ask: when every legal move starts and ends on the same holes (for example, several base marbles that can each only enter start), it does not matter which marble moves. Any real choice of destination waits for the player. "Ask only when the answer changes the outcome" is a UX principle worth quoting.

## Parsing at the trust boundary

The network now sends a `Spot` from a guest to the host. [protocol.ts](../src/net/protocol.ts) `parseSpot` validates and **rebuilds** it:

```ts
case 'loop':
  return isInt(raw.pos, 0, LOOP_LENGTH - 1) ? { kind: 'loop', pos: raw.pos } : null
```

It does not just check `raw` and pass it through. It constructs a fresh object with only the known fields, so extra properties (`__proto__`, huge strings) never reach the engine. This is **"parse, don't validate"**: after the boundary, the type system's promise is true. Then the engine applies a second check: the move must match one of `state.legalMoves`, so even a well-formed but illegal hole is ignored.

## Termination is a property you must test

Star hops can circle forever, so "every game ends" is no longer obvious. [simulation.test.ts](../src/game/simulation.test.ts) plays seeded bot-only games for 2 to 6 players and asserts each one finishes, plus random-move games with invariants checked after every action (one marble per hole, ranks unique, legal moves recomputed match the stored ones). When your domain has cycles, add a test that something always makes progress.

## Exercises

1. Add a rule: a marble on the centre is safe from bumps. Which files change? Which tests fail first? (Hint: only `toMove` should need the rule; if you touch the bots, ask why.)
2. Replace `spotKey` strings with numeric ids (0 to 83 for the loop, then centre, then home slots per colour). Benchmark `legalMovesFor` before and after. Was it worth it?
3. Write `parseMove` for a hypothetical "replay upload" feature, where a whole action log arrives from a file. What else must you check beyond each action's shape?
4. Draw the graph: nodes for every hole, edges for walking, hopping and the centre. Which edges are one-way? Which depend on the marble's colour?

## Interview questions this chapter prepares you for

- "Model the state for a seat-booking UI, a kanban board or a node editor." Separate facts from derived values; give entities stable keys; decide value or reference equality on purpose.
- "How would you keep three features consistent that all need the same calculation?" Compute it once, attach it to the data (the path), test it once.
- "What do you do with data from another client?" Parse into fresh objects at the boundary, then validate against the authoritative state.
