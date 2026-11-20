# 12. From handover to mastery

**Goal:** make safe changes on your own, debug confidently, climb from beginner tasks to principal-level ones, and tell this project's story well in an interview.

## 12.1 The safe-change checklist

Use this for every change, however small:

1. **Branch.** `git switch -c short-description`. Never work directly on `main`.
2. **Find the layer.** Rule? Store? Controller? Component? Style? ([chapter 6's "where to look" table](06-codebase-tour.md#64-where-to-look-when-you-want-to))
3. **Write or find the test first** (chapter 10). For a bug, reproduce it as a failing test.
4. **Make the change.** Keep it small. Keep pure code pure: no timers, DOM or React in `src/game/`.
5. **Did the state's shape change?** Bump `SAVE_VERSION` with a migration and `PROTOCOL_VERSION` (chapter 8).
6. **Run everything:** `npm test`, `npm run build`, `npm run lint`.
7. **Check by hand** on a laptop and a phone-sized window. For online changes, test with two windows.
8. **Update the words:** the README rules table, the in-game [RulesSheet](../../src/components/RulesSheet.tsx), and any guide chapter that describes the behaviour.
9. **Commit** with a message that explains *why*, then push and open a pull request. Vercel gives you a preview URL to try on a real phone.

## 12.2 Debugging toolkit

| Tool | Use it for |
| --- | --- |
| `console.log` | Quick checks. Remove before committing |
| **DevTools → Sources**, or a `debugger;` statement | Pause in the running app, inspect variables, step line by line |
| **VS Code debugger** with a "JavaScript Debug Terminal" | Run `npm test` in it, and breakpoints in tests and source just work |
| **React DevTools** (browser extension) | See the component tree, props and state; the Profiler shows what re-rendered and why |
| **DevTools → Application → Local Storage** | Inspect or delete the saved game (`star-hop:game`), settings and last setup |
| **DevTools → Network** | Watch chunks load and `/api/turn` calls; throttle to simulate slow networks |
| **DevTools → device toolbar** | Phone sizes and touch emulation |
| **Remote debugging** (Chrome `chrome://inspect` for Android, Safari's Develop menu for iOS) | Debug on a real phone, essential for touch bugs |

**The project's superpower for bugs:** because the game is event sourced, a saved game *is* a reproduction. Copy `star-hop:game` from Local Storage, paste its `initial` and `actions` into a test, call `replay(initial, actions)`, and you're looking at the exact position where the bug happened.

A good debugging method, in five steps: **reproduce** reliably → **narrow** (which layer? use the event log and the action list) → **hypothesise** one cause → **test** the hypothesis (a failing test is ideal) → **fix and keep the test**. The [mobile "big black circle" case study](../04-mobile-and-touch.md) is a complete worked example.

## 12.3 The exercise ladder

Do these in order. Each level assumes the previous ones. Every exercise should end with tests passing and, where it makes sense, a new test.

### Level 1: change and observe (week 1)

1. Change an animation speed in `TIMING`. Play, and run the tests.
2. Change a player colour token in [index.css](../../src/index.css).
3. Change a log message in [describe.ts](../../src/game/describe.ts). Find which test, if any, checks that text.
4. Add a `console.log` to `applyAction` that prints every action. Play a game and read the stream. Remove it.

### Level 2: small features with tests (week 2)

1. Do the TDD worked example in [chapter 10.6](10-testing-and-tdd.md#106-worked-example-tdd-a-small-real-improvement).
2. Add an **M** keyboard shortcut that mutes and unmutes sound. Read how **L** (the log) is wired in the `useShortcuts` call in [GameScreen.tsx](../../src/components/GameScreen.tsx) and copy the pattern, using `updateSettings({ sound: ... })`. Add a UI test, and list the new key in the keyboard help.
3. Add a new bot persona (say, "cautious racer") to `PERSONA_WEIGHTS`. Check [bot.test.ts](../../src/game/bot.test.ts) still shows it beating a random mover.
4. Add a boolean setting (for example "show last-move trail") end to end: `Settings`, `DEFAULT_SETTINGS`, `loadSettings`, the settings sheet, and the board. Note that no save migration is needed for a new setting. Why?

### Level 3: rules and state (week 3)

1. Invent a small house rule (for example "rolling three 1s in a row sends a marble from base"). Write it as an R-numbered row with edge cases, add it to `HouseRules`, implement it in the engine, test every edge case, and run the simulations with it on. Follow [LEARNINGS.md §6](../../LEARNINGS.md#6-checklist-for-adding-any-new-rule).
2. Add a save version 4 migration for a made-up field, with a test that loads a version 1 save through every step.
3. Write a test that replays a real saved game from your browser.

### Level 4: architecture (after the advanced guide)

1. Split `useStarHopGame` into smaller hooks without changing behaviour. The existing tests are your safety net.
2. Add a GitHub Actions workflow that runs lint, type check and tests on every push.
3. Add two Playwright end-to-end tests: a local game turn, and host plus guest in two browser contexts.
4. Add an error boundary around the game screen with a "reload, your game is saved" message.

### Level 5: principal-level design (written, then discussed)

Write a one- or two-page design doc for each. Cover requirements, options, a recommendation, risks and how you'd roll it out:

1. Move online play to a server-authoritative WebSocket relay. What changes, what stays (hint: the `Network` interface), how do you migrate live players, and what does it cost?
2. Extract the shared parts of Star Hop and Ludo into a package: what goes in, how are versions managed, and how do both games adopt it safely?
3. Add spectators and replays shared by link. What does event sourcing give you for free, and what's new?
4. Make the game installable and playable offline (a PWA). What has to change for online play and saved games?

## 12.4 You've taken over the project when you can…

- [ ] explain the three big ideas from the [README](README.md#the-three-ideas-to-remember) without notes;
- [ ] trace a click from `Die.tsx` to `rollWithValue` and back, file by file;
- [ ] explain how undo works in terms of the action list;
- [ ] explain why a guest can't cheat and the host can;
- [ ] add a rule, test first, including the save and protocol version bumps;
- [ ] find and fix a bug using a saved game as the reproduction;
- [ ] deploy a change and test its Vercel preview URL on a phone;
- [ ] defend five of the decisions in [chapter 11](11-decisions.md), including when you'd choose differently.

## 12.5 Next: the advanced guide

You're now ready for the [advanced study guide](../README.md). How this onboarding track maps onto it:

| If you liked… | Go deeper with |
| --- | --- |
| Chapter 2 (TypeScript), chapter 4 (tooling) | [9. Tooling and the modern platform](../09-tooling-and-platform.md) |
| Chapter 3 (React) | [8. React patterns new in this codebase](../08-react-patterns.md) |
| Chapter 5 (game basics), chapter 7 (rules) | [1. Modelling a graph-shaped domain](../01-domain-modelling.md), [7. Probability, bots and memoisation](../07-bots-and-probability.md), [15. House rules](../15-house-rules.md) |
| Chapter 8 (state and UI) | [6. Persistence](../06-persistence.md), [2. SVG and geometry](../02-svg-and-geometry.md), [3. Bottom sheet](../03-bottom-sheet.md), [5. Theming](../05-theming.md), [14. Settings](../14-settings.md) |
| Chapter 9 (online) | [12. Team play and deciding together online](../12-teams.md) |
| Mobile and accessibility | [4. Mobile and touch](../04-mobile-and-touch.md), [11. Touch targets](../11-touch-targets.md) |
| Sound | [13. Sound design with Web Audio](../13-sound.md) |
| Interviews | [10. Interview preparation](../10-interview-prep.md) |

The Ludo game's guide (`../ludo-game/docs/`) covers the shared foundations (event sourcing, the action pipeline, multiplayer system design) from a different angle. Reading both is the best way to see which ideas are general and which are specific to one game.

## 12.6 Telling the story in an interview

### The 30-second pitch

> "Star Hop is a multiplayer browser board game I built and own: React, TypeScript and Vite, deployed on Vercel. The rules are a pure, event-sourced core, so undo, saved games, bots and peer-to-peer online play all reuse one engine. The host's browser is authoritative, so guests can't cheat. It runs for free, with 324 tests. And because it was the second game on that architecture, it proved which abstractions were really reusable."

### The two-minute architecture answer

Draw the layer diagram from [chapter 6](06-codebase-tour.md) (rules → store → controller hook → components, with the network beside the store). Then cover:

1. **Pure core:** rules with no React, timers or DOM, and injected randomness. Same code on host, guests and bots.
2. **Event sourcing:** initial state plus actions. Undo, saves, sync and replays come from one mechanism.
3. **One action pipeline:** decide → announce → animate → record → settle.
4. **Host-authoritative peer-to-peer:** intents in, validated actions out, parsed strictly at the trust boundary; ports and adapters for testability.
5. **One trade-off:** "the host could cheat; for friends that's fine; for strangers I'd move authority to a WebSocket relay, and the transport interface makes that one new adapter."

### Stories with numbers (STAR: situation, task, action, result)

These are real, documented in the repo. Learn the details so you can answer follow-up questions.

| Story | Where it's documented | The numbers |
| --- | --- | --- |
| A focus ring that appeared as a "big black circle" on phones: debugging from a user report to the root cause in SVG units | [advanced ch. 4](../04-mobile-and-touch.md) | a browser focus ring a few px wide became several board units wide inside the `viewBox` |
| Bots slowed down when the dice pool rule multiplied the move count; profiled the worst case and narrowed the search | [LEARNINGS §2](../../LEARNINGS.md#2-what-the-codebase-had-to-learn) | worst-case decision 404 ms → 129 ms, average about 2 ms |
| Teammates bumping each other: kept the traditional rule but made bots and the UI avoid it | [README, Bots](../../README.md#bots) | teammate bumps 22% → 3% of all bumps |
| The layout jumped during turns on phones | [LEARNINGS §5](../../LEARNINGS.md#5-pitfalls-we-hit) | board moved up to 131 px → 0 px, measured through real turns |
| "Do we need a paid relay?" Measured traffic instead of assuming | [LEARNINGS §7](../../LEARNINGS.md#7-hosting-online-play-for-free) | 60 KB–0.75 MB per guest per game; free 500 MB/month covers hundreds of relayed games |
| Reusing Ludo's architecture: what carried over unchanged | [advanced guide README](../README.md#what-carried-over-from-ludo-and-what-that-proves) | transport, invites and ICE identical; multiplayer about 1,200 lines in Ludo cost almost nothing here |
| Requirements changed (house rules): generalised one die to a pool of dice instead of special-casing | [advanced ch. 15](../15-house-rules.md) | one code path; old behaviour became a test of the new code |

### What interviewers listen for at principal level

- **Trade-offs, not answers.** Every choice has a cost; name it, and say when you'd choose differently ([chapter 11](11-decisions.md)).
- **Measurement.** "I measured" beats "I think" (the bot timing, the layout shift, the relay traffic).
- **Leverage.** Decisions that made many later things cheap (the pure core, event sourcing, the transport seam).
- **Self-critique.** Know the gaps (no CI, no browser end-to-end tests, the host can cheat) and the plan to close them.
- **Multiplying others.** This guide itself is evidence: you can make a codebase learnable for the next person.

## Check yourself

1. Recite the safe-change checklist from memory.
2. How would you reproduce a bug a player reports from a saved game?
3. Give the 30-second pitch out loud, with a timer.
4. Pick one story from the table and tell it in STAR form in under two minutes, ending with what you'd do differently.
