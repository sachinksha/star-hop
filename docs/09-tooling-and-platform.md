# 9. Tooling and the modern platform

Principal engineers are expected to have opinions about the toolchain and the platform: what is new, what it costs, when it is safe to adopt, and how to roll it out across many teams. Star Hop uses this generation's tools and several recent CSS and DOM features, so it gives you concrete examples to talk about.

## The toolchain

| Tool | Version here | What is notable |
| --- | --- | --- |
| TypeScript | 7.0 | The compiler rewritten in Go (the "native port"). Same language, roughly 10× faster type checks and builds, and a faster editor experience. `npm run build` runs `tsc -b`, then Vite |
| Vite | 8 | Bundles with **Rolldown** (Rust) in place of the previous esbuild-for-dev, Rollup-for-build split, so development and production use one bundler |
| Vitest | 5 | Shares Vite's config and transforms, so tests see the same module graph as the app |
| oxlint | 1.x | A Rust linter, very fast, with the rules this project needs (`react/rules-of-hooks`, `only-export-components`) |
| React | 19 | Includes `useEffectEvent`, `useId`, `useSyncExternalStore` (all used or discussed in this guide) |
| Zustand, PeerJS | 5, 1.5 | The only runtime dependencies besides React |

**The trend to name in interviews:** JavaScript tooling is moving to native languages (Go, Rust): esbuild, SWC, Turbopack, Rolldown, Biome, oxc, and now the TypeScript compiler itself. The benefit is speed, which in a large monorepo means CI minutes, editor responsiveness and developer time. The costs: plugins written in JavaScript need new APIs or run slower across the language boundary, rule sets are less complete than ESLint's long tail, and debugging the tool itself needs different skills. A principal-level answer frames adoption as a **migration plan**: measure the gain on your own repo, run old and new side by side, find the gaps (custom lint rules, Babel plugins), and roll out per package.

## Compiler settings that changed real code

From [tsconfig.app.json](../tsconfig.app.json):

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"erasableSyntaxOnly": true,
"verbatimModuleSyntax": true,
"noFallthroughCasesInSwitch": true
```

### `noUncheckedIndexedAccess`

The Ludo guide listed this as a "would change" item. Star Hop turned it on. With it, `arr[i]` has type `T | undefined`, and `record[key]` too, because an index can always be out of range:

```ts
const player = state.players[state.currentIndex]   // Player | undefined
if (!player) throw new Error('No current player')   // engine.ts: current()
```

The [README's reuse table](README.md#what-carried-over-from-ludo-and-what-that-proves) shows its effect: most of the lines that changed in the copied network files were `!` assertions this flag demanded, such as `names[i]!`. Each `!` is a small claim, "I know this index exists", that a reviewer can question. Without the flag those claims were silent. Prefer narrowing (`if (!x) ...`) where a missing value is possible, and `!` only where an invariant guarantees it (an index from `findIndex` you just checked, a constant table).

Rolling this out on a large codebase is a classic principal task: enable it per package, fix with codemods where the pattern is mechanical, and track the remaining count down to zero.

### `erasableSyntaxOnly`

This forbids TypeScript features that generate JavaScript (`enum`, `namespace`, constructor parameter properties). What remains is "JavaScript plus erasable types", which Node can run directly by stripping types, and which any fast transpiler can handle without type information. That is why the code uses union types and `as const` objects instead of enums.

### `verbatimModuleSyntax`

Type-only imports must say so (`import type { Move } ...`, or `import { type Spot }`), so the bundler can delete them without guessing. This prevents both accidental side-effect imports and "import elided" bugs.

## A mapped type worth reading

```ts
export type ToggleSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]
// = 'autoRoll' | 'autoMove' | 'comebackDice' | 'sound'   (not 'theme')
```

Read it in three steps: map each key to itself if its value is boolean, else to `never`; then index the result by all keys to get a union; the `never` members disappear. `SwitchRow` in the Settings sheet takes a `ToggleSetting`, so the compiler stops anyone rendering an on/off switch for the three-valued `theme` or the 0-to-1 `volume`. Add a boolean setting and it becomes switchable automatically. Being able to read and write a type like this in an interview signals real TypeScript depth.

## Dev/prod parity: one function, two hosts

The TURN relay endpoint (`/api/turn`) is a Vercel serverless function in production. In [vite.config.ts](../vite.config.ts), a tiny plugin serves the **same code** during `npm run dev` and `npm run preview`:

```ts
function turnApi(env: TurnEnv): Plugin {
  const handler = (req, res, next) => { ... iceServersFromEnv(env).then(...) }
  return {
    name: 'turn-api',
    configureServer: (server) => void server.middlewares.use('/api/turn', handler),
    configurePreviewServer: (server) => void server.middlewares.use('/api/turn', handler),
  }
}
```

`loadEnv(mode, cwd, 'TURN_')` reads only `TURN_*` variables, and only on the server side. They don't start with `VITE_`, so they are never inlined into the client bundle. That is the backend-for-frontend idea from Ludo's [chapter 8](../../ludo-game/docs/08-multiplayer-system-design.md), with local development that needs no extra CLI.

## Code splitting where it pays

PeerJS (about 115 KB of the build) is loaded only when someone hosts or joins:

```ts
if (!network) network = (await import('../net/peerNetwork')).peerNetwork      // onlineStore.ts
const [{ Peer }, iceServers] = await Promise.all([import('peerjs'), loadIceServers()])
```

Local players never download it. The second line also **parallelises** the library download with the ICE server fetch. Split by **feature boundary and usage**, not by file. A route or feature most users never touch is the best candidate.

## Modern platform features used here

| Feature | Where | Why | Fallback if unsupported |
| --- | --- | --- | --- |
| `<dialog>` + `showModal()` | [Sheet.tsx](../src/components/Sheet.tsx) | Top layer, inert background, focus handling, Esc | Feature-detected; the `open` attribute is used in jsdom |
| `element.getAnimations()` | Sheet exit | Wait for the animations actually running | Treated as "nothing to wait for": closes at once |
| `:has()` | Scroll lock `html:has(.sheet[open])` | Parent styling from child state, in CSS only | The page behind can scroll (cosmetic) |
| `color-mix()` | Arm and hole tints | Derive shades from one colour and the theme | Older browsers fall back to the browser's default fill (would need static colours) |
| `dvh` units | Body, board, sheet | Follow the mobile address bar | None today; a `vh` declaration just before each one would cover old browsers |
| `overscroll-behavior` | Sheet body | No scroll chaining or pull-to-refresh | Page may scroll at the ends |
| `transform-box: fill-box` | Marble ping | Scale around the shape's own centre | Scales from the wrong origin |
| `env(safe-area-inset-*)` | Sheet bottom padding | Home indicator clearance | Second argument `0px` |
| Pointer Events, pointer capture | Sheet swipe | One input model for touch, mouse and pen | Universal now |
| `crypto.getRandomValues` | Dice | Unpredictable randomness | `Math.random` |
| `matchMedia` input queries | `IS_TOUCH` | Capability detection | Treated as non-touch |
| `:has()` on form state | Segmented controls in Settings: `.segment:has(input:checked)` | Style a label from its native radio, so the control stays a real radio group | Selected option not highlighted (still works) |
| Web Audio synthesis, `OfflineAudioContext` | [src/audio/](../src/audio/) | Every sound theme generated in code; offline rendering to measure loudness | Silent game |
| `DOMPoint` + `getScreenCTM()` | Tap snapping in [Board.tsx](../src/components/Board.tsx) | Turn a tap's screen position into board units | Taps must land on a piece |

How to judge "is it safe to use?":

- Check **Baseline** status (on MDN and web.dev): "newly available" means every major engine supports it; "widely available" means 30 months later. Many teams adopt at "widely", or at "newly" with a fallback.
- Decide whether a missing feature is **cosmetic** (scroll lock, a mixed tint) or **functional** (the dialog opening at all). Functional gaps need detection and a fallback; cosmetic ones may not.
- Remember your real users: analytics on browser versions beat any global statistic. An Indian mobile-first audience (Flipkart) and an enterprise desktop audience (Atlassian) have very different long tails.

## Exercises

1. Time `npx tsc -b --force` here, then install TypeScript 5.x and time it again. Report the speed-up honestly, including how many files are involved.
2. Turn `noUncheckedIndexedAccess` off and count the `!` assertions that become unnecessary. For three of them, argue whether the invariant really holds.
3. Write `type NumberKeys<T>` (the keys of `T` whose values are numbers) and use it somewhere real.
4. Add a CSS fallback for `color-mix()` using `@supports not (color: color-mix(in srgb, red, blue))`. Is it worth the bytes for this audience?
5. Write a one-page migration plan to move a 200-package monorepo from ESLint to oxlint. What do you measure, what blocks you, how do you roll back?
