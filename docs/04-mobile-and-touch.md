# 4. Mobile web and touch: a debugging case study

This chapter tells one bug's story from report to fix, then covers the touch-input fundamentals it exposed. "Tell me about a hard bug" comes up in nearly every senior and principal interview, and this one is a good answer: a vague report, a hypothesis list, a reproduction, a root cause in how the platform works, a small fix, and a lesson that generalises.

## The report

> On mobile, tapping a marble to move it shows a highlighted version or animation with a big black circle that seems stuck, while the possible holes to land on are shown with numbers. The black circle takes up too much space and looks bad. Ideally it would animate and fade away.

Notice what the report gives you: a platform (mobile), a trigger (tapping a pickable marble that has several destinations), a symptom (a large dark circle that stays), and a hint of the intended design (some feedback, but brief).

## Step 1: list the hypotheses before touching code

Reading [Board.tsx](../src/components/Board.tsx) and [index.css](../src/index.css) with the report in mind gave these candidates. Each was cheap to check.

| Hypothesis | Why it fits | How to check |
| --- | --- | --- |
| The **tap highlight** (`-webkit-tap-highlight-color`) painted over the large invisible hit circle (`TAP_R = 0.72`, more than twice the marble's radius) | Mobile only; "circle"; dark on iOS | Computed style of the tapped element |
| **Sticky `:hover`** after a tap | Mobile only; "stuck" | Look for `:hover` rules on marbles |
| An unstyled SVG shape: **SVG's default `fill` is black** | "Black circle" | Inspect for a circle without a class |
| The **browser's focus ring**: the marble is a focusable `<g tabindex="0">` and keeps focus after the tap | "Stuck" until you tap elsewhere | `document.activeElement` and its computed `outline` |

Writing the list first stops you from fixing the first plausible thing and declaring victory.

## Step 2: reproduce in a real browser engine

jsdom has no layout or painting, so a unit test cannot see this bug. A short Playwright script did (Playwright installed in a scratch folder, not the project):

1. Open the app on an emulated **Pixel 5** (`devices['Pixel 5']` sets the viewport, device pixel ratio, touch support and mobile mode).
2. Before the page loads, write a **saved game** into `localStorage`: red to move with a 1, one marble sitting on a star. The app's own persistence ([chapter 6](06-persistence.md)) made it trivial to jump straight to the exact position, with no clicking through a game. The saved game resumes paused, so the script taps Resume first.
3. Tap the marble with `locator.tap()` (a real touch event, not a click).
4. Screenshot the board and print the focused element's computed style.

Result:

```
active: 'marble-red-0'
outline: 'auto 5px rgb(229, 151, 0)'
:focus-visible matches: false
tap highlight: 'rgba(0, 0, 0, 0)'
```

The screenshot showed a disc more than a quarter of the board wide over the marble: orange with a white rim in the light theme, **black** with a white centre in the dark theme. That was the user's "big black circle".

The other hypotheses were ruled out: the tap highlight was already transparent (set on `.board` and inherited), there was no hover rule on marbles, and every circle had a class.

## Step 3: understand the root cause

Two platform behaviours combined:

1. **The focus ring appeared on tap.** The marble is focusable (`tabindex="0"`, needed for keyboard play) and keeps focus after the tap. The CSS removed outlines only for `:focus-visible`:
   ```css
   :focus-visible { outline: 3px solid var(--focus); }      /* global */
   .marble-pickable:focus-visible { outline: none; }         /* old rule */
   ```
   A tap does not match `:focus-visible` (the browser's heuristic says pointer focus usually needs no ring), so the old rule never applied. Yet Chrome's mobile mode still painted its own `outline: auto` ring on the plain `:focus` state. `:focus-visible` is what the browser *recommends* showing a ring for. It is not a promise that no ring is drawn otherwise.

2. **Inside an SVG with a `viewBox`, "px" means user units.** The outline's width is a few px. But the board's coordinate system is scaled so that 1 user unit is about 17 CSS pixels on that phone ([chapter 2](02-svg-and-geometry.md)). The ring was drawn several **board units** wide, so a normal focus ring became a huge disc. It "stuck" because focus stays on the marble until something else takes it.

## Step 4: the fix, and the design improvement

```css
/* No browser focus ring on board pieces, on any kind of focus. ... The halo is the
   focus indicator instead, shown only for keyboard focus. */
.marble, .badge { outline: none; }
.marble-pickable:focus-visible .marble-halo { stroke: var(--focus); stroke-width: 0.12; }
```

This doesn't harm accessibility: keyboard users still get a clear indicator, now drawn in board units at the right size (the halo stroke), only when `:focus-visible` matches.

Then the design ask, "animate and fade away". Picking a marble now sends out a single ring that grows and fades:

```tsx
{isSelected && <circle className="marble-ping" r={MARBLE_R + 0.13} />}
```
```css
.marble-ping { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ping 0.55s ease-out; }
@keyframes ping { from { opacity: 0.9; transform: scale(1); } to { opacity: 0; transform: scale(2.2); } }
```

- It is **mounted on selection**, so the one-shot animation plays every time a marble is picked, without JavaScript timers ([chapter 8](08-react-patterns.md)).
- Its **resting state is invisible** (`opacity: 0`). When animations are disabled for reduced motion, nothing shows instead of a frozen ring.
- The steady gold halo remains, so you can still see which marble is selected.

Two related hardening fixes went in at the same time:

- `.board *` explicitly gets `-webkit-tap-highlight-color: transparent`, instead of relying on inheritance.
- The badge hover style moved inside `@media (hover: hover)`, because on touch screens `:hover` sticks to the last tapped element.

The same Playwright script on the fixed build: outline `none`, a clean board with the gold halo and the three numbered badges. A component test checks the ping appears only on the selected marble. The outline itself can only be verified in a real browser, and saying so honestly in an interview is part of a good answer.

## How to tell this story in an interview (STAR, about two minutes)

- **Situation:** a mobile-only visual bug report with a vague description, in an SVG game board.
- **Task:** find the cause and fix it without hurting keyboard accessibility.
- **Action:** listed four hypotheses, reproduced with Playwright device emulation using a saved-game fixture, measured the focused element's computed style, identified the focus ring plus SVG user-unit scaling, replaced the browser ring with a size-correct custom indicator for keyboard focus only, and added the fade-out feedback the user wanted.
- **Result:** fixed on mobile, unchanged for keyboard users, and a reusable reproduction technique.
- **Lesson:** `:focus-visible` is a hint, not a guarantee. Inside scaled coordinate systems (SVG, CSS `transform: scale`, `zoom`), "px" isn't screen pixels.

## Touch-input fundamentals

### Input media queries, not user-agent sniffing

```ts
export const IS_TOUCH = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true
```

[useShortcuts.ts](../src/hooks/useShortcuts.ts) uses this to hide keyboard hints and switch prompts from "Press Space" to "Tap the die". `pointer: coarse` means the primary pointer is imprecise (a finger). `hover: none` means it cannot hover. A laptop with a touchscreen reports its primary input (the trackpad: `fine`, `hover`). `any-pointer` and `any-hover` ask about *any* input instead. Never sniff the user agent for this. Feature and capability queries describe what the device can do.

The value is computed once at module load. A tablet that gains a keyboard mid-session would keep the touch hints. That is acceptable here, and worth knowing as a trade-off.

### `:focus` versus `:focus-visible`

| | `:focus` | `:focus-visible` |
| --- | --- | --- |
| Matches | Any focused element | When the browser thinks a focus indicator helps: keyboard navigation, text inputs, script focus after keyboard use |
| Use for | Logic and styles that must apply on every focus | The visible focus ring |

Best practice: remove the default outline only where you replace it with your own indicator, and draw yours on `:focus-visible`. Here the replacement is the halo.

### Sticky hover

On touch devices a tap emulates hover, and the element stays "hovered" until you tap somewhere else. Wrap hover-only affordances in `@media (hover: hover)`, and never hide information behind hover alone.

### `touch-action`

```css
button, .board, .board * { touch-action: manipulation; }
.sheet-header { touch-action: none; }
```

`manipulation` allows panning and pinch-zoom but disables double-tap-to-zoom. The browser no longer waits about 300 ms to see whether a second tap follows, so taps feel instant. `none` hands every gesture to your code, which the sheet's drag area needs ([chapter 3](03-bottom-sheet.md)).

### Target sizes

The invisible hit circles make a small marble about 24 CSS pixels to tap (WCAG 2.2 target size, 2.5.8). Apple's guidelines say 44pt and Material says 48dp for primary controls. Bigger is better wherever the layout allows it.

### Visual order versus DOM order

On phones the game reorders the layout with CSS:

```css
@media (max-width: 700px) {
  .side { display: contents; }        /* lift the die card out of the sidebar */
  .dice-card { order: 1; } .table { order: 2; } .panels { order: 3; } .side-card { order: 4; }
}
```

`display: contents` removes the sidebar's box so its children join the grid, and `order` puts the die and prompt above the board. Watch out: **`order` changes only what you see, not the tab order or the reading order.** A keyboard or screen-reader user on a phone meets the elements in DOM order (players, board, die). Here the visual order is the more useful one on a small screen and the DOM order is fine for assistive technology. But make that choice consciously; WCAG 1.3.2 (meaningful sequence) and 2.4.3 (focus order) are about this. Also, some older browsers dropped the semantics of elements with `display: contents`; on a plain `<aside>` that is a minor loss.

### Viewport units

`100vh` on mobile is the height with the browser bars hidden, so content sized with it hides behind the bars. Use `dvh` (follows the bars), `svh` (always the smaller size) or `lvh` (always the larger). The board uses `max-height: calc(100dvh - 8rem)` and the body `min-height: 100dvh`.

## Exercises

1. Reproduce the original bug yourself: `git stash` the fix (or check out the commit before it), and write the Playwright script described above from scratch. Time how long it takes. This is your "how I debug mobile issues" demo.
2. Make `IS_TOUCH` reactive (a hook over `matchMedia` change events). Which components need it, and does it justify the re-renders?
3. Audit the phone layout's tab order against its visual order. Would you change the DOM order? What would desktop lose?
4. Find another place in the app where `px` inside the SVG could surprise someone (hint: look at `font-size` and `drop-shadow` in the board CSS).
