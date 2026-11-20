# Star Hop onboarding: start here

This is a self-paced handover guide to the Star Hop codebase. It is written for a developer who is **new to JavaScript, TypeScript, React, Vite, Vercel, test-driven development and game development**, and who wants to reach the point where they can own this project and talk about it confidently in a principal frontend engineer interview.

It is a code walkthrough, a cheatsheet and a handover document in one. Every concept is taught using real lines from this repository, so you learn the language and the project at the same time.

> **Where this fits.** The [advanced study guide](../README.md) (chapters 1 to 15 in `docs/`) assumes you already know React, TypeScript and event sourcing. This onboarding track gets you there. Finish this first, then move on to the advanced chapters.

## What you are taking over

Star Hop is a browser board game for 2 to 6 players: race four marbles round a six-armed star board, take shortcuts across the stars and the centre, and bump opponents back to base. You can play against bots on one device or with friends online. It is live at https://star-hop-game.vercel.app/.

In numbers (November 2026):

| | |
| --- | --- |
| Source code | about 10,000 lines of TypeScript and CSS in `src/` |
| Tests | 324 automated tests in 23 files, all passing (`npm test`) |
| Runtime dependencies | 4: `react`, `react-dom`, `zustand`, `peerjs` |
| Servers you run | none. The site is static files plus one tiny serverless function (`api/turn.ts`) |
| Cost to host | free (Vercel hobby plan, free PeerJS signalling, free TURN relay tier) |

## How to use this guide

1. **Go in order the first time.** Each chapter builds on the previous ones.
2. **Keep the code open next to the guide.** Links like [engine.ts](../../src/game/engine.ts) open the file. Read the code each section names before moving on.
3. **Do the "Try it" boxes.** Change something, watch it break or work, then undo it with `git checkout -- .` (this discards your changes to tracked files).
4. **Answer the "Check yourself" questions out loud** before reading on. If you can't explain it, re-read that section.
5. **Use the [cheatsheet](cheatsheet.md)** whenever you forget a command, a term or where something lives.

## Chapters

| # | Chapter | You will be able to… |
| --- | --- | --- |
| 0 | [Day zero: set up and run it](00-setup.md) | install the tools, run the game, the tests and a production build, and know what each command does |
| 1 | [JavaScript you need, taught from this code](01-javascript.md) | read any line of this project's JavaScript: values, functions, arrays, objects, modules, async, the event loop |
| 2 | [TypeScript you need, taught from this code](02-typescript.md) | read and write the types here: unions, discriminated unions, narrowing, generics, strict compiler settings |
| 3 | [React from zero](03-react.md) | explain components, props, state, effects, refs and custom hooks, and why React works the way it does |
| 4 | [The toolchain: npm, Vite, Vitest, oxlint and Vercel](04-tooling-vite-vercel.md) | explain what happens between saving a file and a player loading the site |
| 5 | [Game development basics](05-game-dev-basics.md) | describe a game as state plus rules plus a loop, and the patterns that make games testable |
| 6 | [A tour of the codebase](06-codebase-tour.md) | find anything, explain the layers, and trace one click from the screen to the rules and back |
| 7 | [Walkthrough: the rules core](07-rules-core-walkthrough.md) | read `types.ts`, `board.ts`, `rules.ts`, `engine.ts` and `history.ts` line by line |
| 8 | [Walkthrough: state, the controller hook and the UI](08-state-and-ui-walkthrough.md) | follow the store, undo and saving, the animation scheduler, and how screens are chosen |
| 9 | [Walkthrough: online play](09-online-walkthrough.md) | explain WebRTC, signalling, TURN, host authority and the transport seam to a beginner and to an interviewer |
| 10 | [Testing and test-driven development](10-testing-and-tdd.md) | write a test first, make it pass, refactor, and pick the right kind of test for a change |
| 11 | [Decisions and trade-offs](11-decisions.md) | defend each technology and design choice, name the alternatives, and say when you would choose differently |
| 12 | [From handover to mastery](12-mastery-and-interviews.md) | follow a graded exercise ladder, make safe changes, debug, and tell this project's story in interviews |
| | [Cheatsheet](cheatsheet.md) | look up commands, "where is X", glossary terms and gotchas |

## A suggested schedule (three weeks, about two hours a day)

| Day | Do | Done when you can… |
| --- | --- | --- |
| 1 | Chapter 0. Play three games: one on a laptop, one on a phone, one online with yourself in two browser windows | run `dev`, `test` and `build` and say what each does |
| 2–3 | Chapter 1 | read [board.ts](../../src/game/board.ts) without looking anything up |
| 4–5 | Chapter 2 | explain `Spot` and why `switch (spot.kind)` needs no `default` |
| 6–7 | Chapter 3 | build a tiny counter component and explain each hook it uses |
| 8 | Chapter 4 | draw the path from `src/main.tsx` to the bytes a phone downloads |
| 9 | Chapter 5 | explain why the board on screen lags behind the real game state |
| 10 | Chapter 6 | trace "click Roll" through every file without notes |
| 11–12 | Chapter 7 | answer: what does `applyAction` return for an illegal move, and why? |
| 13–14 | Chapter 8 | explain undo in terms of the action list |
| 15 | Chapter 9 | explain why a guest can't cheat at dice |
| 16–17 | Chapter 10. Do the worked TDD example for real | write a failing test, make it pass, refactor, all green |
| 18 | Chapter 11 | give a two-minute answer to "why Zustand and not Redux?" |
| 19–21 | Chapter 12. Climb the exercise ladder to at least level 3 | ship one small change with tests, then start the [advanced guide](../README.md) |

## The three ideas to remember

If you remember nothing else, remember these. Every chapter comes back to them.

1. **A game is its starting position plus a list of decisions.** The current state is never edited in place. It is *worked out* by replaying the list. That one idea gives undo, saved games, replays and online play almost for free (chapters 5, 7, 8 and 9).
2. **The rules know nothing about the screen.** `src/game/` has no React, no timers, no browser APIs. That is why 324 tests run in about 30 seconds and why the same rules run on the host, on every guest and inside the bots (chapters 6 and 7).
3. **Make the important data explicit.** A move carries its whole path, so the rules, the animation, the preview, the screen-reader label and the bots all read the same data instead of each re-deriving it (chapter 7).

## A note on reuse

This guide is laid out so the same structure can be written for the Ludo game in `../ludo-game`: setup, language primers, toolchain, game basics, tour, three walkthroughs, testing, decisions, mastery. Chapters 1 to 5, 10 and the cheatsheet are mostly general. Chapters 6 to 9 and 11 are specific to each codebase.
