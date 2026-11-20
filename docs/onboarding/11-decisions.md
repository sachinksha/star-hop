# 11. Decisions and trade-offs

**Goal:** defend every major choice in this project, name the alternatives, and say when you would choose differently. At principal level, interviewers care less about *what* you picked than about whether you can reason about the trade-off.

Each decision below follows the format of an **architecture decision record** (ADR): context, decision, why, alternatives, and when to revisit. Writing ADRs for your own projects is a habit worth building.

## Language and framework

### TypeScript, in strict mode

- **Why:** the domain is full of shapes that must not be confused (a `Spot` in base has no position; an action must name its die). Discriminated unions and exhaustive switches turn whole classes of runtime bugs into compile errors. Strict flags like `noUncheckedIndexedAccess` catch out-of-range access.
- **Alternatives:** plain JavaScript with JSDoc types; Flow.
- **Revisit when:** never for a codebase this size or larger. For a 50-line script, plain JS is fine.

### React 19

- **Why:** UI = f(state) suits a game whose screen is a pure function of the game state. Huge ecosystem, Testing Library, and it's what most frontend roles use. Its features (`useSyncExternalStore`, StrictMode) are used deliberately here.
- **Alternatives:** Svelte or Solid (smaller output, fine-grained updates), Vue, or no framework at all.
- **Revisit when:** bundle size or per-frame performance becomes the main constraint (for example a real-time action game, where you'd draw on a canvas outside React anyway).

### A single-page app with Vite, no meta-framework

- **Why:** there's no content to index, no per-page data and no server. A static single-page app (SPA) deploys anywhere for free. Vite gives instant dev startup and a small, code-split production build.
- **Alternatives:** Next.js or Remix (server rendering, routing, server functions); Create React App (deprecated); hand-configured webpack.
- **Revisit when:** you need SEO-indexed pages, server-side data, authentication, or many routes. Then a meta-framework earns its complexity.

### No router

- **Why:** five screens chosen from state (setup, lobby, join, game, plus overlays). The only URL that matters is the invite link's fragment, parsed in one function.
- **Alternatives:** React Router, TanStack Router.
- **Revisit when:** screens need shareable URLs, browser back/forward between them, or deep links.

## Architecture

### A pure rules core (functional core, imperative shell)

- **Why:** the rules run in four places (the local game, the online host, every guest's replay, and inside the bots) and must agree exactly. Pure functions with injected randomness make that guaranteed, and make 150 rules tests run in a couple of seconds.
- **Alternatives:** game logic inside components or the store, mixed with timers and effects.
- **Revisit when:** essentially never. This is the decision that made everything else cheap.

### Event sourcing (initial state + action log)

- **Why:** one mechanism gives undo, redo, saved games, online sync, the game log, exact replays and easy bug reproduction. Dice values are recorded in actions, so replays never re-roll.
- **Costs:** replaying long histories is O(n), so the store applies new actions incrementally and replays only for undo and loading. Changing the state's shape needs a save migration and a protocol version bump.
- **Alternatives:** store and mutate a current-state snapshot; snapshots plus diffs.
- **Revisit when:** histories become huge (then add periodic snapshots) or when actions can't be made deterministic.

### A custom hook as the controller

- **Why:** components stay presentational; all timing, automation and orchestration live in `useStarHopGame`, which is tested directly with fake timers. One pipeline (decide → announce → animate → record → settle) for every kind of action.
- **Costs:** the hook is about 700 lines. It's coherent, but it's the largest file to learn.
- **Alternatives:** an explicit state-machine library (XState) for turn and animation phases; logic spread across components; Redux middleware or sagas.
- **Revisit when:** the flow grows more phases. A statechart would make the allowed transitions visible and checkable. Splitting the hook into smaller hooks (scheduler, animation, online bridge) is a reasonable next refactor.

### Zustand for app state

- **Why:** tiny (about 1 KB), no provider wrapping, selectors to limit re-renders, and readable outside React with `getState()` (which timers and tests need constantly). The store holds little: the truth, its derivations and preferences.
- **Alternatives:** React Context with `useReducer` (re-renders every consumer on any change, and awkward outside React); Redux Toolkit (more ceremony, better devtools and conventions for large teams); Jotai/Recoil (atom-based).
- **Revisit when:** many developers share the store and need enforced conventions, middleware and time-travel devtools. Then Redux Toolkit's structure pays for itself.

### Ports and adapters for networking

- **Why:** session logic depends on a three-method `Network`/`Channel` interface. Tests plug in an in-memory network; production plugs in PeerJS. The code was reused from Ludo unchanged.
- **Revisit when:** never; it costs a few dozen lines and buys testability and swappability.

## Rendering and UI

### SVG for the board

- **Why:** about 300 elements, updated only on moves. Each hole and marble is a real element, so clicks, focus, keyboard, screen-reader labels and CSS theming come for free. A `viewBox` makes it resolution-independent.
- **Alternatives:** Canvas 2D or WebGL (faster for thousands of objects or per-frame animation, but you must rebuild hit testing and accessibility yourself); HTML/CSS grid (awkward for a star shape).
- **Revisit when:** element counts reach the thousands or you need 60 fps effects.

### Plain CSS with design tokens, one stylesheet

- **Why:** no build plugin, no runtime cost, and tokens (`--bg`, `--player-red`) make theming a matter of changing variables. The app is small enough for one file.
- **Alternatives:** Tailwind (utility classes, fast for teams, noisier markup); CSS Modules (scoped class names); CSS-in-JS (runtime cost, less favoured with React's newer rendering).
- **Revisit when:** several people edit styles at once and naming collisions start. CSS Modules is the smallest step from here.

### Native `<dialog>` for sheets, instead of a component library

- **Why:** the browser now provides the top layer, focus handling, Esc and an inert background. The project adds only exit animations and swipe-to-close. No dependency.
- **Alternatives:** Radix, Headless UI, React Aria (well tested, cover more edge cases, add weight).
- **Revisit when:** you need many complex widgets (comboboxes, date pickers). Building those accessibly is where libraries really earn their place.

### Sound synthesised with Web Audio, no audio files

- **Why:** zero download, no licensing questions, and themes are just parameters.
- **Costs:** synthesis code is specialised and harder to tweak than swapping an MP3.
- **Revisit when:** you need recorded, realistic sounds or voice.

## Data and platform

### localStorage with versioned migrations, validated by replay

- **Why:** a save is a small JSON object. No accounts, no backend. Migrations keep old saves loading; replay validation rejects corrupt or outdated saves safely.
- **Alternatives:** IndexedDB (bigger data, asynchronous API); a backend with accounts (cross-device saves, at the cost of running a service).
- **Revisit when:** players want their games on several devices, or saves grow beyond a few megabytes.

### Online: peer-to-peer WebRTC, host authoritative, via PeerJS

- **Why:** no game server to run or pay for. Host authority stops guests from cheating at dice or moving out of turn. Free signalling and a free TURN tier cover hobby scale (measured, see [LEARNINGS.md §7](../../LEARNINGS.md#7-hosting-online-play-for-free)).
- **Costs:** the host can cheat; if the host closes the tab the game ends; the free PeerJS server has no uptime guarantee.
- **Alternatives:** a WebSocket relay server (Cloudflare Durable Objects, about 100 lines, documented as the next step in LEARNINGS); a fully server-authoritative game server; a hosted realtime service (Firebase, Supabase, Ably).
- **Revisit when:** strangers play each other (cheating matters), games must survive the host leaving, or you need matchmaking. Then move authority to a server.

### Vercel, with one serverless function

- **Why:** free static hosting from Git, with preview URLs, plus a place to keep the TURN provider's API key off the client.
- **Alternatives:** Netlify or Cloudflare Pages (equivalent); GitHub Pages (static only, couldn't host the function).
- **Revisit when:** the server side grows (rooms, accounts). Then choose a platform with long-lived connections.

## Quality

### Vitest, Testing Library and jsdom; no browser end-to-end tests

- **Why:** fast, uses Vite's pipeline, and Testing Library's role-based queries test accessibility along the way. The pure core means most behaviour is unit-testable.
- **Gap:** nothing runs in a real browser. Layout, real audio, real WebRTC and real touch events are only checked by hand.
- **Alternatives / additions:** Playwright for a few end-to-end smoke tests (start a game, play a turn, host and join in two browser contexts); visual regression snapshots.
- **Revisit when:** next. A handful of Playwright tests is the most valuable missing piece.

### oxlint; no formatter configured

- **Why:** oxlint is very fast and covers the important React and TypeScript rules.
- **Gap:** formatting isn't enforced by a tool, so consistency relies on habit.
- **Revisit when:** a second contributor joins. Add a formatter (Prettier, or a fast alternative such as Biome or oxc's formatter) and run it in CI.

### No CI pipeline in the repository

- **Gap:** tests, type checks and lint run locally and on Vercel's build (type check only), but there's no GitHub Actions workflow running `npm test` on every push or pull request.
- **Revisit when:** next, together with Playwright. A ten-line workflow file would do.

## Product decisions recorded in the code

- **House rules are always on** (the latest commit removed the switches), but they're still stored in `GameState.rules`. So old saves replay under their original rules, and tests can play the base rules. Keeping the *data* while removing the *option* is a cheap way to stay flexible.
- **Dark theme only** (latest commit), with all colours still as tokens, so a light theme could return without touching components.
- **Undo off by default, and never online**: undo changes how a game plays, and online it would need everyone's agreement.
- **Bots get a random persona with ±15% jitter**, so no two bots play identically, and win rates were measured to be roughly fair.

## A short "what I'd change next" list

Being able to critique your own system is a principal-level signal. In order of value:

1. **CI**: a GitHub Actions workflow running lint, type check and tests on every push.
2. **A few Playwright end-to-end tests**, including host and guest in two browser contexts.
3. **Split `useStarHopGame`** into a scheduler hook, an animation hook and an online bridge, keeping the single action pipeline.
4. **A formatter** enforced in CI.
5. **An error boundary** around the game screen, so an unexpected render error shows a recovery screen (with the save intact) instead of a blank page.
6. **A WebSocket relay adapter** if online play outgrows the free tiers or needs to survive the host leaving.

## Check yourself

Practise each out loud, two minutes, ending with a trade-off:

1. "Why Zustand and not Redux?"
2. "Why not Next.js?"
3. "Why SVG and not canvas?"
4. "Why peer-to-peer and not a server? What would make you switch?"
5. "What's the biggest gap in your testing, and how would you close it?"
6. "What would you change if this became a team of five?"
