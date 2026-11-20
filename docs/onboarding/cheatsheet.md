# Star Hop cheatsheet

One page to come back to. Links go to the chapter that explains each item.

## Commands

| Command | Does |
| --- | --- |
| `npm install` | install dependencies (after cloning or pulling) |
| `npm run dev` | dev server with hot reload. **Doesn't type-check** |
| `npm test` | all tests once |
| `npm run test:watch` | re-run tests on save |
| `npx vitest run path/to/file.test.ts` | one test file |
| `npx vitest run -t "part of a test name"` | tests by name |
| `npm run build` | type-check (`tsc -b`), then production bundle into `dist/` |
| `npm run preview` | serve `dist/` locally |
| `npm run lint` | oxlint |
| `npx tsc -b` | type-check only |
| `git switch -c name` | new branch |
| `git checkout -- .` | throw away uncommitted changes to tracked files |

Before every commit: `npm test && npm run build && npm run lint`.

## Where is…

| Thing | File |
| --- | --- |
| All domain types | [src/game/types.ts](../../src/game/types.ts) |
| Board numbering (84 holes, stars, starts) | [src/game/board.ts](../../src/game/board.ts) |
| Legal moves | [src/game/rules.ts](../../src/game/rules.ts) |
| Turn flow, `applyAction` | [src/game/engine.ts](../../src/game/engine.ts) |
| Replay and undo position | [src/game/history.ts](../../src/game/history.ts) |
| Bots | [src/game/bot.ts](../../src/game/bot.ts) |
| Screen positions of holes | [src/game/layout.ts](../../src/game/layout.ts) |
| Log and screen-reader text | [src/game/describe.ts](../../src/game/describe.ts) |
| Store, saving, settings, undo | [src/store/gameStore.ts](../../src/store/gameStore.ts) |
| Timing, bots' turns, animation | [src/hooks/useStarHopGame.ts](../../src/hooks/useStarHopGame.ts) (`TIMING`) |
| Keyboard shortcuts | `useShortcuts({...})` in [GameScreen.tsx](../../src/components/GameScreen.tsx) |
| Colours | tokens at the top of [src/index.css](../../src/index.css) |
| Network messages | [src/net/protocol.ts](../../src/net/protocol.ts) |
| TURN credentials endpoint | [api/turn.ts](../../api/turn.ts) |
| Test helpers (`place`, `rollAs`, `seeded`) | [src/game/testUtils.ts](../../src/game/testUtils.ts) |
| Rules R1–R24 | [README.md, "Choices we made"](../../README.md#choices-we-made) |

## Board numbers (arm `a`, red = 0 … purple = 5)

| | Formula | Red | Orange | Yellow | Green | Blue | Purple |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home star | `14a` | 0 | 14 | 28 | 42 | 56 | 70 |
| Pre-start (turn into home) | `14a + 6` | 6 | 20 | 34 | 48 | 62 | 76 |
| Start | `14a + 7` | 7 | 21 | 35 | 49 | 63 | 77 |

Stars are every hole where `pos % 14 === 0`. Home slots are 0 (entry) to 3 (deepest). [Chapter 7](07-rules-core-walkthrough.md#72-boardts-numbering-the-board).

## The flow of one action

```
UI callback (roll / pickMarble)  →  perform*  →  submit (host: announce)  →  animate
   →  store.record  →  applyAction (engine)  →  settle  →  re-render  →  scheduler effect
```

[Chapter 6](06-codebase-tour.md#63-trace-what-happens-when-you-click-the-die).

## Key contracts

- `applyAction(state, action) === state` means **the action was illegal** and nothing happened.
- `legalMoves` is ordered: by die, then marble id, then **closest to home first, centre last**. The UI numbers badges in this order.
- A roll **action contains its value**. Replays never re-roll.
- `src/game/` imports nothing from other folders.
- Changing the state's shape → bump `SAVE_VERSION` (with a migration) and `PROTOCOL_VERSION`.
- Anything from the network or storage is `unknown` until parsed.

## Glossary

| Term | Meaning | Chapter |
| --- | --- | --- |
| **Action** | A recorded decision (`roll` with value, `move`, `pass`, `end`, `takeover`). The input to the engine | [5](05-game-dev-basics.md), [7](07-rules-core-walkthrough.md) |
| **Adapter / port** | Port: an interface the core needs (`Network`). Adapter: one implementation of it (`peerNetwork`, `memoryNetwork`) | [9](09-online-walkthrough.md) |
| **actionSeq** | Counter that goes up with every applied action. UI state tagged with it expires automatically | [8](08-state-and-ui-walkthrough.md) |
| **Bump** | Landing on another marble sends it back to its base | README |
| **Bundle / chunk** | The combined, minified JS files Vite produces. Dynamic imports become separate chunks | [4](04-tooling-vite-vercel.md) |
| **Closure** | A function that remembers variables from where it was created | [1](01-javascript.md) |
| **Code splitting** | Loading some code only when needed (PeerJS for online play) | [4](04-tooling-vite-vercel.md) |
| **Comeback dice** | R13: higher odds of a 1 or 6 for a player stuck in base | README |
| **Controller** | `useStarHopGame`: the hook that owns timing and turns clicks into actions | [8](08-state-and-ui-walkthrough.md) |
| **Derived state** | Values computed from the source of truth (the current game from the action list) | [8](08-state-and-ui-walkthrough.md) |
| **Design token** | A named CSS custom property (`--accent`) used instead of raw values | [8](08-state-and-ui-walkthrough.md) |
| **Discriminated union** | A union of object types told apart by a shared field (`kind`, `type`, `t`) | [2](02-typescript.md) |
| **Effect** | `useEffect`: code that runs after render to sync with the outside world | [3](03-react.md) |
| **Event** | What an action caused (`roll`, `bump`, `finish`…). Drives sounds and the log | [5](05-game-dev-basics.md) |
| **Event sourcing** | Storing the initial state plus every action, and deriving the current state | [5](05-game-dev-basics.md) |
| **Fake timers** | Vitest's `vi.useFakeTimers()`: tests move the clock themselves | [10](10-testing-and-tdd.md) |
| **HMR** | Hot module replacement: the dev server swaps changed code into the open page | [4](04-tooling-vite-vercel.md) |
| **Host authority** | The host's browser decides outcomes; guests only send intents | [9](09-online-walkthrough.md) |
| **House rules** | R22–R24, stored in `GameState.rules`, always on in new games | README, [LEARNINGS](../../LEARNINGS.md) |
| **ICE / STUN / TURN** | How WebRTC finds a path: try direct, learn your public address (STUN), or relay (TURN) | [9](09-online-walkthrough.md) |
| **Intent** | A guest's request to the host ("roll", "move marble 2 to hole 40") | [9](09-online-walkthrough.md) |
| **Invariant** | Something that must always be true; checked after every action in simulations | [5](05-game-dev-basics.md), [10](10-testing-and-tdd.md) |
| **jsdom** | A fake browser DOM for tests in Node | [4](04-tooling-vite-vercel.md) |
| **Memoisation** | Remembering results so they aren't recomputed (`useMemo`, `networkRoutes`, the bots' `WeakMap`) | [3](03-react.md), [7](07-rules-core-walkthrough.md) |
| **Migration** | A function that upgrades an old save to the next version | [8](08-state-and-ui-walkthrough.md) |
| **Mock / spy / fake** | Stand-ins in tests: `vi.mock` replaces a module; `vi.fn()` records calls; a fake is a working simple version | [10](10-testing-and-tdd.md) |
| **Narrowing** | TypeScript working out a more specific type after a check | [2](02-typescript.md) |
| **Path** | Every hole a move steps on, ending at its destination | [7](07-rules-core-walkthrough.md) |
| **Persona** | A bot's playing style (balanced, hunter, guardian, racer) | [5](05-game-dev-basics.md) |
| **Phase** | `'roll'`, `'move'` or `'gameOver'`: the state machine's current state | [5](05-game-dev-basics.md) |
| **Pool** | Dice rolled this turn and not yet used (several with R22) | [7](07-rules-core-walkthrough.md) |
| **Props** | A component's inputs from its parent | [3](03-react.md) |
| **Pure function** | Same inputs, same output, no side effects | [5](05-game-dev-basics.md) |
| **Reducer** | `(state, action) → newState`. `applyAction` is one | [7](07-rules-core-walkthrough.md) |
| **Ref** | `useRef`: a value that persists across renders without causing them | [3](03-react.md) |
| **Seeded RNG** | A pseudo-random generator that repeats for the same seed (`seeded(42)`) | [5](05-game-dev-basics.md) |
| **Serverless function** | Code the host runs on demand per request (`api/turn.ts` on Vercel) | [4](04-tooling-vite-vercel.md) |
| **Signalling** | Exchanging connection details before WebRTC connects (PeerJS server) | [9](09-online-walkthrough.md) |
| **Stale closure** | A callback still seeing old values; fixed with refs or `getState()` | [3](03-react.md) |
| **Star hop** | R8: from a star, move star to star, each counting as one step | README |
| **TDD** | Red (failing test) → green (make it pass) → refactor | [10](10-testing-and-tdd.md) |
| **Trust boundary** | Where untrusted data enters (network, storage); parse strictly there | [2](02-typescript.md), [9](09-online-walkthrough.md) |
| **viewBox** | SVG's own coordinate system, scaled to the element's size | [5](05-game-dev-basics.md) |
| **WebRTC** | Browser-to-browser connections; Star Hop uses its data channel | [9](09-online-walkthrough.md) |
| **Zustand** | The small state library behind `useGameStore` and `useOnlineStore` | [3](03-react.md), [8](08-state-and-ui-walkthrough.md) |

## Gotchas

| Gotcha | Remember |
| --- | --- |
| Dev server runs code with type errors | Watch VS Code's Problems panel; run `npm run build` before committing |
| Mutating state (`arr.push`, `obj.x = 1`) | Doesn't re-render, and breaks undo and caches. Always build new objects |
| `sort()` changes the array in place | Copy first: `[...arr].sort(...)` |
| `{a:1} === {a:1}` is false | Objects compare by identity; use `sameSpot` or `toEqual` |
| Reading state inside a timer | Use `useGameStore.getState()`, not a captured variable |
| An old save breaks after a rule change | Delete `star-hop:*` in Local Storage, or write the migration |
| A test's dice restart on every render | Create the rng outside `renderHook(() => ...)` |
| One big `vi.advanceTimersByTime` skips animation steps | Advance in small slices inside `act()` (the `advance` helper) |
| `arr[i]` typed as possibly undefined | That's `noUncheckedIndexedAccess`. Handle it, or use `!` only when certain |
| Secrets in `VITE_*` variables | End up in the public bundle. Server-only secrets must not use that prefix |
| A hook inside an `if` | Breaks React. The linter flags it |
