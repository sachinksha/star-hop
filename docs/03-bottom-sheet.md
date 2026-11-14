# 3. Building a bottom sheet

The rules open in a **bottom sheet** on phones and a **centred dialog** on wider screens. It is one component, [Sheet.tsx](../src/components/Sheet.tsx), about 150 lines, built on the native `<dialog>` element, plus about 60 lines of CSS. This chapter explains every decision in it, the best practices behind them, and what a production design-system version would add.

A "build a modal / bottom sheet / popover" question is a staple of frontend interviews at companies with design systems (Atlassian, Google, Flipkart, Amazon), because it covers accessibility, focus, layering, animation, gestures and API design in one component.

Code: [Sheet.tsx](../src/components/Sheet.tsx), [RulesSheet.tsx](../src/components/RulesSheet.tsx), the "Sheet" section of [index.css](../src/index.css), tests in [Sheet.test.tsx](../src/components/Sheet.test.tsx).

## 1. Requirements first

Say these out loud before writing code. Interviewers grade the list as much as the code.

| Area | Requirement |
| --- | --- |
| Semantics | Announced as a dialog with a name ("How to play") |
| Modality | Nothing behind it can be clicked, focused or read by a screen reader |
| Focus | Moves into the sheet on open; Tab stays inside; returns to the opener on close |
| Closing | Close button, Esc, tap on the backdrop, swipe down (phones) |
| Motion | Slides up on open and down on close; follows the finger while dragging; respects reduced motion |
| Layout | Bottom-anchored, full width, up to 88% of the viewport height on phones; centred card on wider screens. Long content scrolls **inside** the sheet |
| Scroll | The page behind does not scroll; reaching the end of the sheet does not scroll the page or trigger pull-to-refresh |
| Devices | Clears the home indicator on notched phones; works with the on-screen address bar showing or hidden |
| Game | Opening the rules mid-game pauses a local game, and closing resumes it (only if the sheet paused it) |

## 2. Why the native `<dialog>`

Three ways to build a modal:

| Approach | You get | You must build |
| --- | --- | --- |
| `<div role="dialog" aria-modal="true">` | Full control | Focus trap, focus restore, Esc, inert background (`aria-hidden` on siblings or the `inert` attribute), stacking above everything (`z-index` wars, portals) |
| A library (Radix Dialog, React Aria, Headless UI; Vaul or react-modal-sheet for sheets) | Battle-tested behaviour, snap points, nested dialogs | A dependency, bundle size, learning its API |
| **Native `<dialog>` + `showModal()`** | Top layer, inert background, focus handling, Esc → `cancel` event, `::backdrop` | Exit animation, backdrop click, gestures |

`showModal()` does the hard accessibility work:

- **Top layer.** The dialog renders above everything, regardless of `z-index` or `overflow: hidden` ancestors. No portal is needed: the `<RulesSheet>` sits inside `GameScreen`'s markup, yet paints above the board, the toolbar and the confirm dialogs.
- **Inert background.** Everything outside the dialog becomes `inert`: no clicks, no focus, hidden from assistive technology. This replaces the old "set `aria-hidden` on every sibling" trick, which was easy to get wrong.
- **Focus.** On open, focus moves to the first focusable element inside (here the Close button). On close, browsers return focus to the element that was focused before, here the Rules button. The Playwright check in [chapter 4](04-mobile-and-touch.md) confirmed focus came back to "Rules (?)" after a swipe close.
- **Esc** fires a cancellable `cancel` event, then closes.
- **`::backdrop`** is a pseudo-element you can style and animate.

The existing [ConfirmDialog](../src/components/ConfirmDialog.tsx) is the `div` approach: it moves focus to Cancel and listens for Esc, but it does **not** trap Tab or make the page inert. Exercise 1 asks you to migrate it, and that is a good interview story: "we had a hand-rolled modal with these gaps; the platform now covers them".

## 3. One source of truth for "open"

```tsx
<Sheet open={rulesOpen} onClose={closeRules} title="How to play">
```

The owner holds `open` in its own state, like a controlled `<input>`. **Every** way of closing (button, Esc, backdrop, swipe) calls `onClose`, and only the owner flips `open` to false. The component then syncs the native dialog to that prop in an effect:

```ts
useEffect(() => {
  const dialog = dialogRef.current
  if (open) { ...; if (!dialog.open) dialog.showModal(); return }
  if (!dialog.open) return
  let cancelled = false
  dialog.dataset.closing = ''
  void animationsDone(dialog).then(() => {
    if (cancelled) return          // reopened while animating out
    delete dialog.dataset.closing
    dialog.close()
  })
  return () => { cancelled = true }
}, [open])
```

Why this matters: the game needs to know the sheet is open (to pause and to switch off shortcuts). If the dialog could close itself, by Esc for example, without telling React, the game would stay paused with no sheet visible. That is the classic **two sources of truth** bug. Two handlers guard it:

- `onCancel` calls `preventDefault()` (so the browser does not close the dialog instantly, skipping the animation) and then `onClose()`.
- `onClose` (the native `close` event) calls `onClose()` if React still thinks it is open. This covers closes we did not start. One real case: Chrome only lets a page cancel the Esc close once per user activation, an anti-abuse rule from the CloseWatcher work. If the browser ignores our `preventDefault`, the dialog closes without animating, and React still finds out.

This "controlled component wrapping an imperative widget" pattern also applies to video players, maps, and third-party editors ([chapter 8](08-react-patterns.md)).

## 4. Exit animations

Entry animations are easy: `dialog[open] { animation: sheet-in ... }` runs when the dialog appears. Exit is hard, because `close()` removes the dialog from the top layer and hides it (`display: none`) **immediately**, so there is nothing left to animate.

The approach here:

1. Set `data-closing` on the dialog. CSS switches to the exit keyframes:
   ```css
   .sheet[data-closing] { animation: sheet-out 0.2s ease-in forwards; }
   .sheet[data-closing]::backdrop { animation: fade-out 0.15s ease-in forwards; }
   ```
2. Wait for the animations to finish, using the Web Animations API:
   ```ts
   function animationsDone(el: HTMLElement) {
     const running = typeof el.getAnimations === 'function' ? el.getAnimations({ subtree: true }) : []
     return Promise.allSettled(running.map((a) => a.finished))
   }
   ```
3. Then call `dialog.close()`.

Why `getAnimations()` instead of an `animationend` listener or a `setTimeout(200)`?

- A timeout duplicates the duration in JS and CSS, and they drift apart.
- `animationend` never fires if there is no animation, for example when reduced motion is on (the global rule sets `animation: none`) or in jsdom. Then the dialog would never close.
- `getAnimations()` returns **whatever is actually running**. With no animations it returns `[]`, and `Promise.allSettled([])` resolves at once. Reduced motion and tests therefore get an instant close for free, with no special case. `allSettled` rather than `all`, because an animation that is cancelled rejects its `finished` promise.

The `cancelled` flag handles a race: reopening during the 200 ms exit. The effect's cleanup runs when `open` flips back to true, so the pending `close()` is skipped.

**The modern CSS-only alternative.** `@starting-style` plus `transition-behavior: allow-discrete` on `display` and `overlay` can animate dialogs in and out with transitions alone. Support was still uneven across browsers when this was written (Firefox did not support the `overlay` property), and it gets harder once a drag offset is involved. Know it exists, and say why you did or didn't use it.

## 5. Backdrop clicks: an edge case most implementations get wrong

The `::backdrop` belongs to the `<dialog>` element, so a click on the backdrop has `event.target === dialog`. The sheet's content (`.sheet-panel`) fills the dialog, and the dialog has no padding, so any click whose target is the dialog itself must be on the backdrop.

The subtle bug: press inside the sheet (say, to select text), drag outside, and release. The browser fires `click` on the **nearest common ancestor** of the press and release targets, which is the dialog, so a naive check closes the sheet. The fix records where the press began:

```tsx
onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget }}
onClick={(e) => {
  if (e.target === e.currentTarget && pressedBackdrop.current) onClose()
  pressedBackdrop.current = false
}}
```

There is a test for exactly this ("not on a click inside or a drag that ends outside"). Newer Chromium versions add `closedby="any"` on `<dialog>` for built-in light dismiss. Until all browsers support it, the manual check remains.

## 6. Swipe to close with Pointer Events

Only the **header** (with its grab handle) starts a drag. The body is left to scroll normally. Supporting a drag from the body as well needs "drag only when scrolled to the top and moving down" logic, which is how the native iOS sheet behaves, and it is listed as an exercise.

```ts
const onDragStart = (e) => {
  if (!window.matchMedia(SHEET_QUERY).matches || e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return   // the Close button is a click, not a drag
  e.currentTarget.setPointerCapture(e.pointerId)
  drag.current = { pointerId: e.pointerId, startY: e.clientY, startTime: e.timeStamp, dy: 0 }
  dialogRef.current!.dataset.dragging = ''
}
```

The details that make it feel native:

- **Pointer Events, not touch and mouse events.** One code path for finger, mouse and pen.
- **`setPointerCapture`.** Later moves and the release go to the header even if the finger slides off it. Without capture, a fast swipe loses the `pointerup` and the sheet gets stuck halfway.
- **`touch-action: none` on the header** (CSS). Without it, the browser treats a vertical finger movement as a scroll or pull-to-refresh, fires `pointercancel`, and your drag dies. Set it only on the drag area: setting it on the body would stop the rules from scrolling.
- **Follow the finger downward only:** `dy = Math.max(0, e.clientY - startY)`. Native sheets add a rubber-band effect when dragged upward; clamping is the simple version.
- **No React state per move.** The offset goes straight onto the element as a CSS custom property:
  ```ts
  dialogRef.current!.style.setProperty('--drag-y', `${d.dy}px`)
  ```
  ```css
  .sheet { transform: translateY(var(--drag-y, 0px)); }
  ```
  Pointer moves arrive at 60 to 120 per second. A `setState` per move would re-render the whole rules content each time for no benefit. Writing to the DOM directly for gesture frames, and using React for the outcome (open or closed), is the right split ([chapter 8](08-react-patterns.md)).
- **Distance or velocity decides.** On release, the sheet closes if it moved more than 25% of its height **or** was flicked faster than 0.5 px/ms (and at least 24 px, so a tap on the handle never closes it):
  ```ts
  const velocity = d.dy / Math.max(1, e.timeStamp - d.startTime)
  const farEnough = d.dy > dialog.offsetHeight * CLOSE_DISTANCE
  const flicked = velocity > CLOSE_VELOCITY && d.dy > MIN_FLICK_PX
  ```
  Distance alone feels sluggish (a quick flick should close it). Velocity alone is twitchy. The average velocity over the whole drag is a simplification; a more faithful version tracks the last 100 ms of movement.
- **Snap back** if neither threshold is met: remove `--drag-y`, and the CSS transition animates the sheet back to 0. While dragging, `[data-dragging]` turns the transition **off**; otherwise the sheet would lag behind the finger.
- **Close from where the finger let go.** The exit keyframes start from the drag offset:
  ```css
  @keyframes sheet-out { from { transform: translateY(var(--drag-y, 0px)); } to { transform: translateY(100%); } }
  ```
  So `--drag-y` is deliberately kept when closing. Without this the sheet would jump back up and then slide down.
- **`pointercancel` snaps back** and never closes. A cancel means the browser or OS took the gesture away, for example an incoming call or a system gesture.

### Why `matchMedia` at pointer-down, not a `useMediaQuery` hook

The component needs to know "am I a sheet?" in only one place, the start of a drag, so it asks then. A subscribing hook (`useSyncExternalStore` over `matchMedia`) would re-render on every resize past 700 px for no visible benefit, since CSS already switches the layout. Read on demand when you need the value at an event; subscribe when rendering depends on it. Exercise 3 builds the hook anyway, so you can say why it wasn't used.

## 7. Layout, scrolling and device details

```css
.sheet { max-height: min(82dvh, 760px); overflow: hidden; }
.sheet[open] { display: flex; }                 /* only when open! */
.sheet-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sheet-body  { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
html:has(.sheet[open]) { overflow: hidden; }
```

- **`display: flex` only on `[open]`.** The browser hides a closed dialog with `dialog:not([open]) { display: none }`. Writing `.sheet { display: flex }` would beat that rule (author styles win over the browser's) and show a closed dialog. A classic bug.
- **`min-height: 0` on flex children** lets them shrink below their content's height, so the body scrolls instead of overflowing the sheet. A flex item's default `min-height: auto` is the most common "why won't my flex child scroll?" answer.
- **`overscroll-behavior: contain`** stops scroll chaining. When the rules reach the end, the page underneath does not start scrolling, and on mobile Chrome a pull at the top does not trigger pull-to-refresh.
- **Scroll lock with `:has()`**. The page is inert, but iOS still scrolls it on a touch drag. `html:has(.sheet[open]) { overflow: hidden }` locks it in pure CSS, with no `useEffect` toggling a class on `<body>`, and it cannot be left locked by a missed cleanup. (Very old iOS versions needed `position: fixed` on the body plus restoring the scroll position afterwards; know that history.)
- **`dvh`** (dynamic viewport height) tracks the mobile address bar showing and hiding. `100vh` on mobile is the height *with the bar hidden*, so a `100vh` sheet would be cut off when the bar is visible.
- **Safe area:** `padding-bottom: env(safe-area-inset-bottom, 0px)` keeps content clear of the iPhone home indicator. It only becomes non-zero when the page opts in with `<meta name="viewport" content="..., viewport-fit=cover">`. This app does not opt in (the rest of the layout isn't ready for edge-to-edge drawing), so the value is 0 today, and the line is ready for when it does.
- **`margin: auto 0 0`** pins a `position: fixed; inset: 0` dialog to the bottom edge. That is how the browser's own centring (`margin: auto`) becomes bottom anchoring.
- **`text-align: start`** on the sheet. The dialog sits inside the setup screen's centred `<section>`, so it inherited `text-align: center`, which the first screenshots showed. Top-layer elements still inherit from their DOM parents.

## 8. Accessibility checklist

- `aria-labelledby` points at the `<h2>`, using `useId()` so two sheets never share an id.
- Opener buttons have `aria-haspopup="dialog"` (the setup and join screens' Rules button).
- The Close button has an accessible name ("Close") even though it shows only an icon.
- The drag handle is `aria-hidden` and is not the only way to close. Gestures must always have a button alternative (WCAG 2.5.1, pointer gestures).
- Reduced motion: the global `prefers-reduced-motion` rule removes animations, and `getAnimations()` then returns nothing, so open and close are instant.
- The game's keyboard shortcuts are disabled while the sheet is open (`!rulesOpen` in `useShortcuts`), so pressing "P" inside the rules does not pause the game behind them. There is an App test for this.

## 9. Testing it

- **jsdom has no `showModal()`.** `Sheet` feature-detects and falls back to the `open` attribute, so component tests (open, close button, Esc via a synthetic `cancel` event, backdrop rules, comeback setting shown) run in milliseconds. Don't mock the platform away inside your component. A small, explicit fallback is easier to reason about.
- **Real browsers for real behaviour.** Top-layer stacking, inertness, focus return, touch-action and swipe physics cannot be tested in jsdom. They were checked with Playwright on an emulated Pixel 5 (touch events sent through the Chrome DevTools Protocol): open → page paused and scroll-locked, focus on Close; short drag → snaps back; flick → closes, game resumes, focus returns to the Rules button; backdrop tap → closes; desktop Esc → closes, focus returns. A permanent version of that script belongs in an end-to-end suite (exercise 5).

## 10. Best practices, condensed

1. Start from the platform (`<dialog>`, `inert`, `popover`) and add only what it lacks.
2. One owner for the open state; every close path reports to it.
3. Animate out by waiting for the animations that are actually running, not a timer.
4. Gestures: Pointer Events, pointer capture, `touch-action` on the drag area only, distance **or** velocity, snap back on cancel.
5. Write gesture frames straight to the DOM (CSS custom properties); keep React for state changes.
6. Contain scrolling (`overscroll-behavior`, `min-height: 0`) and lock the page.
7. Use `dvh` and safe-area insets on mobile.
8. Every gesture has a button alternative; every animation respects reduced motion.
9. Restore focus to the opener, and give the dialog a name.
10. Test logic in jsdom and behaviour in a real browser.

## 11. What a design-system version would add

If Atlassian or Google asked you to design this as a shared component, extend the API carefully:

- **Snap points** (peek, half, full) with velocity projection: "where would a flick land?"
- **Drag from the content** when it is scrolled to the top.
- **Non-modal mode** (`show()` instead of `showModal()`), for a map with a results sheet you can interact behind.
- **Nested and stacked sheets**, and what Esc closes first.
- **`initialFocus` / `returnFocus` props** for flows where the opener disappears (for example, a row that was deleted).
- **Responsive variants**: bottom sheet below a breakpoint, side panel or dialog above, decided by the consumer or a token.
- **Server rendering**: the dialog must render closed on the server and open only on the client.
- **API shape**: compound components (`<Sheet.Header>`, `<Sheet.Body>`, `<Sheet.Footer>`) versus props. Controlled versus uncontrolled (`defaultOpen`). `onOpenChange(open)` versus `onClose()`.

## Exercises

1. Migrate `ConfirmDialog` to `<dialog>` using `Sheet`'s ideas. What do you gain (Tab trap, inertness)? What must change in its tests?
2. Let the sheet be dragged from the body when the body is scrolled to the top. Which `touch-action` value does the body need while dragging, and how do you hand off between scrolling and dragging?
3. Write `useMediaQuery(query)` with `useSyncExternalStore`. Use it to render a different close label on phones. When is that worth a re-render?
4. Add a "peek" snap point at 40% height. Decide which point a flick should land on from the velocity.
5. Turn the Playwright script described in section 9 into a committed end-to-end test that runs in CI on Chromium and WebKit.
