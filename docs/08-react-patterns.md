# 8. React patterns new in this codebase

Ludo's [chapter 3](../../ludo-game/docs/03-react.md) covers the hook-as-controller, refs against stale closures, effects as schedulers, `useSyncExternalStore`, keys to reset state and selectors. All of those are here too. This chapter covers the patterns Star Hop added.

## State that expires on its own

A human picks a marble, then a destination. The picked marble is local UI state, but it must vanish whenever the position changes: after any move, a roll, an undo, a bot turn, or a host's action arriving online. The obvious approach is an effect:

```ts
// The approach NOT taken:
useEffect(() => { setSelection(null) }, [game])
```

That renders once with a stale selection (the effect runs after paint), then again to clear it, and it is easy to miss a case. Instead the selection records **which position it belongs to**:

```ts
const [selection, setSelection] = useState<{ seq: number; marbleId: number } | null>(null)

const selected =
  selection && selection.seq === game.actionSeq && game.phase === 'move' ? selection.marbleId : null
```

`actionSeq` increments with every applied action. Once anything happens, the stored `seq` no longer matches, and `selected` is `null` **during that same render**, with no effect, no extra render and no missed cases. The stale value may sit in state, but nothing can read it.

`GameScreen`'s hint ("Marble 2 can't move with a 3") uses the same trick: `{ seq, text }`, shown only while `hint.seq === game.actionSeq`.

This generalises to **tagging local state with the version of the data it was derived from**: a draft tied to a document revision, a selection tied to a list's query, an optimistic update tied to a request id. React's docs make the same point ("you might not need an effect"): derive during render rather than synchronising in effects.

## The latest-ref pattern for long-lived listeners

[useShortcuts](../src/hooks/useShortcuts.ts) attaches **one** `keydown` listener and still calls the newest handlers:

```ts
const ref = useRef(handlers)
useEffect(() => { ref.current = handlers })           // after every render

useEffect(() => {
  if (!enabled) return
  const onKey = (e: KeyboardEvent) => { ...; ref.current[key]?.() }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [enabled, repeatable])
```

Without the ref, the listener would capture the handlers from its first render (a stale closure), or it would have to re-subscribe on every render because `handlers` is a new object each time. The ref gives a stable subscription with fresh behaviour.

React's `useEffectEvent` packages this pattern officially (a function that always sees the latest props but isn't a dependency). Know both forms, and know why the ref is updated in an effect rather than during render: writing refs during render is unsafe under concurrent rendering, because a render can be thrown away.

Two smaller details in the same hook are worth borrowing:

- **Handlers return `false` to decline**, and only then does the key keep its default behaviour (`if (handler() !== false) e.preventDefault()`). Esc does nothing when no marble is selected, so it can still close things elsewhere.
- **Typing is never hijacked**: inputs, textareas, selects and `contentEditable` are skipped, as are Ctrl, Meta and Alt chords, and held-key repeats except for the arrow keys. Global shortcuts that break typing in a name field are a common accessibility failure.

## Syncing React state with an imperative widget

`<dialog>` is imperative: you call `showModal()` and `close()`; it has no `open` prop that animates. [Sheet](../src/components/Sheet.tsx) wraps it in a **declarative** API (`open` and `onClose`) using a ref and an effect that reconciles the widget with the prop ([chapter 3](03-bottom-sheet.md)):

```ts
useEffect(() => {
  if (open) { if (!dialog.open) dialog.showModal(); return }
  if (!dialog.open) return
  // animate out, then dialog.close(), unless reopened first (cleanup sets cancelled)
}, [open])
```

The recipe, which also fits maps, video players, charts and rich-text editors:

1. The React prop is the **source of truth**.
2. An effect **compares** the widget's actual state (`dialog.open`) with the prop and makes the minimum calls to match. That makes it idempotent and safe under StrictMode's double effects.
3. Events from the widget (`cancel`, `close`) **report back** through callbacks; they never change the widget directly.
4. A cleanup handles races (reopened mid-animation) and unmounting. A second effect closes the dialog if the component unmounts while open, so the page is never left inert.

## Imperative DOM writes for gesture frames

During a swipe the sheet's offset changes on every pointer move. Updating it through `useState` would re-render the sheet and all its content up to 120 times a second. Instead:

```ts
dialogRef.current!.style.setProperty('--drag-y', `${d.dy}px`)
```

and React state changes only for the **outcome**, open or closed. The rule: **React for state that changes what is rendered; direct DOM writes (or CSS custom properties, or a ref-held animation) for per-frame visual values.** The drag position also lives in a ref (`drag.current`), not state, for the same reason. Animation libraries such as Framer Motion and react-spring work the same way internally (motion values outside React's render cycle).

## One-shot animations by mounting

```tsx
{isSelected && <circle className="marble-ping" r={MARBLE_R + 0.13} />}
```

A CSS animation runs when its element appears. Mounting the element on selection replays the animation each time, with no timers, no "animating" state and nothing to clean up. The notice banner uses the related trick: `key={notice.id}` gives each new notice a fresh element, so its entry animation runs again even when the text is the same.

## Lazy, fixed state

```ts
const [bottom] = useState(() => { const me = ...; return me ? armOf(me.color) : 0 })
```

No setter, so it is decided once per mounted game ([chapter 2](02-svg-and-geometry.md)). That is a deliberate **"snapshot at mount"**, different from a derived value (which would follow changes) and from a ref (which would not render). Choose it when a value must not change mid-session even if its inputs do, such as when a bot takes over your seat online.

## A side effect owned by the opener

Opening the rules pauses a local game, and closing resumes it, but **only if opening paused it**:

```ts
const pausedForRules = useRef(false)
const openRules = () => {
  if (role === 'local' && !paused && !gameOver) { pausedForRules.current = true; togglePause() }
  setRulesOpen(true)
}
const closeRules = () => {
  setRulesOpen(false)
  if (pausedForRules.current) {
    pausedForRules.current = false
    if (useGameStore.getState().paused) togglePause()
  }
}
```

The ref records **who caused** the pause, so the sheet never overrides the player: if they paused first, the game stays paused after the rules close (there is a test for exactly this). Reading `getState()` at close time rather than the rendered `paused` avoids acting on a stale value. Online games don't pause: one player's reading should not stop everyone. These "who owns this side effect?" decisions are what reviewers look for in principal-level code.

Note the design choice: the pausing lives in `GameScreen`, not in `Sheet`. `Sheet` stays generic and knows nothing about games; the screen that knows the context adds the behaviour.

## `useId` for accessible relationships

```ts
const titleId = useId()
<dialog aria-labelledby={titleId}> ... <h2 id={titleId}>{title}</h2>
```

`useId` gives a unique, stable id that matches between server and client rendering. Hard-coded ids (`id="confirm-title"` in `ConfirmDialog`) break when two instances are on screen at once. Exercise 2 fixes that.

## Exercises

1. Replace the `useShortcuts` latest-ref with `useEffectEvent`. Do the tests still pass? What changed in the dependency lists?
2. Give `ConfirmDialog` `useId`-based ids, then render two at once in a test and assert each is labelled correctly.
3. Move the selection's expiry into an effect (the version above marked "NOT taken") and write a test that catches the extra render or the stale frame. React's Profiler or a render counter will help.
4. Make the swipe use React state for `dy` and profile a drag on a throttled CPU (DevTools → Performance → CPU 4× slowdown). Describe what you see.
