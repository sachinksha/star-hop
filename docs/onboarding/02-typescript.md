# 2. TypeScript you need, taught from this code

**Goal:** read every type in this project, write new ones, and understand why the compiler settings are strict.

## 2.1 What TypeScript is (and isn't)

TypeScript is JavaScript with **type annotations**. A checker (`tsc`) reads the annotations and reports mistakes **before the code runs**. Then the annotations are simply deleted, and what runs in the browser is plain JavaScript.

```ts
function wrap(pos: number): number {    // TypeScript
  return ((pos % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH
}
function wrap(pos) {                    // what the browser receives
  return ((pos % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH
}
```

Consequences worth knowing early:

- **Types don't exist at runtime.** You can't ask "is this value a `Spot`?" while the program runs; you check its fields yourself (section 2.9).
- **Types don't protect you from outside data.** A network message or a saved game is whatever bytes arrived. The project validates those by hand (chapter 9).
- Vite and Vitest only *delete* types, they don't *check* them. Checking happens in VS Code and in `npm run build`.

## 2.2 Basic annotations

```ts
const MAX_NAME_LENGTH = 12                       // inferred: number. No annotation needed
function armOf(color: Color): number { ... }     // parameter and return types
let byColor: Map<string, Reach> | undefined      // a Map, or undefined
const timers = useRef<number[]>([])              // an array of numbers
```

TypeScript **infers** most types. The project annotates function parameters and exported functions' return types, and lets the rest be inferred.

## 2.3 Type aliases and interfaces

Two ways to name a shape. Both are used; they are nearly interchangeable for objects.

```ts
// types.ts
export interface Marble {
  id: number
  spot: Spot
}

export type PlayerKind = 'human' | 'bot'
```

Rule of thumb in this codebase: `interface` for object shapes, `type` for everything else (unions, functions, computed types).

Optional properties use `?`:

```ts
export type PlayerConfig = {
  color: Color
  kind: PlayerKind
  name?: string          // may be missing
  team?: number
  you?: boolean
}
```

## 2.4 Literal and union types

A **literal type** is one exact value. A **union** (`|`) is "one of these":

```ts
export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'
export type Phase = 'roll' | 'move' | 'gameOver'
```

Now `const c: Color = 'pink'` is a compile error, and VS Code autocompletes the six colours. This replaces the "magic strings" bugs common in plain JavaScript.

## 2.5 Discriminated unions: the key pattern of the whole codebase

A marble can be in base, on the loop, in the centre or in home, and each place needs different data. A **discriminated union** models that exactly:

```ts
// types.ts
export type Spot =
  | { kind: 'base' }
  | { kind: 'loop'; pos: number }
  | { kind: 'center' }
  | { kind: 'home'; slot: number }
```

The shared field `kind` is the **discriminant**. It makes impossible states impossible to write: a base marble can't have a `pos`, and a loop marble must have one.

## 2.6 Narrowing and exhaustive switches

When you check the discriminant, TypeScript **narrows** the type inside that branch:

```ts
// board.ts
export function stepsToHome(color: Color, spot: Spot): number {
  switch (spot.kind) {
    case 'base':
      return BASE_STEPS_TO_HOME
    case 'loop':
      return loopStepsToHome(color, spot.pos)   // spot is { kind: 'loop'; pos: number } here
    case 'center':
      return CENTER_STEPS_TO_HOME
    case 'home':
      return -spot.slot                          // spot is { kind: 'home'; slot: number } here
  }
}
```

There is **no `default`**, on purpose. The function promises to return a `number`. If someone adds a fifth kind of `Spot`, this switch no longer covers every case, the function could fall off the end, and `tsc` reports an error at every switch that needs updating. The compiler becomes your to-do list.

The same pattern is used for actions, events and network messages: `GameAction`, `GameEvent`, `GuestMessage` and `HostMessage` are all discriminated on `type` or `t`. Look at `applyAction` in [engine.ts](../../src/game/engine.ts): one `case` per action type.

Other ways to narrow:

```ts
if (!player) throw new Error('No current player')   // after this, player is not undefined
if (typeof value === 'number') ...                  // typeof narrowing
if (Array.isArray(parsed)) ...                      // array narrowing
if (moved?.type === 'move') setLastMove(...)        // discriminant narrowing on an optional
```

## 2.7 Generics: types with parameters

`Map<string, Occupant[]>` is a Map whose keys are strings and whose values are arrays of `Occupant`. The `<...>` part is a **type parameter**. You'll mostly *use* generics rather than write them:

```ts
const seen = new Set<string>()
const reachCache = new WeakMap<Player[], Map<string, Reach>>()
const [selection, setSelection] = useState<{ seq: number; marbleId: number } | null>(null)
export const useGameStore = create<GameStoreState>()(...)
```

## 2.8 Handy built-in utility types

| Type | Means | Example |
| --- | --- | --- |
| `Record<K, V>` | an object with keys `K` and values `V` | `Record<Persona, BotWeights>` in [bot.ts](../../src/game/bot.ts) |
| `Partial<T>` | `T` with every field optional | `updateSettings(patch: Partial<Settings>)` |
| `Pick<T, K>` | only some fields of `T` | `Pick<GameStoreState, 'configs' \| 'initial' \| 'actions' \| 'game'>` |
| `readonly T[]` | an array you promise not to change | `COLORS: readonly Color[]` |
| `keyof T` | the union of `T`'s property names | `keyof HouseRules` is `'rollSixesFirst' \| 'crossCentre' \| 'safeStarts'` |
| `T['field']` | the type of one field | `Move['bumped']` |

A more advanced one, a **mapped type**, appears in [gameStore.ts](../../src/store/gameStore.ts):

```ts
export type ToggleSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]
```

Read it as: "for every setting name `K`, keep `K` if that setting is a boolean, otherwise drop it". The result is `'autoRoll' | 'autoMove' | 'undo' | 'sound'`, which updates by itself when a boolean setting is added. You don't need to write these yet; just recognise them.

## 2.9 `unknown`, type guards and the trust boundary

Data from outside (localStorage, the network) is typed `unknown`: "could be anything, check before use". TypeScript won't let you touch an `unknown` value's fields until you've proved what it is.

```ts
// gameStore.ts: a type guard. The `v is ...` return type teaches TypeScript what a true result means
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const parsed = readJson(SETTINGS_KEY)        // unknown
if (isObject(parsed)) {
  const value = parsed.autoRoll              // allowed now, and still unknown
  if (typeof value === 'boolean') settings.autoRoll = value
}
```

`any` switches checking off entirely. This project doesn't use it. When you see `as SomeType` (a **type assertion**), the code is telling the compiler "trust me"; each one is a place to double-check.

## 2.10 The non-null assertion `!`

```ts
createRoot(document.getElementById('root')!)
const player = players[idx]!
```

`!` says "I know this isn't null or undefined". It is needed often here because of the strict setting `noUncheckedIndexedAccess` (next section): every `array[i]` is typed as "maybe undefined". Use `!` only when you really know; otherwise check and handle the missing case.

## 2.11 `as const`, `import type`, and other small things

```ts
export const TIMING = { ROLL_MS: 600, STEP_MS: 140 } as const   // read-only, exact literal types

import type { Color, Spot } from './types'                      // imports a type only; erased from the output
import { NO_HOUSE_RULES, type Color } from './types'             // a value plus a type in one import
```

`import type` matters because of `verbatimModuleSyntax` (below): the tools strip type imports without having to work out which imports are types.

## 2.12 The compiler settings, and why they're strict

[tsconfig.app.json](../../tsconfig.app.json) checks `src/` (browser code). [tsconfig.node.json](../../tsconfig.node.json) checks `vite.config.ts` and `api/` (code that runs in Node). [tsconfig.json](../../tsconfig.json) just points at both, and `tsc -b` builds both.

| Setting | What it does | Why it's on |
| --- | --- | --- |
| `strict` | Turns on the main safety checks, including `strictNullChecks` (null and undefined must be handled) | The biggest single source of bugs in JavaScript is "cannot read property of undefined" |
| `noUncheckedIndexedAccess` | `arr[i]` and `map[key]` are typed "maybe undefined" | Array indexes can be out of range. This is why you see `!` and `?? []` often ([advanced chapter 9](../09-tooling-and-platform.md) has the full story) |
| `noUnusedLocals`, `noUnusedParameters` | Unused variables are errors | Dead code hides bugs |
| `noFallthroughCasesInSwitch` | A `case` must end with `return` or `break` | Prevents accidental fall-through |
| `verbatimModuleSyntax` | Type-only imports must say `import type` | Lets fast tools strip types file by file |
| `erasableSyntaxOnly` | Bans TypeScript features that generate code (`enum`, `namespace`, parameter properties) | Types must be *deletable*, so any tool (Vite, Node itself) can run the code by stripping them |
| `noEmit` | `tsc` only checks; it never writes JavaScript | Vite does the building |
| `moduleResolution: "bundler"` | Resolves imports the way Vite does | Matches the real build |

This is why the project uses unions of string literals instead of `enum`: `erasableSyntaxOnly` forbids enums, and literal unions are simpler anyway.

The project uses **TypeScript 7**, the native (Go) rewrite of the compiler, which type-checks the whole project several times faster than earlier versions. The language is the same.

## Try it

1. In [types.ts](../../src/game/types.ts), add `| { kind: 'limbo' }` to `Spot`. Run `npx tsc -b`. Count the errors and look at where they are: that's every place that handles spots. Undo with `git checkout -- .`
2. In [board.ts](../../src/game/board.ts), change `export const COLORS: readonly Color[]` to include `'pink'`. What does the compiler say?
3. Hover `ToggleSetting` in VS Code and read the type it works out.

## Check yourself

1. What happens to TypeScript types when the code runs in the browser?
2. Why does `stepsToHome` have no `default` case, and what would adding one cost?
3. When should a value be typed `unknown` instead of a specific type?
4. Why does this project use `'red' | 'blue' | ...` rather than an `enum`?
5. What does `noUncheckedIndexedAccess` change about `players[0]`?
