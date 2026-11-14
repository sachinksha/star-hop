# 6. Persistence and schema evolution

Refresh the page mid-game and Star Hop brings the game back, paused. Settings, the last setup and an online guest's seat survive too. Event sourcing made saving cheap; the interesting parts are **trusting nothing you read back**, **versioning**, and the **cost of appending**.

Code: storage section of [gameStore.ts](../src/store/gameStore.ts), seat secret in [onlineStore.ts](../src/store/onlineStore.ts) and [guestSession.ts](../src/net/guestSession.ts), tests in [gameStore.test.ts](../src/store/gameStore.test.ts).

## What is stored, and where

| Key | Storage | Contents | Why there |
| --- | --- | --- | --- |
| `star-hop:settings` | `localStorage` | Auto roll, auto move, comeback dice, sound, theme | Preferences outlive the tab |
| `star-hop:game` | `localStorage` | `{ v, configs, initial, actions }` for a local game | A refresh, or tomorrow, resumes it |
| `star-hop:last-setup` | `localStorage` | The seats used last time | Prefills the setup screen |
| `star-hop:seat:<hostId>` | `sessionStorage` | An online guest's seat secret | Survives a refresh in that tab, not other tabs. Two tabs must not claim the same seat |
| `star-hop:guestName` | `localStorage` | The name a guest typed | Convenience |

Choosing between `localStorage` and `sessionStorage` per key, by **scope and lifetime**, is a good small design point to mention.

## Store the log, not the state

```ts
interface SavedGame { v: number; configs: PlayerConfig[]; initial: GameState; actions: GameAction[] }
```

The current position is **not** saved. It is re-derived by replaying `actions` over `initial` (Ludo [chapter 4](../../ludo-game/docs/04-state-management.md)). That has three benefits:

1. **Undo survives a refresh.** The history is the save.
2. **Small and append-only.** A roll is `{ type: 'roll', value: 4, actor: 'human' }`.
3. **The save validates itself.** See below.

Online games are never saved locally: the host owns them, and a refresh can't bring the guests back. `persist()` writes `null` for any config with a remote seat, and for finished games.

## Validate by replay

```ts
export function loadSavedGame(): SavedGame | null {
  const raw = readJson(SAVED_GAME_KEY)
  const parsed = isObject(raw) ? migrateSave(raw) : null   // upgrade old versions first
  if (!parsed) return null
  ...
  let state: GameState = initial
  for (const action of actions) {
    const next = applyAction(state, action)
    if (next === state) return null // an action that no longer applies
    state = next
  }
  if (state.phase === 'gameOver') return null
  return { v: SAVE_VERSION, configs, initial, actions }
}
```

The engine returns the **same object** for an illegal action (Ludo's "return the same state" habit). That turns the rules engine into a **validator for saved data** at no extra cost. A save edited by hand, corrupted, or written by an older version whose rules differ fails replay and is dropped, instead of loading a broken position. The whole thing is in a `try`, because a structurally wrong `initial` can make the engine throw.

Be precise about what this guarantees in an interview: it guarantees **the actions are legal from `initial`**. It does not prove `initial` itself is a reachable starting position. A tampered `initial` with five marbles would replay fine. For a single-player save that is acceptable (you can only cheat yourself). For anything competitive, the save would need to be server-side or signed.

## Versioning and migrations

The first version simply discarded any save with a different version. Team play then made that policy cost something: `GameState` gained a field (`playingFor`, [chapter 12](12-teams.md)), so every saved game in every player's browser was suddenly "version 1". Throwing those away would have cost players their games in progress for no good reason, because the upgrade is trivial: old games had no teams, so the new field is always `null`.

So `SAVE_VERSION` is now 2, and [gameStore.ts](../src/store/gameStore.ts) has a real migration chain:

```ts
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({ ...old, v: 2, initial: isObject(old.initial) ? { ...old.initial, playingFor: null } : old.initial }),
}

export function migrateSave(raw: Record<string, unknown>): Record<string, unknown> | null {
  let save = raw
  while (save.v !== SAVE_VERSION) {
    const step = typeof save.v === 'number' ? MIGRATIONS[save.v] : undefined
    if (!step) return null          // unknown or future version: no path forward
    save = step(save)
  }
  return save
}
```

Three details worth saying out loud:

- **Only `initial` needed migrating.** Actions are replayed through the new engine, and every v1 action is still a valid v2 action (rolls simply lack the optional `for`). Event sourcing makes the migration surface small: you migrate the starting snapshot and the event *schema*, not every derived state.
- **Replay still validates the result.** A migration that produced nonsense would fail replay and be dropped, so the safety net from the previous section covers migrations too.
- **A future version returns null**, not a crash: a save written by a newer tab (after a deploy) is ignored by an older one.

Principles:

- **Version every persisted shape** from day one. Adding a version later means guessing what unversioned data meant.
- **Migrate forward step by step** (1→2→3), never with direct jumps. Each step is small and tested once.
- **Event logs are harder than snapshots.** Old events must keep their old meaning even after the rules change. Either version the events or keep the old reducer for old logs. Event-sourced backends face exactly this problem ("upcasting" events).
- **Never trust the shape you read.** Treat storage like network input ([chapter 1](01-domain-modelling.md), parsing at the boundary).

## Settings: merge per key over defaults

```ts
function loadSettings(): Settings {
  const parsed = readJson(SETTINGS_KEY)
  const settings = { ...DEFAULT_SETTINGS }
  if (isObject(parsed)) {
    for (const key of ['autoRoll', 'autoMove', 'comebackDice', 'sound'] as const) {
      const value = parsed[key]
      if (typeof value === 'boolean') settings[key] = value
    }
    if (THEMES.includes(parsed.theme as Theme)) settings.theme = parsed.theme as Theme
  }
  return settings
}
```

Each key is checked on its own and falls back to its default. That is a **migration-free schema** for flat preferences: adding a setting (theme was added after launch) needs no version bump, because old saves simply lack the key. Removing one is harmless too. Use this for preferences; use explicit versions for structured documents.

## Storage can fail, so wrap every access

```ts
function writeJson(key: string, value: unknown): void {
  try { ... window.localStorage.setItem(key, JSON.stringify(value)) }
  catch { /* Storage blocked or full: it still works for this visit. */ }
}
```

`localStorage` throws in some privacy modes, when cookies are blocked, and when the quota (around 5 MB per origin) is full. The game must work without it. Every read and write is wrapped, including the theme script in `index.html`.

## The cost of appending: O(1) instead of O(n)

A six-player game can run past a thousand actions. If every new action re-derived the state with a full replay, a whole game would cost 1 + 2 + … + n applications, which is **O(n²)**. So `record` applies just the new action to the current state:

```ts
record: (action) => {
  const { game, actions, log } = get()
  const state = applyAction(game, action)
  if (state === game) return               // illegal: never enters the history
  ...
  set({ actions: [...actions, action], redoStack: [], game: state, log: [...log, ...entries] })
  persist(get())
}
```

Full replays still happen where they are needed and rare: loading, undo and redo. Correctness relies on the engine being **deterministic**, which the simulation test checks directly ("replaying the action log reproduces the final state exactly").

This is the classic **snapshot plus log** trade-off. Databases, Redux DevTools and collaborative editors all keep an incremental current state for speed and a log for history. If undo ever became slow, the next step would be periodic snapshots: replay from the nearest snapshot, not from the start.

One remaining cost: `persist()` serialises the **whole** save on every action. That reaches tens of kilobytes late in a long game: fine for `localStorage`, but it is synchronous work on the main thread. Exercise 3 explores it.

## Resume paused

A restored game starts paused (`paused: saved !== null`). After a refresh, a bot should not take its turn before you have even looked at the board. Small UX defaults like this are worth calling out, because they show you thought about the person, not just the data.

## Exercises

1. Add a version 3 with a real change (say, rename `actor` to `by` in actions). Write the 2→3 step and a test that a version-1 save walks up the chain to 3 and loads. Which part of the save does this migration touch that the 1→2 step didn't?
2. Open the game in two tabs. Play in one, refresh the other: what happens? Add a `storage` event listener so the second tab notices. What should it then do: follow along, or refuse to continue?
3. Measure `JSON.stringify` of a 1,000-action save. Would debouncing `persist` (with a final flush on `pagehide`) be worth it? What could go wrong?
4. Tamper with a saved `initial` to give red five marbles. Does it load? Add the minimum check that rejects it, and say why you stopped there.
5. Move the save to IndexedDB. What do you gain (async, larger quota, structured clone) and what gets harder (async startup, the inline theme script)?
