# 8. Walkthrough: state, the controller hook and the UI

**Goal:** follow how the game's state is stored, saved and undone; how the controller hook turns time and clicks into actions; and how the screens are put together.

Files for this chapter: [gameStore.ts](../../src/store/gameStore.ts), [useStarHopGame.ts](../../src/hooks/useStarHopGame.ts), [App.tsx](../../src/App.tsx), [GameScreen.tsx](../../src/components/GameScreen.tsx), [Board.tsx](../../src/components/Board.tsx), [index.css](../../src/index.css).

## 8.1 Kinds of state

Before the code, a map of where each kind of state lives. Being able to sort state like this is a principal-level skill.

| Kind | Example | Lives in | Survives a refresh? |
| --- | --- | --- | --- |
| **Source of truth** | initial state + action list | `gameStore` (`initial`, `actions`) | yes, saved to `localStorage` |
| **Derived** | the current `game`, the `log` | `gameStore`, recomputed from the truth | recomputed on load |
| **Preferences** | auto roll, sound, volume | `gameStore.settings` | yes, `localStorage` |
| **Session** | paused, log open | `gameStore` | no (a loaded game starts paused) |
| **Animation/UI only** | `shownPlayers`, `rolling`, `busy`, `selection`, `celebration` | `useState` inside the controller hook | no |
| **Online** | role, session, inbox | `onlineStore` | a guest's seat secret is kept in `sessionStorage` |
| **Component-local** | which sheet is open | `useState` in `GameScreen` | no |

Rule of thumb: keep the truth small and in one place; **derive** everything else; keep throwaway UI state as close to where it's used as possible.

## 8.2 gameStore.ts, top to bottom

### Defensive storage

```ts
function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}
```

`localStorage` can throw (private browsing, storage full, blocked by settings), and its contents can be anything (an old version, edited by hand). So every read returns `unknown`, every access is wrapped in `try`, and the game works without storage. Settings are validated field by field in `loadSettings`: a value is used only if it has the right type and range, otherwise the default is used.

### Settings

`Settings` and `DEFAULT_SETTINGS` define every preference. `updateSettings(patch)` merges a partial change, saves it, and pushes sound settings into the audio module. Preferences that can't lose a game live in Settings; destructive actions (restart, leave) live in the Game menu ([advanced chapter 14](../14-settings.md) explains why).

### Saved games and migrations

A saved game is just `{ v, configs, initial, actions }`. Because the game is event sourced, that's all you need.

When the shape of the state changes, old saves must still load. `SAVE_VERSION` is 3, and `MIGRATIONS` upgrades one version at a time:

```ts
const MIGRATIONS = {
  1: (old) => ({ ...old, v: 2, initial: { ...old.initial, playingFor: null } }),           // team play added
  2: (old) => ({ ...old, v: 3, initial: { ...old.initial, rules: NO_HOUSE_RULES, pool: [] } }), // house rules added
}
```

A version 1 save walks 1 → 2 → 3. Each step is tiny because only the **initial state** changes shape; the actions replay through today's engine.

`loadSavedGame` then **validates by replaying**: it applies every saved action, and if any returns the same state (no longer legal), the save is thrown away. That one check catches corruption, hand edits and rule changes. ([Advanced chapter 6](../06-persistence.md).)

### The store

```ts
export const useGameStore = create<GameStoreState>()((set, get) => ({
  ...initialState(),
  start: (configs, rng) => { ... },
  record: (action) => { ... },
  undo: () => { ... },
  ...
}))
```

Zustand's `create` takes a function that receives `set` (merge new values in, notify subscribers) and `get` (read the current state), and returns the initial state plus actions. Components subscribe with selectors (`useGameStore((s) => s.game)`); non-React code calls `useGameStore.getState()`.

The important actions:

| Action | What it does |
| --- | --- |
| `start(configs)` | `createGame`, reset actions, bump `session` (remounts the game screen), save |
| `record(action)` | apply **just this action** to the current game. If illegal (same object back), ignore it. Otherwise append it, append log lines, clear redo, save |
| `undo()` | find `undoIndex`, cut the action list there, push the removed group onto `redoStack`, re-derive by full replay |
| `redo()` | pop the top group, append it back, re-derive |
| `load(initial, actions)` | used by online guests: replace the game with one from the host (not saved) |
| `abort()` | clear everything and the save, back to setup |

Note the performance detail in `record`: it applies one action to the current state (O(1)) instead of replaying the whole history (O(n)), because a 6-player game can have thousands of actions. Undo and redo do the full replay, since they're rare. Both give identical results, which the tests check.

`persist` saves only local games that are still in progress. Online games are never saved locally, because the host owns them.

## 8.3 useStarHopGame.ts: the controller

This hook is the "imperative shell" around the pure rules. It's long (about 700 lines) but it has a clear shape. Read it in this order:

### 1. The `TIMING` constants

Every delay in the game, named and in one place. Tests import the same object.

### 2. Reading from the stores

```ts
const game = useGameStore((s) => s.game)
const paused = useGameStore((s) => s.paused)
const role = useOnlineStore((s) => s.role)
```

### 3. Animation-only state and refs

`shownPlayers`, `rolling`, `busy`, `celebration`, `notice`, `lastMove`, `selection`, `dieChoice`. Plus refs: `busyRef` (the busy lock, readable instantly inside timers), `timers` (every pending timeout, cleared on unmount).

```ts
const later = useCallback((fn: () => void, ms: number) => {
  timers.current.push(window.setTimeout(fn, ms))
}, [])
useEffect(() => {
  const pending = timers.current
  return () => pending.forEach((id) => window.clearTimeout(id))   // unmount: cancel everything
}, [])
```

Together with `key={session}` in `App.tsx`, this guarantees nothing from an old game fires into a new one.

### 4. Selection tied to a position

```ts
const [selection, setSelection] = useState<{ seq: number; marbleId: number } | null>(null)
...
const selected = selection && selection.seq === game.actionSeq && game.phase === 'move' ? selection.marbleId : null
```

The picked marble remembers the `actionSeq` it was picked at. As soon as any action happens, `actionSeq` changes, and the selection is ignored automatically. No effect has to "clear the selection when the game changes". The state expires by itself. `dieChoice` works the same way.

### 5. The action pipeline: `settle`, `animate`, `submit`

- `animate(action)`: sets `busy`. For a roll, tumbles the die for `ROLL_MS`, then records. For a move, schedules one timer per hole of `move.path` (longer arcs for star hops and the centre) that moves the marble in `shownPlayers` and plays a step sound, then records at the end. Anything else records immediately.
- `record` (the store's) applies the action.
- `settle()`: reads the new state from the store, copies it into `shownPlayers`, plays outcome sounds from the events, shows a finish banner or notice if needed, and releases `busy`.
- `submit(action)`: the entry point for actions decided on this device. If hosting, announce to guests first, then `animate`.

### 6. Deciding: `performRoll`, `performMove`, `performPass`

Each reads the **latest** state with `useGameStore.getState()` (never a possibly stale value from a closure), checks the busy lock and pause, builds the action and calls `submit`.

### 7. UI callbacks

`roll`, `pickMarble`, `chooseDestination`, `playMove`, `selectDie`, `rollFor`, `pass`, `undo`, `redo`, `togglePause`. These check "is this my seat?" and either act or (as an online guest) send an intent to the host.

### 8. The scheduler effect: the game loop

```ts
useEffect(() => {
  if (busy || paused || offerEnd || game.phase === 'gameOver') return
  const seat = game.players[game.currentIndex]!
  ...
  if (game.phase === 'roll') {
    ...
    if (seat.kind === 'human' && (seat.remote || !autoRoll || held)) return       // wait for a click
    const id = window.setTimeout(() => performRoll(), seat.kind === 'bot' ? TIMING.BOT_ROLL_MS : TIMING.AUTO_ROLL_MS)
    return () => window.clearTimeout(id)
  }
  // move phase: auto move if there's no real choice, or let the bot choose
  ...
}, [game, actions, busy, paused, ...])
```

This is the game loop. After every render it asks: **"Is something supposed to happen next without a click?"** A bot's turn, an auto roll, a forced move, or (as host) a guest's intent waiting in the inbox. If so, it sets a timer. If anything changes before the timer fires (the player pauses, an action lands), the cleanup cancels it, and the effect runs again with fresh data.

Note that nothing runs *during* the effect itself; it only schedules. That keeps effects predictable and makes StrictMode's double-run harmless.

### 9. Pausing when you look away

Another effect listens for `visibilitychange` and `blur`, and pauses local games when the tab is hidden or the window loses focus. Online games never auto-pause (one player switching tabs would stop everyone).

### 10. The returned controller

The hook returns one object (`StarHopController`) with everything the screen needs: the game, what to draw, flags (`busy`, `humanTurn`, `canUndo`), and the callbacks. The UI renders only from this object. That's what makes the UI swappable and testable: [useStarHopGame.test.ts](../../src/hooks/useStarHopGame.test.ts) drives the hook directly with fake timers, without rendering any component.

## 8.4 App.tsx: choosing a screen

```ts
if (game && !(role === 'guest' && localGame)) screen = <GameSession key={session} />
else if (role === 'guest') screen = <JoinScreen />
else if (role === 'host') screen = <HostLobby />
else screen = <SetupScreen ... />
```

No router: the screen is a function of the stores. An effect checks the URL once for an invite (`#join=…`) and switches to guest mode if there is one.

## 8.5 GameScreen.tsx: composing the game

`GameScreen` receives the controller as `hop` and lays out the pieces: the board, the player panels, the die or dice pool, the prompt line ("Your turn"), the move pad on phones, the toolbar, and the sheets (rules, settings, game menu). It also registers the keyboard shortcuts with `useShortcuts`.

Things to notice:

- It holds **only** UI state of its own (which sheet is open, which confirmation is showing). All game logic comes from `hop`.
- `aria-live="polite"` on the prompt makes screen readers announce turn changes.
- Opening the rules or settings pauses a local game.

## 8.6 Board.tsx: drawing with SVG

The board is one `<svg>` with a `viewBox`, so it scales to any size with no media queries. Every position comes from [layout.ts](../../src/game/layout.ts) (`loopPoint`, `homePoint`, `basePoint`, `CENTER_POINT`), which rotates everything so this device's arm is at the bottom.

It draws in layers: background and arms, then the track and stars, then holes, then marbles, then interactive overlays (glowing pickable marbles, numbered destination badges, the path preview, the last-move trail). Pickable marbles and badges are focusable, labelled for screen readers (via `describe.ts`), and respond to Enter and Space as well as clicks.

On phones, taps that miss a small target go to the nearest valid one, unless two are about equally close ([snap.ts](../../src/components/snap.ts), [advanced chapter 11](../11-touch-targets.md)).

## 8.7 CSS: tokens and one stylesheet

[index.css](../../src/index.css) starts with design tokens on `:root`:

```css
:root {
  --bg: #12151d;
  --ink: #e8eaf0;
  --accent: #6c93f0;
  --player-red: #d9434b;
  ...
  color-scheme: dark;
}
```

Everything else uses `var(--token)`. Changing the look means changing tokens, not hunting through rules. Components set per-seat colours by passing a token in an inline style (`style={{ '--arm': PLAYER_COLOR[color] }}`) that the CSS reads. The app is dark-themed only (the most recent commit removed the light theme). [Advanced chapter 5](../05-theming.md) covers theming in depth.

## Try it

1. In DevTools → Application → Local Storage, look at `star-hop:game` during a game. Find the `actions` array. Make a move and watch it grow.
2. Change `ROLL_MS` to 2000 in `TIMING`. Play. Run `npx vitest run src/hooks`. Do the tests still pass? (They use `TIMING`, so they should.) Undo it.
3. Play a few moves with undo turned on in Settings. Before each undo, predict which actions `undoIndex` will remove.
4. Set a breakpoint (VS Code or DevTools → Sources) inside the scheduler effect. Start a game against a bot and step through one bot turn.

## Check yourself

1. What's the source of truth for a local game, and what's derived from it?
2. Why does `record` apply one action, while `undo` replays everything?
3. How does a saved game from version 1 get loaded today?
4. How does the selected marble "clear itself" after an action?
5. What does the scheduler effect decide, and why does it schedule a timer instead of acting immediately?
6. Why can `useStarHopGame` be tested without rendering any component?
