# 7. Probability, bots and memoisation

Ludo's [chapter 6](../../ludo-game/docs/06-rules-engine-and-ai.md) introduced utility-based bots: score every legal move with weighted features and pick the best. Star Hop keeps that design and adds three ideas worth learning: **compute reach with the real move generator**, **combine probabilities correctly**, and **memoise by identity on immutable data**. The comeback dice add a fourth: **reshape a distribution without breaking its symmetry**.

Code: [bot.ts](../src/game/bot.ts), comeback section of [engine.ts](../src/game/engine.ts), [bot.test.ts](../src/game/bot.test.ts), [simulation.test.ts](../src/game/simulation.test.ts).

## Reuse the real rules instead of approximating them

A bot needs to know "can an opponent land on this hole next turn?" In Ludo that was arithmetic on a line. In Star Hop, reach includes star hops in any direction round the ring, the centre exit to any star, bumps on start holes, and blocking by an opponent's **own** marbles. Hand-written reach maths would be long and would drift from the rules the first time a rule changed.

So reach is computed by **running the real move generator for every die face**:

```ts
function reachOf(players: Player[], player: Player): Reach {
  ...
  for (const d of DIE_FACES) {
    const landed = new Set(legalMovesFor(players, player, d).map((m) => spotKey(player.color, m.to)))
    for (const key of landed) reach.set(key, (reach.get(key) ?? 0) + 1 / 6)
  }
  ...
}
```

The result maps each hole to the chance (0 to 1) that this player can land there next turn. The `Set` matters: if two marbles can both land on hole 30 with a 4, that is still one die face, so 1/6, not 2/6.

**Principle:** prefer reusing a correct, tested function, even if slower, over writing a fast approximation that can disagree. Optimise only after measuring (and here the cache below made it fast enough).

## Combining probabilities

**Danger:** the chance that **some** opponent can bump a marble on `spot`:

```ts
let safe = 1
for (const p of opponents) safe *= 1 - (reachOf(players, p).get(key) ?? 0)
return 1 - safe
```

That is `1 − Π(1 − pᵢ)`: the complement of "nobody can reach it". Summing the chances would be wrong; three opponents at 50% each would give 150%. The formula assumes the opponents' rolls are **independent**, which is true for dice. Say "independent" out loud in an interview; it is the assumption that makes the product valid.

It also ignores turn order (the next opponent might bump a different marble first, or roll a 6 and move twice). A one-move lookahead accepts that simplification, and the tournament tests below check the result is still good play.

**Attack:** the expected number of opponent marbles this marble could bump next turn:

```ts
for (const d of DIE_FACES)
  for (const move of movesForMarble(players, player, marble, d))
    if (move.bumped) hits.set(victimKey, (hits.get(victimKey) ?? 0) + 1 / 6)
let total = 0
for (const chance of hits.values()) total += chance
```

**Expected value is additive** even when events are not independent (linearity of expectation), so summing per-victim chances is correct here, unlike for danger. Knowing **when you may add and when you must multiply** is the probability idea interviewers probe most.

**Stake:** losing a marble costs more the further it has travelled: `12 + 0.6 × progress`. Danger is then weighted as `risk × stake`, an expected loss. Moving a threatened marble away earns credit for the risk it escapes. This is ordinary decision-theory scoring: expected gain minus expected loss.

## Memoise by identity: `WeakMap` keyed by immutable arrays

Scoring one move asks for reach maps of every opponent, before and after the move, and a bot scores up to about 20 moves. Without caching that is hundreds of full move generations per decision. The cache:

```ts
const reachCache = new WeakMap<Player[], Map<Color, Reach>>()
```

Why this works:

- Game states are **immutable**. A given `players` array never changes after it is created, so a result computed for that array stays valid forever. **Identity implies equality.**
- Every candidate move shares the **same** "before" `players` array, so opponents' reach is computed once per decision, not once per move.
- `WeakMap` keys don't keep their objects alive. When a position is no longer referenced, its cache entry can be garbage collected. No eviction policy and no memory leak.

This is the same reason React and Redux push immutable updates: cheap identity checks (`Object.is`, `useMemo` dependencies, `React.memo`, reselect) are only correct when data is never mutated in place. Mutating a `players` array here would silently serve stale reach maps. That would be a nasty bug, which is why immutability here is a correctness requirement, not just style.

## Personas, jitter and noise

Four personas weight the same features differently (hunter: high `bump` and `attack`; guardian: high `danger`, negative `center`; racer: high `home`, `progress` and `lead`). Each game, every weight is nudged by up to ±15%, and each move score gets a small random `noise`. So two hunters play differently, and the same bot differs from game to game.

The profile is created with the game's `rng` **inside `createGame`**, so it is part of the initial state. Replays, undo and online guests all see the same bot personalities, with no extra protocol. When a bot takes over a seat online, its profile travels **in the action** (`{ type: 'takeover', bot }`) for the same reason. Ludo's rule applies: randomness lives in the recorded data.

## Measuring "good" and "fair"

[bot.test.ts](../src/game/bot.test.ts) answers two different questions with seeded simulations:

- **Is each persona competent?** Each beats a random mover in at least 75% of 2-player games.
- **Are the personas balanced against each other?** In bot-only tournaments each wins near its fair share (40–57% with 2 players, 18–39% with 4).

Separating "strong" from "fair" is good practice for any ranking or recommendation system too: one metric for quality, another for bias.

## Comeback dice: reshape a distribution, keep its symmetry

House rule R13: a player with nothing on the board who has missed three entry rolls (a 1 or a 6) in a row gets a growing chance of an entry roll, +8% per further miss, capped at 60% (fair is 2/6 ≈ 33%).

```ts
export function rollFor(state: GameState, rng: Rng, comeback: boolean): number {
  const p = entryChance(player, comeback)
  if (p === BASE_ENTRY_CHANCE) return rollDie(rng)       // fair odds: an ordinary die
  const u = rng()
  if (u < p) return u < p / 2 ? 1 : 6                    // entry roll with chance p, 1 and 6 equally likely
  return Math.min(5, Math.floor(((u - p) / (1 - p)) * 4) + 2)   // otherwise 2..5, equally likely
}
```

One uniform number `u` is split into two regions. Inside each region it is **rescaled** to pick uniformly among the faces there. The result: the boost changes **only** the chance of entering, never the balance between 1 and 6 or among 2 to 5. A 1 and a 6 do different things (a 6 also gives another roll), so a careless boost that only produced sixes would also hand out extra rolls.

Product points that make this a good interview story (Ludo's guide discusses "the dice feel rigged"):

- It is **disclosed** (setup screen, rules sheet with the live on/off tag) and **on for bots too**, so it is fair.
- The **roll value is still recorded** in the action. Replays don't need to know about the boost at all; only the moment of rolling does.
- Numbers come from named constants (`COMEBACK_GRACE`, `COMEBACK_STEP`, `COMEBACK_CAP`), and the rules sheet reads those same constants, so the explanation can't drift from the behaviour.

## Randomness sources

- `secureRandom` uses `crypto.getRandomValues` (dividing a `Uint32` by 2³²). `Math.random` would be fine statistically for a game; the crypto source avoids predictable sequences and costs nothing.
- Tests use `seeded(seed)`, a small mulberry32 PRNG in [testUtils.ts](../src/game/testUtils.ts), so a failing simulation can be replayed exactly by its seed.
- `rollDie` clamps with `Math.min(6, ...)` as a guard against an RNG that returns exactly 1. Defensive code at the edge of an injected dependency.

## Exercises

1. Benchmark `chooseBotMove` on a busy 6-player position with and without `reachCache`. Report the speed-up and explain it in one sentence.
2. Replace the independence product with a simulation: sample 10,000 opponent roll combinations and count bumps. How close is the formula? When would it be badly wrong?
3. Add a fifth persona, "Trickster", that loves the centre. Tune it with the tournament test until it wins a fair share. What did you change, and why?
4. Prove (or test with a chi-squared check) that `rollFor` with `p = 0.5` gives 1 and 6 at 25% each and 2 to 5 at 12.5% each.
5. Design question: you are asked to make bots "feel human". Which signals would you add (hesitation time, occasional mistakes), and how would you measure that players prefer it?
