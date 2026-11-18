# 15. When requirements change: adding house rules

> **Current state:** the house rules and comeback dice are now always on; the setup switches and the saved settings for them were removed. The engine still takes a `HouseRules` value (new games get `ALL_HOUSE_RULES`, older saved games keep the rules they started with), so everything below about the engine, bots and tests still holds. The parts about setup checkboxes and settings describe the earlier version.

Every codebase meets a request like this one: "here are the rules we actually played as children; add them as options". Three new rules, one change to an existing rule, edge cases nobody had written down. This chapter follows that request through every layer of Star Hop: specification, data model, rules engine, bots, controller hook, UI, persistence and network. Then it draws out what an interviewer wants to hear when they ask "how did your design cope with change?".

The rules themselves are in the README (R22–R24) and in [LEARNINGS.md](../LEARNINGS.md). Code: [rules.ts](../src/game/rules.ts), [engine.ts](../src/game/engine.ts), the planner in [bot.ts](../src/game/bot.ts), [useStarHopGame.ts](../src/hooks/useStarHopGame.ts), [DicePool.tsx](../src/components/DicePool.tsx), tests in [houseRules.test.ts](../src/game/houseRules.test.ts).

## 1. Specify before you build

The request was rich but informal. Before writing code, four questions went back to the person who knew the rules:

| Question | Why it mattered |
| --- | --- |
| If the chosen order leaves a die unusable, is it lost, or must you pick an order that uses as many dice as possible? | The second is backgammon's rule. It changes the engine (search over orders on every move) and the UI (some legal-looking moves become illegal) |
| Can a walk cross the centre more than once? | Decides whether the move generator is a fixed formula or a graph search |
| Can a marble that starts *in* the centre walk out with any roll? | One sentence of the request could be read either way |
| A visitor on your start when you come out: shared, or bumped? | The answer came back as **five precise rules** that replaced the simple "safe for everyone" version |

The last one is the lesson. The person had "second thoughts and remembered a few more details", and the rule that came back was materially different (safe only for the owner, sharing only when the owner was there first, the owner's entry still bumps). Asking cost one round trip; guessing would have cost a rewrite and a confused user. **Requirements live in people's heads until a concrete question pulls them out.**

## 2. Where does a rule live?

Comeback dice (an earlier house rule) is a setting read at roll time. That works because it only changes the host's dice values, and those are recorded in the actions. The new rules change **what is legal**. If they lived only in settings:

- a replay (undo, loading a save) after the player changed the setting would hit illegal actions;
- an online guest's engine, with its own settings, would disagree with the host's.

So the rules became **data in the game state**, fixed at creation:

```ts
interface GameState { ...; rules: HouseRules; pool: number[] }
createGame(configs, rng, settings.houseRules)
```

Settings now only choose the defaults for the *next* game. The principle generalises: **configuration that changes the meaning of recorded events must be recorded with them.** Feature flags in a real product have the same problem: a document created under flag A must keep being interpreted under flag A.

## 3. Generalise instead of special-casing

"Roll all your sixes first" means a turn can hold several dice. The tempting change is a branch: `if (rules.rollSixesFirst) { ...a whole second code path... }`. Instead, **the one-die game became a pool of one die**:

- `GameState.pool: number[]` replaces the single current die (the old `dice` field stays for display).
- Every `Move` carries the `die` it uses, and legal moves are generated per distinct die in the pool.
- The move action gains an optional `die`. Old logs without it still replay, because with one die there is nothing to disambiguate.

Normal play is now just a pool that never grows past one. That gives a strong safety net: **every existing test, written before the pool existed, now tests the new code path.** When the refactor was done, the whole suite passed except one test, and that one encoded a rule that was deliberately changing (section 6).

## 4. A graph search, memoised for the right reason

Crossing the centre turns "star hops" from a formula (hop *h* stars, walk the rest) into a walk on a small graph: six stars in a clockwise ring, each joined to the centre both ways, no U-turns. A roll of 6 has thousands of distinct paths. The search memoises on the state `(hole, previous hole, steps left)`:

```ts
const visit = (at, prev, left, path, crossed) => {
  const key = `${at}|${prev}|${left}`
  if (seen.has(key)) return
  ...
}
```

There are at most 7 × 8 × 6 = 336 states, so it stays tiny. But memoising like this is only **correct** because blocked holes (own marbles) are refused *during* the search. Then the set of places reachable from a state doesn't depend on how you got there. If blocking were checked afterwards on the whole path, as the simpler hop code does, pruning a repeated state could throw away the one path that avoided a blocker. In an interview, saying *why* a memo key is sufficient is worth more than the memo itself.

## 5. Relaxing an invariant, precisely

"At most one marble per hole" was an invariant everywhere: the occupancy map (`Map<key, Occupant>`), the drawing code, the simulation's checks. Safe starts break it in exactly one place. The changes:

- occupancy became `Map<key, Occupant[]>`;
- landing logic picks the victim as "someone not your colour and not safe here", at most one by construction;
- the board draws shared holes smaller and side by side (Ludo's stacked-token trick);
- the simulation check was **rewritten, not deleted**: two marbles may share a hole only when safe starts is on, the hole is a start hole, one of them is its owner, and they are different colours.

Deleting an invariant check because it started failing is how silent bugs get in. Restating it precisely keeps all its protection outside the one sanctioned exception.

## 6. Changing an existing rule

Alongside the house rules, a team rule changed: the teammate a finished player rolls for now sticks for the whole turn, and any finishing move ends the turn ([chapter 12](12-teams.md)). One test failed, by name: "gives the roller another roll after a 6, choosing again". That is the value of tests written as rules in plain words. **A changed requirement shows up as a named broken promise**, not as a mysterious diff, and the fix is to rewrite the promise.

## 7. Bots: from greedy to planning

With one die, a bot scores every legal move and takes the best: greedy, one step. With several dice, order matters. A 3 might clear the way for the 6, or the obvious first move might leave the other die with nothing to do. So the bot now plans:

```ts
// each candidate first move: its score + the best follow-up for the remaining dice
score + planValue(afterPlanStep(state, move), extraDice)
```

`planValue` is a **beam search**: at each step it follows only the best few moves by immediate score. It reuses the existing scorer, so each persona plans in character: a hunter's plan chases bumps, a racer's pushes home. The tests check it against brute force: with two dice, the bot's first move always starts an optimal two-step plan, and in some positions that differs from the greedy pick. Planning matters.

**Then measure.** A benchmark over full six-player games with every house rule on timed each decision:

| Version | Average | Worst |
| --- | --- | --- |
| Every first move followed up, 3 dice ahead | 2.8 ms | 404 ms |
| 12 first moves followed up, at most 2 dice ahead, beam of 3 | 1.9 ms | 129 ms |

The worst case is what matters: a decision runs on the main thread during the bot's 600 ms "thinking" pause, and a phone is several times slower than a laptop. The next step, if needed, is moving bot thinking into a **Web Worker**. The engine is pure functions over plain data, so it runs there unchanged, which is a quiet payoff of keeping the rules core free of React and the DOM.

## 8. Controllers and UI adapt

The hook gained one piece of state, the chosen die. It follows the established pattern exactly:

```ts
const [dieChoice, setDieChoice] = useState<{ seq: number; die: number } | null>(null)
const selectedDie = dieInUse(game, dieChoice) // the choice if still valid, else the first usable die
```

Tagged with the action count, it expires on its own after any move ([chapter 8](08-react-patterns.md)), and an invalid choice falls back to a sensible default during render. No effect is needed. `movesFor`, `pickMarble` and the board's pickable marbles all filter by the selected die, so the rest of the UI didn't need to know about pools at all.

Then the extremes broke the UI's assumptions. A 3 from a star with crossing on offered **13 destinations**. The number keys stopped at 7 and the move buttons were one row. Both were fixed (keys 1–9, wrapping buttons), and the lesson stands: **test UI against the largest case a rule allows, not the typical one.**

## 9. Versions and compatibility

The state's shape changed again, so:

- **save version 3**, with a migration step 2 → 3 (no house rules, empty pool). A version 1 save now walks 1 → 2 → 3, and a test proves it;
- **protocol version 3**, so an old guest and a new host refuse each other clearly rather than misreading moves;
- the optional `die` on moves keeps old action logs valid.

Event sourcing kept this cheap: only the *initial* state changes shape; every action from older versions is still a valid action today.

## What to say in an interview

> "When the requirements changed, the architecture told us where each change went. Rules that change legality became data in the event-sourced state. The single die generalised to a pool of one, so the old tests covered the new path. The one deliberate rule change failed one test by name. We relaxed an invariant precisely instead of deleting it, measured the bots' worst-case decision time and cut it threefold, and versioned the save format and protocol. The most valuable step was asking four questions before writing code: one answer changed a rule completely."

## Exercises

1. Implement the alternative to R22's leftover rule: players must use as many dice as possible (backgammon style). Where does the search go: engine, or move generator? What does it do to the UI?
2. Move bot decisions into a Web Worker. What has to be serialisable? How do you keep tests synchronous?
3. Make comeback dice part of `GameState.rules` too, with a migration. Is it worth it, given replays are already exact?
4. A fourth house rule: "two of your own marbles on one hole form a block nobody can pass". List every invariant, function and test it touches before writing any code.
5. Design question: a document editor whose formatting rules are configurable per workspace. How do old documents keep rendering correctly after a workspace changes its rules?
