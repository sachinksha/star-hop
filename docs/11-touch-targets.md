# 11. Touch targets on a dense board

The report: on a phone, marbles sit so close together that choosing the one you mean feels like guesswork. This chapter is about solving that properly: measure first, check the published guidance, lay out every option you can think of, then choose a combination and say why. That sequence is what a principal-level answer to any "users can't hit the thing" problem looks like.

Code: [Board.tsx](../src/components/Board.tsx) (`onBoardClick`), [snap.ts](../src/components/snap.ts), [MovePad.tsx](../src/components/MovePad.tsx), [layout.ts](../src/game/layout.ts), tests in [touch.test.tsx](../src/components/touch.test.tsx).

## Measure the problem

Measured in Chromium with Playwright's device emulation, from the board's real `getBoundingClientRect()`:

| Device (CSS px wide) | Pixels per board unit | Hole spacing | Marble size | Tap circle (old) |
| --- | --- | --- | --- | --- |
| iPhone SE (320) | 13.3 | 13.3px | 8.5px | 19px |
| Pixel 5 (393) | 16.7 | 16.7px | 10.7px | 24px |
| iPhone 13 (390) | 16.6 | 16.6px | 10.6px | 24px |

On the old board, the invisible tap circle (radius 0.72 units) was wider than the gap between holes. Two neighbouring pickable marbles had **overlapping** targets, and the one drawn later won the overlap. So a tap that was visibly closer to marble 1 could pick marble 2.

## What the guidance says

| Source | Minimum target |
| --- | --- |
| WCAG 2.2, 2.5.8 Target Size (Minimum), level AA | 24×24 CSS px, *or* spaced so 24px circles around each don't overlap |
| WCAG 2.2, 2.5.5 Target Size (Enhanced), level AAA | 44×44 CSS px |
| Apple Human Interface Guidelines | 44×44 pt |
| Material Design | 48×48 dp, with about 8dp between targets |

A fingertip's contact patch is roughly 8 to 10 mm, about 45 to 55 CSS px on a typical phone. **Fitts's law** says the time to hit a target grows with distance divided by width, and the error rate shoots up once the target is narrower than the finger.

Against those numbers, Star Hop's 17px hole spacing is not slightly short. It is about a third of what is recommended. That rules out tweaking sizes as the whole answer.

## Six options, honestly compared

| Option | What it is | Verdict |
| --- | --- | --- |
| 1. Bigger pieces, tighter board | Marbles from 0.64 to 0.76 of the spacing; trim the empty sides of the board | **Done.** Cheap, looks better, but only +25% marble size and +5% spacing |
| 2. Redesign the board | Fewer gaps, a hex grid, shorter arms | **Rejected.** The board has 133 holes (84 loop, 24 home, 24 base, 1 centre) that the rules need. Re-spacing them buys at most about 15% |
| 3. Pinch or auto zoom | Zoom into the area around the selected marble | **Rejected for now.** Players must see the whole board to judge threats, zoom fights page scroll, and it adds a mode |
| 4. Loupe on press | A magnifier above the finger, like iOS text selection | **Rejected.** Needs a long press, which slows every single move |
| 5. Disambiguate ambiguous taps | Ask "which one?" when a tap is near two pieces (Google Maps does this for clustered pins) | **Adopted in part:** an ambiguous tap does nothing, and the move buttons are the clear path |
| 6. Snap to the nearest candidate | Only usable pieces count, and each owns the board area nearest to it | **Adopted** |
| 7. Indirect selection | Big numbered buttons that stand for the numbered pieces (the user's proposal) | **Adopted**, with press-to-preview |

The key insight behind 6 and 7: **at any moment only a few pieces are usable.** At most 4 marbles can be picked, then at most about 7 destinations. The board is dense, but the set of *candidates* isn't. Design for the candidates, not for the board.

## Nearest-candidate hit testing (a Voronoi bubble)

HCI research calls this the **bubble cursor** (Grossman and Balakrishnan, 2005): select whichever target is nearest the pointer, so each target effectively owns its **Voronoi cell**, the region closer to it than to any other target. With only a handful of candidates spread over the board, those cells are huge.

```ts
// snap.ts
export function snapTap<T>(at: Point, candidates: { p: Point; value: T }[]): T | null {
  const ranked = candidates
    .map((c) => ({ value: c.value, d: Math.hypot(c.p.x - at.x, c.p.y - at.y) }))
    .sort((a, b) => a.d - b.d)
  const [first, second] = ranked
  if (!first || first.d > SNAP_R) return null                     // too far from everything
  if (second && second.d - first.d < SNAP_MARGIN) return null     // ambiguous: do nothing
  return first.value
}
```

Three safety limits turn a research idea into something you can ship:

1. **A reach limit** (`SNAP_R = 1.25` units, about 22px). A tap in empty space far from every piece does nothing, so a stray touch while scrolling never plays a move.
2. **An ambiguity margin** (`SNAP_MARGIN = 0.3`). When the two nearest candidates are about equally close, the code doesn't guess. A wrong guess here is a wrong *move*, which can't be undone online, so doing nothing is the safe failure.
3. **Non-overlapping per-piece targets.** Each piece's own invisible circle shrank from radius 0.72 to 0.5, half the hole spacing, so neighbouring circles no longer overlap and drawing order no longer decides anything. A tap that misses every circle falls through to the board's click handler, which snaps.

Converting the tap to board coordinates uses the SVG's screen matrix:

```ts
const ctm = svgRef.current?.getScreenCTM?.()
const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
```

`getScreenCTM()` already includes the `viewBox` scale, any CSS transforms, and scrolling. Do this rather than dividing by `getBoundingClientRect().width`, which breaks the moment the SVG is rotated or letterboxed.

Keyboard and screen-reader users are not affected. Each piece is still a focusable element with a button role, and snapping only refines pointer taps.

Verified in a real browser: a tap about 18px from a marble's centre, outside its own circle, picked it.

## Indirect selection: the move buttons

Under the board, in thumb reach, sits a row of buttons with the same numbers as the marbles (and later the destination badges). On touch screens, numbers now appear on your marbles while you are picking. On desktop they were already there as keyboard hints, so the numbering became a **shared language** across the board, the keyboard and the buttons.

Design details that matter:

- **Press to preview, release to commit.** On `pointerdown` the button's target lights up on the board, and on release the click fires. If your finger slides off, `pointerleave` clears the preview and no click happens. This is the phone keyboard's key pop-up pattern, and it gives a look-before-you-commit step for free. `pointercancel` (the browser taking over to scroll) also clears it.
- **Stable positions.** All four marble buttons are always shown, and the ones that can't move are disabled rather than removed, so button 3 is always in the same place. Spatial memory beats reading.
- **Short labels.** "★ 77 to go", "Hop 2★ +1", "Home 2", with a red "Bump!" tag. The full sentence ("Hop 2 stars, then 1 hole. 18 steps from home. Bumps Bot 2") stays as the accessible name of the board badge.
- **At least 56px tall, about 80px wide.** Comfortably above the 48dp guidance.
- **A Roll button** appears in the same place when Auto roll is off, so the whole turn can be played without reaching for the top of the screen.
- **A setting**, "Move buttons under the board": On touch (default), Always, Never. "On touch" uses the same `(hover: none) and (pointer: coarse)` query as everything else ([chapter 4](04-mobile-and-touch.md)).

## Making the pieces themselves bigger

`MARBLE_R` went from 0.32 to 0.38 and `HOLE_R` from 0.36 to 0.4. The layout test that checks no two holes overlap (`HOLE_R * 2.2` must be under the closest pair's distance) still passes: the closest pair is a star and its neighbour, 0.94 apart.

The round board became a rounded rectangle. With your arm pointing down, the arms reach about 10.3 units up and down but only 9.95 sideways, so a circle of radius 10.65 wasted width. On a portrait phone, width is what limits the board, so trimming it gives about 5% more pixels per unit (16.7 to 17.5 on a Pixel 5). Marbles went from 10.7px to 13.3px across.

## Keeping the board still

On a phone the turn card (die, prompt, buttons) sits right above the board, so anything that changes the card's height pushes the board down or pulls it up. Measured with Playwright through real turns on a Pixel 5, the board's top edge moved:

| Turn | Before | After |
| --- | --- | --- |
| Banked sixes (6, 6, 3, then moves) | 131 px | 0 px |
| A finished player rolling for a teammate | 58 px | 0 px |
| An ordinary roll and move | 0 px | 0 px |

Three things caused it, and the fixes are the standard ones for **layout shift** (Cumulative Layout Shift, CLS, is one of Google's Core Web Vitals):

1. **Content that appears and disappears.** The banked dice row, the teammate buttons and a "can't move" hint each added a row. Now the card is a grid with a **reserved action row** (a fixed minimum height) that holds whichever of them the turn needs, and the hint borrows the prompt line instead of adding one. Reserve space for content you know will come, as you would give an image its width and height before it loads.
2. **Text of varying length.** Prompts ranged from one line to four. On phones they are now short ("Using the 3: tap a glowing marble") and the prompt keeps room for two lines, so it never grows. The dice row already shows the dice, so the prompt doesn't need to list them.
3. **Rows that wrap.** Three teammate buttons wrapped onto two rows. On phones they share one row (names cut with an ellipsis if they must be, with the full name in the accessible label), and suggestion counts appear as a corner badge rather than a second line. On wider screens the turn card is in its own column, the board can't move, and the buttons are free to stack at full width.

The cost is honest: the board starts about 35 px lower on a phone, because the action row is always there. A board that never moves is worth more than 35 px, but it is a trade-off worth naming. And measure it: the script that read the board's position before and after each step is what turned "it feels janky" into numbers, and then into a regression check.

## How you would know it worked

In a real product you would measure before declaring victory:

- **Dead taps:** taps on the board that did nothing (the snapping should cut these sharply).
- **Wrong picks:** a marble selected, then immediately deselected or a different one picked.
- **Undo right after a move**, in local games: a strong signal that the wrong move was played.
- **Time from roll to move** on phones compared with desktop.
- **Move button usage** versus board taps, split by device and screen size.

Then an A/B test with the buttons on and off for new phone players. Interviewers like to hear the metric *and* the failure signal you would watch for.

## Exercises

1. Draw the Voronoi cells for a position with marbles on loop 9, 10 and 14. Where does a tap do nothing because it is ambiguous?
2. Change `SNAP_MARGIN` to 0 and write a test where a tap between two marbles picks the wrong one. Is a margin of 0.3 units (about 5px) right? How would you decide with data?
3. Implement option 5 properly: when a tap is ambiguous, show a small popover listing the two candidates. Compare it with doing nothing.
4. Add a "long press to zoom" mode (option 3) behind a setting. What happens to scrolling and to the sheet's swipe gesture?
5. The move buttons appear and disappear, shifting the content below the board. Is that a layout-shift problem worth fixing? How would you reserve the space?
