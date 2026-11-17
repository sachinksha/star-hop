# 2. SVG rendering and geometry

Ludo's board was a CSS grid of squares. Star Hop's is a six-armed star with holes on rotated lines, so it is drawn in **SVG** with a little trigonometry. Interactive SVG is common in frontend work (charts, maps, diagram editors, seat maps, design tools), and interviewers like it because it tests coordinate systems, rendering cost and accessibility at once.

Code: [layout.ts](../src/game/layout.ts), [Board.tsx](../src/components/Board.tsx), board section of [index.css](../src/index.css).

## Two coordinate systems, kept apart

| Module | Knows about | Never knows about |
| --- | --- | --- |
| [board.ts](../src/game/board.ts) | Hole numbers, stars, which hole leads where | Pixels, angles |
| [layout.ts](../src/game/layout.ts) | Where each hole is drawn, in SVG units | Rules, turns |

The rules never import `layout.ts`. You can redesign the whole look (round board, hex grid, 3D) without a rules test failing, and you can change a rule without touching drawing code. This is **separating the model from the view** at the geometry level, the same split as a map app keeping latitude and longitude apart from screen pixels.

## `viewBox` and user units

```tsx
const VIEW = `${-VIEW_HALF_X} ${-VIEW_HALF_Y} ${VIEW_HALF_X * 2} ${VIEW_HALF_Y * 2}`
<svg className="board" viewBox={VIEW}>
```

The board is designed in **user units**: holes are 1 unit apart (`HOLE_GAP`), a hole has radius 0.4, and the centre hole is at (0, 0). The `viewBox` maps that 20.6 × 21.3-unit rectangle onto however many CSS pixels the `<svg>` gets. On a phone one unit is about 17.5 CSS pixels; on a laptop 30 to 40. (It was a 21.6-unit square around a round board until the touch-target work in [chapter 11](11-touch-targets.md) trimmed the empty sides.) Everything scales together, with no media queries for the board.

**The catch:** anything sized in "px" *inside* the SVG is also in user units, because the `viewBox` transform scales the whole coordinate system. That is why the CSS says `font-size: 0.4px` for marble numbers and `stroke-width: 0.07` for halos. It is also the root cause of the mobile bug in [chapter 4](04-mobile-and-touch.md): the browser's focus ring is "a few px" wide, and inside this SVG a few px means a few board units, more than a quarter of the board.

Know the alternative: `vector-effect: non-scaling-stroke` keeps a stroke a fixed number of screen pixels regardless of scale, useful for chart gridlines and map borders.

## Rotation without matrices (well, almost)

Every arm is the same shape rotated by 60°. `armPoint` places a point `along` the arm's middle line and `across` it:

```ts
function armPoint(arm: number, bottom: number, along: number, across: number): Point {
  const t = armAngle(arm, bottom)
  return {
    x: Math.cos(t) * along - Math.sin(t) * across,
    y: Math.sin(t) * along + Math.cos(t) * across,
  }
}
```

That is a 2D rotation matrix applied to the vector `(along, across)`. Design one arm in "arm space" (along, across), and rotation puts it anywhere. SVG's y-axis points **down**, so increasing angles turn clockwise on screen, which matches the game's clockwise travel. Mention this flip whenever you do maths for screen coordinates: it is a classic source of mirrored diagrams.

## The local player at the bottom: a view transform

`armAngle(arm, bottom)` rotates the whole board so the arm in `bottom` points straight down. [GameScreen](../src/components/GameScreen.tsx) picks `bottom` once from "the seat this device plays":

```ts
const [bottom] = useState(() => {
  const me = game.players.find((p) => isMine(p.color))
  return me ? armOf(me.color) : 0
})
```

Online, each device sees **its own** arm at the bottom, yet all devices share identical game state. Rotation is a property of the **view**, not the model, so it is never sent over the network. A lazy `useState` with no setter fixes it for the game, so the board never spins mid-game when the turn changes.

The same principle applies widely: sorting, zoom level and "which column is pinned" are per-viewer view state; the document is shared model state.

## Static layer, dynamic layer

`BoardBase` draws the board's roughly 200 static shapes: arms, base pads, star ring, spokes and every hole. It depends only on `bottom`, `seated` and `activeColor`. The marbles, badges, path preview and trail are drawn on top, and change every step of an animation.

Splitting them makes the expensive, rarely changing part a separate component, so it **can** be memoised. It is not wrapped in `React.memo` today, because `seated` is a new `Set` on every render and would defeat a shallow comparison. Measure before memoising (exercise 1).

The same layering idea scales up to Canvas: draw the static background to an offscreen canvas once and blit it each frame, redrawing only the moving parts.

## Direction cues: geometry, not artwork

The board shows which way marbles travel with no image files. Everything is computed from the same hole positions the game uses, so it stays correct under any rotation:

- **Track chevrons**: for every pair of neighbouring loop holes, `stepBetween(a, b)` gives the midpoint and the angle from `a` to `b`, and `chevron(p, angle, ...)` builds a six-point polygon there. The gap between two holes is only 0.2 units, so the chevron is small: it nests in the "waist" where the two circles curve away from each other.
- **Into home**: a filled `arrow()` from each pre-start hole to home slot 0, in the owner's colour, plus lighter chevrons down the home lane.
- **The star ring**: a thin yellow band joining the stars, with black chevrons pointing clockwise, borrowed from the road signs on a sharp bend: star hops go clockwise. `starRingChevrons()` places two pairs on each stretch between stars, either side of the home hole that touches the circle; the tangent direction at angle θ is θ + 90°, because SVG's y axis points down. (A first version put a wide band round the centre hole, but it sat across the spokes, the links between the centre and the stars.)
- **Rounded corners**: `roundedPath(points, radii)` turns a polygon into a path that stops short of each corner and curves round it with a quadratic Bézier, using the corner itself as the control point. A radius per corner lets an arm round its inner end while its outer end, hidden under the base pad, stays square.

## Animating SVG with CSS transforms

Each marble is a `<g>` placed with an inline CSS transform:

```tsx
style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
```
```css
.marble { transition: transform 0.13s linear; }
```

The hook moves a marble one hole per timer tick. Each time the transform changes, the CSS transition glides it there. React never runs per animation frame; the compositor does the in-between frames. The `px` here are user units again (see above).

For the selection "ping" the ring scales around its own centre:

```css
.marble-ping { transform-box: fill-box; transform-origin: center; animation: ping 0.55s ease-out; }
```

`transform-box: fill-box` makes `transform-origin: center` mean "the centre of this circle". The default for SVG is the `viewBox`, where `center` would be the middle of the whole board.

## Hit targets bigger than the shapes

A marble is 0.76 units across, about 13 CSS pixels on a phone, too small to tap reliably. Each pickable marble and badge gets an invisible circle as its own target:

```tsx
{canPick && <circle className="marble-hit" r={TAP_R} />}   // TAP_R = 0.5: half the hole spacing
```
```css
.marble-hit { fill: transparent; }
```

`fill: transparent` (not `fill: none`) matters. SVG's default `pointer-events: visiblePainted` only receives events on painted areas, and `none` is not painted. WCAG 2.2's target size criterion (2.5.8) asks for at least 24×24 CSS pixels, or enough spacing. An invisible circle is the usual way a small visual gets a bigger target, but here neighbours are only 17.5px apart, so bigger circles would overlap. [Chapter 11](11-touch-targets.md) explains what Star Hop does instead (nearest-candidate snapping and move buttons).

## Accessible SVG

- Pickable marbles and badges get `role="button"`, `tabIndex={0}`, an `aria-label` and Enter/Space handlers (`onActivate`). Non-pickable marbles get none of those, so the tab order holds only what you can act on.
- The decorative board (`BoardBase`) is `aria-hidden`.
- Destination badges have spoken labels from `destinationLabel`: "Hop 2 stars, then 4 holes. 18 steps from home. Bumps Bot 2".
- A visually hidden list, `describeBoard`, gives the whole position as text: a text alternative for a picture that no `alt` attribute could hold.

## SVG versus Canvas versus DOM

| | SVG | Canvas 2D / WebGL | HTML/CSS |
| --- | --- | --- | --- |
| Good for | Up to a few thousand shapes, crisp at any zoom, interactive pieces | Thousands to millions of objects, per-frame redraws, particles | Text-heavy, layout-driven UI |
| Hit testing | Free (DOM events per shape) | You write it (maths or a colour-picking buffer) | Free |
| Accessibility | ARIA on elements, real focus | None built in; you mirror it in hidden DOM | Best |
| Styling | CSS, including themes via custom properties | Code only | CSS |
| Cost of change | One DOM node per shape | Redraw everything you changed | Layout and paint |

Star Hop has about 300 SVG nodes, few updates per second, and needs focus, keyboard support and theming, so SVG is the right call. A chart with 100,000 points, or a game at 60 frames per second with many sprites, would push you to Canvas, with a hidden DOM layer for accessibility.

## Exercises

1. Profile a 6-player bot game with the React DevTools Profiler. How long does `BoardBase` take per render? Memoise it (stable `seated` with `useMemo`, then `React.memo`) and measure again. Was it worth the code?
2. Add a "rotate board" button that cycles `bottom`. What must happen to the marbles' transitions so they don't fly across the board?
3. The arms are rounded paths now (`roundedPath` in layout.ts). Swap the quadratic Bézier for an SVG arc (`A`) command. When do the two look different?
4. Prototype the board in Canvas for one evening. List everything you had to rebuild that SVG gave you free.
