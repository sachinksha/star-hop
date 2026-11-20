# 1. JavaScript you need, taught from this code

**Goal:** read any line of JavaScript in this project. Every example below is copied from the repository (sometimes shortened), so once you know it here, you will recognise it there.

TypeScript (chapter 2) is JavaScript plus type annotations. Strip the types away and what is left is the JavaScript in this chapter. To keep things simple, the examples below already have their types removed.

> **How to practise:** open the browser DevTools console (F12 → Console) and type the examples in. Or create a scratch file `scratch.mjs` outside the project and run it with `node scratch.mjs`.

## 1.1 Values and variables

```js
const LOOP_LENGTH = 84          // const: the name can't be pointed at another value
let at = from                   // let: the name can be reassigned later
at = next
```

The project uses `const` almost everywhere and `let` only when a loop variable really changes. `var` is never used (it is the old, confusing form).

The value types you'll see:

| Type | Example from the code | Note |
| --- | --- | --- |
| number | `84`, `0.08`, `4294967296` | One number type for integers and decimals |
| string | `'red'`, `` `loop:${pos}` `` | Backticks make a **template literal**: `${...}` inserts a value |
| boolean | `true`, `false` | |
| null | `finishRank: null` | "Deliberately nothing" |
| undefined | a missing property, or a function with no `return` | "Not set" |
| object | `{ kind: 'loop', pos: 7 }` | Named properties |
| array | `['red', 'orange', 'yellow']` | An ordered list (actually a special object) |
| function | `(pos) => pos % 14 === 0` | Functions are values too: you can store them and pass them around |

**Equality:** always `===` and `!==` (strict). `==` converts types first (`0 == ''` is true) and is avoided.

**Truthy and falsy:** in an `if`, the values `false`, `0`, `''`, `null`, `undefined` and `NaN` count as false; everything else counts as true. So `if (!next) return null` means "if there is no next hole".

## 1.2 Functions

Two ways to write a function, both used here:

```js
// A function declaration (board.ts)
function wrap(pos) {
  return ((pos % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH
}

// An arrow function stored in a constant (rules.ts)
const starSpot = (pos) => ({ kind: 'loop', pos })
```

Arrow functions with no braces return their expression. `({ ... })` has parentheses so the braces mean "an object", not "a function body".

**Default parameters:** `function createGame(configs, rng = secureRandom, rules = NO_HOUSE_RULES)`. If the caller leaves `rng` out, `secureRandom` is used. Tests pass their own `rng` to make dice predictable. You'll see this trick, called **dependency injection**, all over the project.

**Functions as arguments:** `players.find((p) => p.color === color)` passes a small function to `find`. This is how almost all array work is done (next section).

## 1.3 Arrays: the methods you'll see everywhere

The project almost never writes `for (let i = 0; ...)`. It uses array methods that take a function:

| Method | Returns | Example from the code |
| --- | --- | --- |
| `map(fn)` | a new array, each item transformed | `players.map((p) => p.color)` |
| `filter(fn)` | a new array of the items where `fn` is true | `player.marbles.filter((m) => m.spot.kind === 'home')` |
| `find(fn)` | the first matching item, or `undefined` | `state.players.find((p) => p.color === color)` |
| `findIndex(fn)` | its index, or `-1` | `configs.findIndex((c) => c.you)` |
| `some(fn)` | true if **any** item matches | `configs.some((c) => c.kind === 'human')` |
| `every(fn)` | true if **all** items match | `moved.marbles.every((m) => m.spot.kind === 'home')` |
| `reduce(fn, start)` | one value built up from all items | `marbles.reduce((sum, m) => sum + progressOf(color, m.spot), 0)` |
| `flatMap(fn)` | like `map`, then flattens one level | `player.marbles.flatMap((m) => movesForMarble(...))` |
| `includes(x)` | true if `x` is in the array | `ENTRY_ROLLS.includes(dice)` |
| `slice(a, b)` | a copy of part of the array | `actions.slice(0, j)` |
| `sort(fn)` | sorts **in place** (changes the array!) | `[...configs].sort((a, b) => armOf(a.color) - armOf(b.color))` |

Notice the last one copies first (`[...configs]`) because `sort` would otherwise change the caller's array. That's the immutability habit, explained below.

`Array.from({ length: 4 }, (_, id) => ...)` builds an array of four items. The `_` is a name for an argument you don't use.

## 1.4 Objects, spread and destructuring

```js
const spot = { kind: 'loop', pos: 7 }
spot.pos            // 7
spot['pos']         // 7, the same thing
```

**Spread (`...`)** copies the contents of an object or array into a new one:

```js
// engine.ts, passTurn: a new state that is the old one with a few fields changed
return { ...state, currentIndex: next, dice: null, pool: [], phase: 'roll' }

// rules.ts: a new array with one more item on the end
const pool = [...state.pool, value]
```

Later properties win, so `{ ...state, phase: 'roll' }` keeps everything from `state` except `phase`.

**Destructuring** pulls values out by name or position:

```js
const { game, actions, log } = get()          // three properties from an object
const [group, ...rest] = redoStack             // first item, and an array of the rest
```

**Shorthand:** `{ kind: 'loop', pos }` means `{ kind: 'loop', pos: pos }`.

## 1.5 Immutability: the most important habit in this codebase

The game state is **never changed in place**. Instead of `player.finishRank = 1`, the code builds a new object:

```js
players[idx] = { ...moved, finishRank: rank }
```

and instead of `marble.spot = to`, a new marbles array:

```js
p.marbles.map((m) => (m.id === move.marbleId ? { ...m, spot: move.to } : m))
```

Why bother?

1. **Old states stay valid.** Undo and replays depend on earlier states not being changed behind their backs.
2. **"Did anything change?" is one comparison.** If `applyAction` gets an illegal action it returns the *same object*, so callers check `next === state`. React and Zustand use the same trick to decide what to redraw.
3. **Caches can be keyed by the object.** The bots cache expensive calculations per `players` array in a `WeakMap` (chapter 7), which only works if that array never changes.

`===` on objects compares **identity** (is it the same object?), not contents. `{ a: 1 } === { a: 1 }` is `false`.

## 1.6 Safer access: `?.` and `??`

```js
const c = globalThis.crypto
if (!c?.getRandomValues) return Math.random()    // ?. stops and gives undefined if c is null/undefined

team: c.team ?? null                              // ?? uses the right side only if the left is null/undefined
map.get(key) ?? []                                // "the list for this key, or an empty list"
```

`??` differs from `||`: `0 ?? 5` is `0`, but `0 || 5` is `5`. Use `??` when 0 or `''` are real values.

## 1.7 Modules: import and export

Each file is a **module**. Names are private to the file unless exported:

```js
// board.ts
export const LOOP_LENGTH = 84
export function wrap(pos) { ... }

// engine.ts
import { COLORS, ENTRY_ROLLS, armOf } from './board'
```

`export default` marks a file's main export, imported without braces: `import App from './App.tsx'`. The project prefers named exports; `App` is the exception.

`import('peerjs')` with parentheses is a **dynamic import**: it loads the module only when that line runs, and returns a promise. It is used so the networking library is only downloaded when someone actually plays online ([peerNetwork.ts](../../src/net/peerNetwork.ts), [onlineStore.ts](../../src/store/onlineStore.ts)).

## 1.8 Classes (used sparingly)

Most code here is plain functions and objects. Classes appear where something has long-lived internal state, such as a network session:

```js
class MemoryChannel {
  peer = null
  closed = false
  send(message) { ... }
  close() { this.closed = true; ... }
}
const ch = new MemoryChannel()
```

See [memoryNetwork.ts](../../src/net/memoryNetwork.ts) and [hostSession.ts](../../src/net/hostSession.ts).

## 1.9 Closures

A function remembers the variables around it when it was created, even after the outer function has returned:

```js
// testUtils.ts: a seeded random number generator
export function seeded(seed) {
  let a = seed >>> 0
  return () => {          // this inner function "closes over" `a`
    a = (a + 0x6d2b79f5) >>> 0
    ...
  }
}
const rng = seeded(42)
rng(); rng()              // each call updates the same hidden `a`
```

Closures power React hooks (chapter 3). They also cause React's best-known bug, the **stale closure**: a function that keeps seeing an old value. You'll see the fix (refs) in chapters 3 and 8.

## 1.10 Asynchronous code: the event loop, timers and promises

JavaScript runs one thing at a time on one thread. Slow work (network, timers) is started, and a function is called **later** when it is done.

**Timers.** The whole game animation is timers:

```js
window.setTimeout(() => performRoll(), 700)   // run this in 700 ms
window.clearTimeout(id)                        // cancel it
```

**Promises** represent a value that arrives later. `async`/`await` makes them read like normal code:

```js
// api/turn.ts
const res = await fetchFn(url, { signal: AbortSignal.timeout(4000) })
if (res.ok) servers.push(...toList(await res.json()))
```

`await` pauses this function (not the whole program) until the promise settles. Errors from awaited promises are caught with `try { ... } catch { ... }`.

`Promise.all([a, b])` waits for both at once: `await Promise.all([import('peerjs'), loadIceServers()])`.

**The event loop, in one paragraph.** After your code finishes running, the browser first runs any queued **microtasks** (promise callbacks, `queueMicrotask`), then handles the next **task** (a timer firing, a click, a network message), then repaints the screen, and repeats. [memoryNetwork.ts](../../src/net/memoryNetwork.ts) uses `queueMicrotask` so test messages arrive "later", like on a real network, but before any timer.

## 1.11 Errors

```js
throw new Error('Star Hop needs 2 to 6 players')   // engine.ts createGame

try {
  window.localStorage.setItem(key, JSON.stringify(value))
} catch {
  // Storage blocked or full: it still works for this visit.
}
```

The project throws only for programmer mistakes (impossible setups). Expected problems, such as blocked storage or a bad network message, are handled quietly so the game keeps working.

## 1.12 JSON

`JSON.stringify(obj)` turns data into text, and `JSON.parse(text)` turns text back into data. It is used for saving games ([gameStore.ts](../../src/store/gameStore.ts)) and for every network message. Only plain data survives the round trip: functions, `undefined` properties, `Map`s and class instances don't. That is one reason the game state is kept as plain objects and arrays.

## 1.13 Browser APIs you'll meet

| API | Used for | Where |
| --- | --- | --- |
| `document.getElementById` | finding the `<div id="root">` to mount the app in | [main.tsx](../../src/main.tsx) |
| `window.localStorage` | saving the game and settings between visits | [gameStore.ts](../../src/store/gameStore.ts) |
| `window.sessionStorage` | remembering an online seat across a refresh | [onlineStore.ts](../../src/store/onlineStore.ts) |
| `crypto.getRandomValues` | fair dice | [engine.ts](../../src/game/engine.ts) `secureRandom` |
| `addEventListener('keydown', …)` | keyboard shortcuts | [useShortcuts.ts](../../src/hooks/useShortcuts.ts) |
| `matchMedia` | "is this a touch screen?" | [useMediaQuery.ts](../../src/hooks/useMediaQuery.ts) |
| `AudioContext` | synthesising sound | [sfx.ts](../../src/audio/sfx.ts) |
| `fetch` | asking `/api/turn` for relay servers | [iceServers.ts](../../src/net/iceServers.ts) |
| `history.replaceState` | removing the invite from the address bar | [onlineStore.ts](../../src/store/onlineStore.ts) |

## Try it

1. In the console, run `[3, 1, 2].sort()` then `const a = [3, 1, 2]; const b = [...a].sort(); a`. Explain the difference.
2. Open [board.ts](../../src/game/board.ts). For `wrap(-1)`, work out the answer by hand, then check in the console. Why the double `%`?
3. In [engine.ts](../../src/game/engine.ts), find `totalProgress`. Rewrite it with a `for...of` loop in a scratch file and confirm it gives the same answer.

## Check yourself

1. What does `{ ...state, phase: 'roll' }` produce, and is `state` changed?
2. Why does the code write `[...configs].sort(...)` instead of `configs.sort(...)`?
3. What's the difference between `a ?? b` and `a || b` when `a` is `0`?
4. What is a closure, and where does `seeded` use one?
5. In what order do a `setTimeout(fn, 0)` callback and a `queueMicrotask` callback run?
