# 10. Interview preparation

The Ludo guide's [chapter 10](../../ludo-game/docs/10-interview-prep.md) has questions on event sourcing, stale closures, `useSyncExternalStore`, undo, multiplayer authority, WebRTC and testing time. Practise those as well. This chapter adds questions that Star Hop lets you answer from experience, then design prompts in the style of large companies' frontend loops, then stories for behavioural rounds.

Answer out loud, about two minutes each, and always end with a trade-off or a "next step".

## Components and design systems

**Q: Build a modal dialog. What does it need?**
Start with requirements (name, modality, focus in, trap and restore, Esc, backdrop, scroll lock, motion, reduced motion), then the build choice: native `<dialog>` with `showModal()` covers the top layer, inert background, focus and Esc. You add exit animation (wait on `getAnimations()`), a backdrop click that must also *start* on the backdrop, and scroll containment. Point to the gaps in the older `div`-based `ConfirmDialog` as the contrast. ([Chapter 3](03-bottom-sheet.md))

**Q: How do you animate an element out when the platform removes it immediately?**
Delay the removal: mark it as closing, let CSS run the exit animation, wait for the running animations' `finished` promises, then remove it. That handles reduced motion and tests for free (no animations means resolve immediately), and guards the race where it reopens during the exit. Mention `@starting-style` and `transition-behavior: allow-discrete` as the CSS-only future, and why you didn't depend on them yet.

**Q: How do you implement swipe to dismiss?**
Pointer Events with pointer capture, `touch-action: none` on the drag area only, follow the finger with a CSS variable instead of React state, close on distance **or** velocity, snap back on cancel, start the exit animation from the release point, and always offer a button too (WCAG 2.5.1).

**Q: Controlled or uncontrolled for a design-system Sheet?**
Support both: `open` and `onOpenChange` for controlled use, `defaultOpen` for simple cases. Internally, one owner of the truth: every close path calls the callback, and the native element is synced from the prop. Here the game *must* know when the sheet is open (pause, shortcuts), so it is controlled.

**Q: Design a theming system for a component library used by several products.**
Three token layers (palette, semantic, component), CSS custom properties at runtime, light, dark and system via an attribute plus `prefers-color-scheme` (or `light-dark()` with `color-scheme`), derived shades with `color-mix()`, `color-scheme` for native controls, and a blocking script or server-read cookie to avoid the flash. Then governance: who can add tokens, how deprecations work, and visual regression tests per theme. ([Chapter 5](05-theming.md))

## Rendering and the platform

**Q: SVG or Canvas for an interactive diagram?**
Compare: node count and update rate (SVG up to thousands of nodes and modest updates; Canvas for more, or per-frame redraws), hit testing (free in SVG), accessibility (real elements in SVG; a mirrored DOM for Canvas), and theming (CSS for SVG). Star Hop: about 300 nodes, needs focus, keyboard and themes, so SVG. ([Chapter 2](02-svg-and-geometry.md))

**Q: What is a `viewBox`, and what surprised you about it?**
It maps a user coordinate system onto the element's CSS box, so the design scales with no media queries. The surprise: CSS lengths inside it are in user units too. A 0.4px font is readable, and a browser focus ring a few px wide became several board units wide. That was the mobile bug.

**Q: `:focus` versus `:focus-visible`?**
`:focus-visible` is the browser's suggestion of when a ring helps (keyboard use, text inputs). It does not stop the browser drawing its own ring on `:focus`. Remove outlines only where you provide your own indicator, and draw that on `:focus-visible`. ([Chapter 4](04-mobile-and-touch.md))

**Q: How do you detect touch devices?**
Capability queries, not the user agent: `(hover: none) and (pointer: coarse)` for the primary input, `any-pointer` and `any-hover` for any input. Adapt the copy ("Tap" or "Press Space") and hide keyboard hints. Be aware of hybrid devices and whether you react to changes.

**Q: Which new CSS features would you adopt today, and how do you decide?**
Baseline status, cosmetic versus functional impact, your own analytics, and a fallback plan. Examples from here: `:has()` for a scroll lock (cosmetic if missing), `color-mix()` for tints, `dvh` for mobile height, `overscroll-behavior` for scroll chaining. ([Chapter 9](09-tooling-and-platform.md))

## State, data and React

**Q: How do you reset UI state when the underlying data changes, without effects?**
Tag the state with the version it belongs to (`{ seq, marbleId }`) and derive validity during render (`selection.seq === game.actionSeq`). No extra render, no missed cases. Alternatives: a `key` to remount a subtree (Ludo), or lifting the state into the store. ([Chapter 8](08-react-patterns.md))

**Q: When do you bypass React state?**
For per-frame visual values (drag offsets, scroll-linked effects): write CSS custom properties or styles through a ref, and keep React for the outcome. Values read by long-lived callbacks go in refs.

**Q: How do you wrap an imperative API in a declarative component?**
The prop is the truth; an effect compares the widget's actual state with the prop and makes idempotent calls; widget events report back through callbacks; cleanups handle races and unmounting. Applies to dialogs, maps, players and editors.

**Q: How would you persist an app's state across reloads safely?**
Decide scope (`localStorage` or `sessionStorage` per key), version the format, parse defensively, merge flat preferences over defaults key by key, validate structured data (here by replaying actions through the engine), wrap all storage access, and never save what another client owns. Mention migrations, multi-tab conflicts and IndexedDB for larger data. ([Chapter 6](06-persistence.md))

**Q: Your event-sourced state got slow as the log grew. What do you do?**
Apply new events incrementally to the current state (O(1) per append) and keep full replays for load, undo and redo. Add periodic snapshots if those become slow. Keep a test that incremental and full replay agree.

## Domain and algorithms

**Q: Model a board, map or workflow that is a graph.**
Store positions (facts), derive progress (judgements). Give nodes stable keys for maps. Choose value or reference equality deliberately. Generate candidate moves and then filter them. Attach computed paths to moves so every layer reads the same data. Make output ordering a tested contract. Test termination when cycles exist. ([Chapter 1](01-domain-modelling.md))

**Q: When can you add probabilities and when must you multiply?**
"Any of several independent events" is `1 − Π(1 − pᵢ)`. Expected counts add, by linearity of expectation, even for dependent events. State your independence assumption. ([Chapter 7](07-bots-and-probability.md))

**Q: How does memoisation interact with immutability?**
With immutable data, identity implies equality, so a `WeakMap` keyed by the object is a correct, leak-free cache. The bot's reach maps are cached per `players` array this way. Mutation would make the cache silently wrong, and the same reasoning underlies `React.memo`, `useMemo` and selector libraries.

## Design prompts (45 minutes each)

Use this structure: requirements and constraints → API or data model → architecture → the hard parts → accessibility and performance → testing → rollout and metrics.

1. **Design a BottomSheet component for a design system used by 50 product teams** (Atlassian- or Google-style). Cover the API (controlled and uncontrolled, compound parts, snap points), responsive behaviour, focus and stacking with other overlays, gestures, server rendering, theming, documentation, versioning and deprecation, and how you would measure adoption and defects.
2. **Design an interactive seat map for a stadium with 60,000 seats** (ticketing). SVG or Canvas or both (levels of detail), hit testing, real-time availability, keyboard and screen-reader access, mobile pinch-zoom, and the backend contract for holds.
3. **Design the frontend of an online board-game platform** (many games, ranked play). What is shared (action-log store, replay, network, lobby) and what is per game (engine, board, bot)? Where does authority live as you grow from P2P to a room server? How do you save, replay and spectate? (Use Ludo's [chapter 8](../../ludo-game/docs/08-multiplayer-system-design.md) plus this guide's README table.)
4. **Add dark mode to a ten-year-old app with 2,000 hard-coded colours.** Inventory with a codemod, introduce semantic tokens, migrate by surface, add visual regression tests, avoid a flash on load, and get it out without a big-bang release.
5. **A rules or help system for a complex product** (like this Rules sheet, at scale). Where does content come from (CMS or code)? How do you keep numbers in sync with behaviour (read constants, as `RulesContent` does)? Localisation, contextual help, analytics on what people open.

## Stories for behavioural rounds

- **A hard bug:** the mobile "big black circle" ([chapter 4](04-mobile-and-touch.md)). Hypotheses first, reproduction with Playwright and a saved-game fixture, measurement, root cause (focus ring plus SVG user units), a fix that kept keyboard accessibility, plus the design improvement the user asked for.
- **Proving an abstraction:** Ludo's network layer reused nearly unchanged ([README table](README.md#what-carried-over-from-ludo-and-what-that-proves)). Talk about resisting early extraction and letting the second use decide.
- **Choosing the platform over a library:** `<dialog>` instead of a modal library. What you gained (bundle, inertness, focus), what you built yourself (animation, gestures), and when you would switch to a library (snap points, nested sheets, a design-system mandate).
- **Raising the bar safely:** turning on `noUncheckedIndexedAccess` and treating each `!` as a reviewable claim.
- **Product judgement:** pausing the game while the rules are open, but never overriding a player who paused first, and never pausing an online game for everyone.

## "What would you change?" (have an honest list)

- `ConfirmDialog` should use `<dialog>` (Tab trap, inertness) and `useId`.
- The swipe works only from the header; native sheets also drag from content scrolled to the top.
- `BoardBase` re-renders with every animation step; memoise it with a stable `seated` set, after measuring.
- The dark theme tokens are duplicated; `light-dark()` would remove that.
- `persist()` serialises the whole save on every action; debounce it with a flush on `pagehide` if profiling shows a cost.
- No committed end-to-end tests: the Playwright checks used for this feature should run in CI on Chromium and WebKit.
- `viewport-fit=cover` plus safe-area padding across the layout, so the sheet's safe-area padding actually takes effect.

## Practice prompts

1. Explain, in three minutes to a junior engineer, why `.sheet { display: flex }` breaks a closed dialog, and why `.sheet[open]` fixes it.
2. Review [Sheet.tsx](../src/components/Sheet.tsx) as a pull request. Leave three comments: one on correctness, one on API design, one on accessibility.
3. A product manager wants the rules sheet to open automatically for first-time players. Argue for and against, then propose a measurable experiment.
4. Whiteboard the reach computation and its cache. Estimate the work per bot decision with and without the cache for 6 players.
5. You have two weeks to make Star Hop work offline as an installable app. What do you build, in what order, and what is out of scope?
