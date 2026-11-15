# Learnings: house rules, and carrying them to Ludo

Star Hop started as the Ludo game's architecture applied to a harder board (see the Ludo project's `LEARNINGS.md` for that playbook). This file records what Star Hop added on top: team play, three optional house rules, and how each requirement change rippled through the code. The second half is a **porting guide for Ludo**, especially for "roll all your sixes first".

For the deeper explanations, see the study guide: [chapter 12](docs/12-teams.md) (teams) and [chapter 15](docs/15-house-rules.md) (house rules and changing requirements).

## Contents

1. [The house rules, precisely](#1-the-house-rules-precisely)
2. [What the codebase had to learn](#2-what-the-codebase-had-to-learn)
3. [Porting "roll all your sixes first" to Ludo](#3-porting-roll-all-your-sixes-first-to-ludo)
4. [Porting the team rules to Ludo](#4-porting-the-team-rules-to-ludo)
5. [Pitfalls we hit](#5-pitfalls-we-hit)
6. [Checklist for adding any new rule](#6-checklist-for-adding-any-new-rule)

---

## 1. The house rules, precisely

Each rule is written down here with its edge cases, because "how we played as children" always has edge cases nobody said out loud. Four of them were settled by asking before writing code, and the safe-start answer changed the design substantially.

### R22: Roll all your sixes first

- After a 6, roll again **immediately**; keep going until a roll isn't a 6. Nothing moves while rolling.
- Then use the dice **one at a time, in any order, on any marbles**. One die is one move.
- At each step, if any remaining die can move something, you must use one. Dice the order leaves unusable are **lost**, so the order is part of the skill.
- If no die can move after the last roll, the turn passes. **No bonus roll** after using a 6: the bonus rolls already happened.
- A move that brings your last marble home **ends the turn**; leftover dice are lost.
- Team play: a finished player picks the teammate before the first roll, and **every banked die moves that teammate's marbles**. If the teammate gets home mid-turn, the turn ends.

### R23: Walk across the centre (Star Hop only)

- Only for a marble that **starts its turn on a star**.
- Each step moves to a neighbouring hole in the network: the next star clockwise, the centre, or from the centre to any star.
- **No U-turns:** never step straight back to the hole just left. Revisiting is fine (you can even end on your starting star, in effect staying put).
- It may stop on a star and walk the rest of the count down that star's arm, or end in the centre.
- Own marbles block as everywhere else (no jumping, no landing). Opponents are jumped, and bumped if landed on.
- A marble that starts **in** the centre still needs a 1 to leave.

### R24: Safe start holes

- A start hole is safe **only for its owner**.
- Another player may land on it while the owner is there: they **share** the hole, and the owner isn't bumped.
- Nobody ever shares a hole with **their own** marble, so the owner can't bring out a second marble while one sits on start.
- The owner **bringing a marble out of base bumps** whoever is sitting on their start. Sharing only happens when the owner was there first.
- A visitor on someone else's start is not safe: a third player landing there bumps the visitor, and the owner stays.

### Team rule change made at the same time

- The teammate a finished player rolls for is chosen once per turn and **sticks** through bonus rolls (it used to be asked again after every 6).
- **Any finishing move ends the turn**, whether the marbles were the roller's or the teammate's.

## 2. What the codebase had to learn

| Change | Where | Lesson |
| --- | --- | --- |
| House rules are **data in the game state** (`GameState.rules`), set by `createGame` | `types.ts`, `engine.ts`, `gameStore.ts` | Anything that changes what is *legal* must travel with the game: replays, saves, undo and online guests all need it. Settings only choose the defaults for the next game. (Comeback dice is still read from settings at roll time; it only affects the host's dice values, which are recorded, so replays stay exact, but it is an inconsistency worth knowing.) |
| One die became a **pool** (`GameState.pool`, `Move.die`) | `engine.ts`, `rules.ts` | Make the special case the general case with n = 1. Normal play is a pool of one die, so there is one code path, and the old behaviour is a test of the new code |
| Move actions name their die (optional `die`) | `types.ts`, `protocol.ts` | Optional fields keep old logs and old saves replaying. Without it, "marble 2 to hole 40" is ambiguous when two dice can both reach hole 40 |
| A 6-step graph search for crossing the centre | `rules.ts` `networkRoutes` | Memoise on (hole, previous hole, steps left). That is only valid because blocked holes are refused *during* the search, so the reachable set doesn't depend on the path so far. At most 336 states, even though there are thousands of paths |
| "One marble per hole" became "except an owner and one visitor on the owner's start" | `rules.ts` occupancy, `simulation.test.ts` | Relax an invariant **precisely** and keep checking the precise version. Don't delete the check |
| Bots plan the order of their dice | `bot.ts` `chooseBotMove`, `planValue` | A small beam search (best few moves per step, two dice ahead) using the existing scorer. **Measure decision time:** worst case went from 404 ms to 129 ms by narrowing the beam; average is about 2 ms |
| A chosen die in the controller | `useStarHopGame.ts` `dieChoice` | Same pattern as the marble selection: UI state tagged with the action count, so it expires by itself after any action |
| Up to 13 destinations from one roll | `MovePad`, shortcuts | New rules break UI assumptions (digits 1–7, one row of buttons). Look at the extremes, not the typical case |
| Save version 3, protocol version 3 | `gameStore.ts`, `protocol.ts` | Every change to the state's shape is a migration step and a protocol bump. Event sourcing keeps migrations small: only the initial state changes shape |

## 3. Porting "roll all your sixes first" to Ludo

Ludo's engine differs in a few relevant ways: a move is just a token (`applyMove(state, tokenId)`), there is a `sixStreak` for the **three-sixes forfeit**, and safe squares already exist. Steps, in order:

1. **Decide the three-sixes interaction first.** With banking, the third 6 is rolled before anything moves, so "three sixes forfeits the turn" means dropping the whole pool. That is simpler than in normal Ludo (nothing to undo). Keep `sixStreak`; when it hits 3, clear the pool and pass.
2. **State:** add `rules: { rollSixesFirst }` and `pool: number[]` to `GameState`; `createGame(configs, rng, rules)`. Write a save migration (old saves get `rules` all off and `pool: []`) and bump the protocol version.
3. **Moves carry their die:** add `die` to `Move`, and generate legal moves for each distinct die in the pool. Ludo moves are token-only today; with two dice, "token 2" has two possible moves, so the move action must become `{ tokenId, die }` (optional `die` for old logs).
4. **Engine flow** (copy Star Hop's `rollWithValue` and `applyMove`):
   - roll: push to pool; if the rule is on and the roll is a 6, stay in the roll phase;
   - otherwise move phase with moves for every die; none: pass the turn (no bonus);
   - move: remove that die; finishing ends the turn; dice left: recompute, or lose them with a `noMoves`/`unused` event; pool empty: pass (no bonus roll under the rule).
5. **Bots:** reuse Star Hop's `afterPlanStep` / `planValue` beam search around Ludo's `scoreMove`. Keep the beam narrow and time it.
6. **UI:** a dice row (`DicePool.tsx` copies almost as is) showing banked dice while rolling, then selectable dice; the token pick filters by the selected die; a **D** shortcut; prompts that name the die in use. Auto move must not play automatically when the dice differ (order matters).
7. **Tests to copy:** banking, order choice, lost leftovers, finishing mid-pool, no bonus after the pool, team stickiness, replay of a banked turn, and the two-dice brute-force check that the bot starts an optimal plan.

## 4. Porting the team rules to Ludo

Ludo already has partner play conventions. If adding teams there, take from Star Hop: the reserved `team` field, `teams.ts` helpers (`sideOf`, `takesTurns`, `helperTargets`, `moverOf`), the sticky choice, "finishing ends the turn", friendly fire allowed but avoided (`FRIENDLY_FIRE` penalty, measured from 22% to 3% of bumps), and nudges (advice-only, expiring by action count, team-scoped).

## 5. Pitfalls we hit

- **Creating a scripted RNG inside a React render callback** (`renderHook(() => useHook(diceSequence(...)))`) restarts the dice on every render. Create it once outside.
- **Tests that encoded the old team behaviour** failed when the rule changed. Good: rewrite them to state the new rule, don't just update the numbers.
- **A bigger move list slowed the bots.** Exploring every first move with two dice took up to a quarter of a second with 50+ moves; capping the follow-ups fixed it. Profile the worst case, not the average.
- **Assuming one marble per hole** in drawing code: two marbles on a shared start were drawn on top of each other until the board learned to shrink and offset them (as Ludo does with `stackOffset`).
- **Tap snapping aimed at the hole's centre**, not where a shrunken shared marble is drawn.

## 6. Checklist for adding any new rule

1. Write the rule as a numbered row (R-number) with every edge case, and ask about the ones you are guessing.
2. Does it change what is legal? Put its switch in the game state, not only in settings.
3. Does the state's shape change? Save migration and protocol version.
4. Generalise rather than special-case when you can (a pool of one die).
5. Tests: one per edge case, written as the rule's own example; then a seeded simulation with the rule on (games finish, invariants hold, replays are exact).
6. Bots: does the scorer understand it? Measure decision time.
7. UI: try the extremes (most destinations, most dice).
8. Rules sheet, README table, setup text, guide.
