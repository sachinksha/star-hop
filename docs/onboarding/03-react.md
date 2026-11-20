# 3. React from zero

**Goal:** explain components, props, state, effects, refs and custom hooks using this project's code, and understand *why* React works the way it does.

## 3.1 The one idea behind React

Without a library, updating a page means finding elements and changing them by hand: "set this text, add that class, remove this button". With many moving parts that gets out of step fast.

React flips it around. You write a function that says **what the screen should look like for the current data**. When the data changes, React calls your function again, compares the new result with the old one, and makes only the changes needed to the real page.

```
UI = f(state)
```

That's the whole mental model. Everything else is detail.

## 3.2 Components and JSX

A **component** is a function that returns **JSX**: HTML-like markup inside JavaScript. Here's a simplified [PlayerPanel.tsx](../../src/components/PlayerPanel.tsx):

```tsx
export function PlayerPanel({ player, active }: PlayerPanelProps) {
  const home = player.marbles.filter((m) => m.spot.kind === 'home').length
  const finished = player.finishRank !== null
  return (
    <li className={active ? 'panel panel-active' : 'panel'} aria-current={active ? 'true' : undefined}>
      <span className="panel-name">{player.name}</span>
      <span className="panel-home">{finished ? `#${player.finishRank}` : `${home}/4`}</span>
    </li>
  )
}
```

JSX rules you'll meet:

| JSX | Meaning |
| --- | --- |
| `{expression}` | insert a JavaScript value |
| `className="…"` | the HTML `class` attribute (`class` is a reserved word in JS) |
| `style={{ color: 'red' }}` | inline style as an object (outer braces: JS; inner: the object) |
| `{cond && <X/>}` | show `<X/>` only if `cond` is true |
| `{cond ? <A/> : <B/>}` | choose between two |
| `{list.map((p) => <PlayerPanel key={p.color} player={p} />)}` | render a list; each item needs a stable, unique `key` |
| `<>…</>` | a **fragment**: groups elements without adding a wrapper element |
| `onClick={() => roll()}` | event handler: pass a function, don't call it |

The `.tsx` file extension means "TypeScript with JSX".

## 3.3 Props: inputs to a component

**Props** are the arguments a parent passes down. [GameScreen.tsx](../../src/components/GameScreen.tsx) renders:

```tsx
{shownPlayers.map((p) => (
  <PlayerPanel key={p.color} player={p} active={p.color === current.color} />
))}
```

The child must treat props as **read-only**. Data flows **down** through props; requests to change things flow **up** through callback props like `onPickMarble` and `onChooseMove` on [Board.tsx](../../src/components/Board.tsx).

## 3.4 State: data that changes over time

`useState` gives a component a value that survives between renders, and a function to change it:

```tsx
// useStarHopGame.ts
const [rolling, setRolling] = useState(false)
...
setRolling(true)     // React re-renders with rolling === true
```

Two things beginners trip over:

1. **Setting state doesn't change the variable right away.** It schedules a re-render. The new value appears the next time the function runs.
2. **Never mutate state.** `players.push(x)` won't re-render, because React compares by identity (`===`, see chapter 1). Make a new array: `setShownPlayers((players) => withMarbleAt(players, color, id, spot))`.

The second form above passes a **function** to the setter. React calls it with the latest value. Use it when the new value depends on the old one, especially inside timers.

## 3.5 Rendering, re-rendering and purity

React may call your component function many times. So the function body must be **pure**: given the same props and state it returns the same JSX, and it doesn't *do* anything (no timers, no network, no changing outside variables). Doing things belongs in **event handlers** (a click) or **effects** (next section).

[main.tsx](../../src/main.tsx) wraps the app in `<StrictMode>`. In development, StrictMode deliberately renders components twice and runs effects twice (setup, cleanup, setup) to flush out impure code. If something breaks only in dev, StrictMode found a real bug.

## 3.6 Effects: synchronising with the outside world

`useEffect(fn, deps)` runs `fn` **after** React has updated the page, and again whenever a value in `deps` changes. If `fn` returns a function, that's the **cleanup**, run before the next effect and when the component goes away.

[useNow.ts](../../src/hooks/useNow.ts) is the textbook example:

```tsx
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)        // cleanup: stop the timer
  }, [intervalMs])                               // re-run only if intervalMs changes
  return now
}
```

The dependency list matters:

| Deps | Effect runs |
| --- | --- |
| `[]` | once after the first render (plus StrictMode's extra run in dev) |
| `[a, b]` | after the first render and whenever `a` or `b` changes |
| left out | after **every** render |

In this project, the most important effect is the **scheduler** in [useStarHopGame.ts](../../src/hooks/useStarHopGame.ts): after each render it looks at the game and, if a bot should move or a die should auto-roll, sets a timer to do it (chapter 8).

## 3.7 Refs: values that don't cause re-renders

`useRef` gives a box (`ref.current`) that survives renders but **doesn't** trigger one when changed. Two uses here:

**1. Holding an element:**

```tsx
const panelRef = useRef<HTMLDivElement>(null)
<div ref={panelRef}>…</div>
// later: panelRef.current?.focus()
```

**2. Holding a mutable value read by timers and listeners** (the fix for stale closures):

```tsx
// useShortcuts.ts: the "latest ref" pattern
const ref = useRef(handlers)
useEffect(() => { ref.current = handlers })          // always store the newest handlers

useEffect(() => {
  const onKey = (e: KeyboardEvent) => ref.current[key]?.()   // reads the newest, never stale
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [enabled])                                          // listener attached once, not on every render
```

Without the ref, `onKey` would remember the `handlers` from the render it was created in: a **stale closure**.

## 3.8 `useMemo` and `useCallback`: keeping things the same between renders

```tsx
const dieMoves = useMemo(() => game.legalMoves.filter((m) => m.die === selectedDie), [game, selectedDie])
const cancelSelection = useCallback(() => setSelection(null), [])
```

- `useMemo` remembers a **computed value** until its deps change.
- `useCallback` remembers a **function** until its deps change.

They exist for two reasons: avoid repeating expensive work, and keep the *same object identity* so that effects and children that depend on it don't re-run needlessly. Don't sprinkle them everywhere; use them when identity or cost actually matters.

## 3.9 Custom hooks: reusable logic

Any function whose name starts with `use` and calls other hooks is a **custom hook**. It's how React code is reused.

| Hook | What it gives a component |
| --- | --- |
| [useNow](../../src/hooks/useNow.ts) | the current time, ticking |
| [useMediaQuery](../../src/hooks/useMediaQuery.ts) | whether a CSS media query matches, live |
| [useShortcuts](../../src/hooks/useShortcuts.ts) | keyboard shortcuts from a key → handler map |
| [useGameClock](../../src/hooks/useGameClock.ts) | elapsed game time that stops while paused |
| [useOnline](../../src/hooks/useOnline.ts) | the live host or guest session view |
| [useStarHopGame](../../src/hooks/useStarHopGame.ts) | **the game controller**: everything the game screen needs |

`useStarHopGame` is the big one. It's a **controller**: the UI components only display what it returns and call its functions (`roll`, `pickMarble`, `chooseDestination`). They contain no game logic. Chapter 8 walks through it.

**Rules of hooks** (the linter enforces these): call hooks only at the top level of a component or custom hook, never inside `if`, loops or nested functions. React identifies each hook by its call order, so the order must be the same every render.

## 3.10 `useSyncExternalStore`: reading data React doesn't own

Some data lives outside React and changes on its own: the window size, a network session. `useSyncExternalStore(subscribe, getSnapshot)` lets React read it safely:

```tsx
// useMediaQuery.ts
return useSyncExternalStore(
  (onChange) => {                               // subscribe: call onChange when it changes
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  },
  () => window.matchMedia(query).matches,       // read the current value
)
```

The online [HostSession](../../src/net/hostSession.ts) and GuestSession classes expose exactly that pair (`subscribe`, `getView`), so React can read them without them knowing anything about React.

## 3.11 Global state with Zustand

Passing props through many layers gets painful. The app keeps shared state in two **stores** made with [Zustand](https://zustand.docs.pmnd.rs/), a tiny state library:

```tsx
// App.tsx: read just what you need with a selector
const game = useGameStore((s) => s.game)
const start = useGameStore((s) => s.start)
```

The component re-renders only when the selected value changes (by `===`). Outside React (in timers, tests) the same store is read with `useGameStore.getState()`. Chapter 8 walks through [gameStore.ts](../../src/store/gameStore.ts).

## 3.12 Keys to reset a component

```tsx
// App.tsx
screen = <GameSession key={session} />
```

When a `key` changes, React throws the old component away and mounts a fresh one, with all its state and timers reset. `session` goes up by one for every new game, so a new game can never inherit an animation or timer from the old one. It's a one-line fix for a whole class of bugs.

## 3.13 How the app starts

```tsx
// main.tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

[index.html](../../index.html) has an empty `<div id="root">` and loads `main.tsx`. React takes over that div. [App.tsx](../../src/App.tsx) decides which screen to show from the stores: the game, the join screen, the host lobby or setup. There's no router library; a game this size doesn't need URLs per screen.

## Try it

1. In [PlayerPanel.tsx](../../src/components/PlayerPanel.tsx), add the persona name after the player's name. Watch the page update without reloading (HMR).
2. In [useNow.ts](../../src/hooks/useNow.ts), remove the cleanup `return`. Open and close the host lobby a few times with React DevTools' profiler, or add a `console.log` in the interval. What leaks?
3. Look at the `useState` calls at the top of `useStarHopGame` (`shownPlayers`, `celebration`, `selection`…). If `key={session}` were removed from `GameSession` in [App.tsx](../../src/App.tsx), which of them would carry over from the old game into a restarted one? Try it, restart mid-move, and see.

## Check yourself

1. What does "UI = f(state)" mean in practice?
2. Why must a component's body be pure? Where do side effects go instead?
3. Explain a stale closure, and how the latest-ref pattern fixes it.
4. When would you pass a function to a state setter instead of a value?
5. Why does changing `key` reset a component?
