# Learning frontend engineering from Star Hop

This is the second study guide built on one of these games. The first, in the Ludo project (`../ludo-game/docs/`), teaches the foundations: layered architecture, event sourcing, React hooks as controllers, the action pipeline, utility AI, testing and peer-to-peer multiplayer. Star Hop reuses all of that, so this guide **does not repeat it**. It covers what is new here, and what Star Hop needed that Ludo didn't.

Star Hop has a harder domain than Ludo: a board that is a graph rather than a line, moves that need a destination as well as a piece, six seats, and star shortcuts that can loop forever. It is drawn in SVG, themed with design tokens, saved across refreshes, and has a native-`<dialog>` bottom sheet with swipe to close. It is also written with this generation's toolchain. Each of those topics comes up in principal frontend interviews.

## Before you start

1. Read the Ludo guide's [README](../../ludo-game/docs/README.md) and chapters 1 to 4, or at least skim them. This guide assumes event sourcing and the action pipeline are familiar.
2. Run the game: `npm install && npm run dev`. Play once on a laptop and once on a phone, or with the browser's device emulation. Open the Rules sheet on both.
3. Keep `npm test` running in watch mode (`npm run test:watch`) while you do the exercises.

## Chapters

| # | Chapter | You will learn |
| --- | --- | --- |
| 1 | [Modelling a graph-shaped domain](01-domain-modelling.md) | Value types and identity, keys for maps, paths as first-class data, generate-then-filter, ordering as an API contract, parsing at the trust boundary |
| 2 | [SVG rendering and geometry](02-svg-and-geometry.md) | Coordinate systems, `viewBox` and user units, rotation maths, model versus view transforms, static versus dynamic layers, hit targets, SVG versus Canvas |
| 3 | [Building a bottom sheet](03-bottom-sheet.md) | Native `<dialog>`, the top layer and `inert`, exit animations, pointer-event gestures, scroll containment, safe areas, what libraries add |
| 4 | [Mobile web and touch: a debugging case study](04-mobile-and-touch.md) | The "big black circle" bug from report to fix, `:focus` versus `:focus-visible`, sticky hover, input media queries, target sizes, visual versus DOM order |
| 5 | [Theming with design tokens](05-theming.md) | CSS custom properties as tokens, light, dark and system modes, `color-mix()`, `color-scheme`, avoiding the flash of the wrong theme |
| 6 | [Persistence and schema evolution](06-persistence.md) | Saving an event log, versioning, validating by replay, defensive storage, O(1) appends versus O(n) replays |
| 7 | [Probability, bots and memoisation](07-bots-and-probability.md) | Reach maps from the real move generator, independent events, expected value, `WeakMap` caches keyed by immutable data, reshaping a distribution |
| 8 | [React patterns new in this codebase](08-react-patterns.md) | State that expires on its own, the latest-ref pattern, syncing with imperative widgets, imperative DOM writes for gestures, one-shot animations |
| 9 | [Tooling and the modern platform](09-tooling-and-platform.md) | TypeScript 7, `noUncheckedIndexedAccess`, mapped types, Vite 8, oxlint, dev/prod parity, which new CSS and DOM features are safe to use |
| 10 | [Interview preparation](10-interview-prep.md) | Question bank with answers tied to this code, design-system and system-design prompts, stories to tell |

## A suggested two-week plan

| Days | Focus |
| --- | --- |
| 1 | Chapter 1. Draw the board graph from memory: loop, stars, centre, home branches |
| 2 | Chapter 2. Change `bottom` and the arm angles; explain why the rules never noticed |
| 3–4 | Chapter 3. Rebuild `Sheet.tsx` from an empty file without looking, then compare |
| 5 | Chapter 4. Reproduce the tap bug with the steps in the chapter, then explain it out loud in two minutes |
| 6 | Chapter 5. Add a high-contrast theme using only tokens |
| 7 | Chapter 6. Add a schema migration from save version 1 to 2 |
| 8 | Chapter 7. Measure how much the reach cache saves with a quick benchmark |
| 9 | Chapter 8. Replace the latest-ref pattern with `useEffectEvent` and compare |
| 10 | Chapter 9. Turn off `noUncheckedIndexedAccess` and look at what it was protecting |
| 11–14 | Chapter 10. Mock interviews: the design prompts out loud, time-boxed, then the behavioural stories |

## What carried over from Ludo, and what that proves

Ludo's playbook predicted which files would be reusable. Star Hop tested that prediction:

| File | Change |
| --- | --- |
| [net/transport.ts](../src/net/transport.ts), [net/memoryNetwork.ts](../src/net/memoryNetwork.ts), [net/invite.ts](../src/net/invite.ts), [net/iceServers.ts](../src/net/iceServers.ts), [hooks/useGameClock.ts](../src/hooks/useGameClock.ts) | **Identical** |
| [net/protocol.ts](../src/net/protocol.ts) | Only the move intent: `tokenId` became `marbleId` + `to`, with a new `parseSpot` |
| [net/hostSession.ts](../src/net/hostSession.ts), [net/guestSession.ts](../src/net/guestSession.ts), [net/peerNetwork.ts](../src/net/peerNetwork.ts), [store/onlineStore.ts](../src/store/onlineStore.ts) | A few lines each: storage key names, `!` assertions that the stricter compiler setting `noUncheckedIndexedAccess` demanded ([chapter 9](09-tooling-and-platform.md)), a magic `12` replaced by `MAX_NAME_LENGTH`, and a fix so a guest leaving no longer wipes a saved local game |
| [audio/sfx.ts](../src/audio/sfx.ts) | New sound names; same engine |

Multiplayer, about 1,200 lines in Ludo, cost Star Hop almost nothing, because the network layer only knows "a serialisable action and a reducer". In interviews this is your evidence for a principal-level claim: **an abstraction is proven by its second use, not its first.** Ludo's playbook said "build the second game first, then extract what turned out to be shared", and this table is that extraction list.

## The one idea to remember (this time)

> Make the important data explicit, and let every layer read it.

A move carries its whole **path**. The rules use it for blocking, the animation walks it hole by hole, the board previews it, screen reader labels describe it, and bots score it ([chapter 1](01-domain-modelling.md)). The same idea runs through the rest of the guide: colours as **tokens** ([chapter 5](05-theming.md)), a selection tagged with the **position it belongs to** ([chapter 8](08-react-patterns.md)), and a sheet whose open state lives in **one place** ([chapter 3](03-bottom-sheet.md)).
