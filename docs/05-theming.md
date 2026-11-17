# 5. Theming with design tokens

Star Hop has three themes: **System** (follows the device), **Light** and **Dark**, with the choice remembered. It is implemented with CSS custom properties, a small inline script, and no CSS-in-JS. Theming is a frequent design-system interview topic ("how would you add dark mode to a large app?", "how do you theme a component library for several brands?").

Code: top of [index.css](../src/index.css), `applyTheme` and settings in [gameStore.ts](../src/store/gameStore.ts), the inline script in [index.html](../index.html), the Theme control in [SettingsSheet.tsx](../src/components/SettingsSheet.tsx).

## Tokens: name the role, not the colour

```css
:root {
  --bg: #f3efe6;  --surface: #fffdf8;  --ink: #1f2430;  --ink-soft: #5d6372;
  --accent: #2f5fd0;  --danger: #b42318;  --focus: #2f5fd0;
  --board: #ebe2cd;  --hole: #262a33;  --star: #f4c542;  --badge: #ffffff;
  --arm-tint: 24%;  --arm-edge: 72%;
}
```

Components only ever use roles: `background: var(--surface)`, `color: var(--ink-soft)`. A theme is then just **a different set of values for the same names**. This is the layering most design systems use:

| Layer | Example | Who changes it |
| --- | --- | --- |
| Primitive (palette) | `blue-600: #2f5fd0` | Brand team |
| Semantic (role) | `--accent`, `--surface`, `--danger` | Theme authors |
| Component | `--badge`, `--hole` | Component authors |

Star Hop skips the primitive layer (a small app), and its component tokens (`--hole`, `--star`) sit beside the semantic ones. In a large system you would keep them apart, so a brand colour change touches one place.

Note the tokens that aren't colours: `--arm-tint: 24%` is a **mixing ratio**. Dark mode needs stronger tints to read on a dark board, so the ratio is a theme value too.

## Three modes with one attribute

```css
:root { /* light values */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark values */ }
}

:root[data-theme='dark'] { /* dark values */ }
```

| `data-theme` on `<html>` | Device in light mode | Device in dark mode |
| --- | --- | --- |
| absent (System) | light | dark |
| `light` | light | light |
| `dark` | dark | dark |

```ts
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}
```

"System" is the **absence** of an override, so the CSS media query decides, and it updates live when the OS switches at sunset with no JavaScript listener. That is the key design choice: the default path needs zero JS.

**The cost:** the dark values appear twice (inside the media query and under `[data-theme='dark']`), because CSS has no way to say "this block if (A and not B) or C" without repeating it. Ways to remove the duplication, worth knowing:

- **`light-dark()`**: `--surface: light-dark(#fffdf8, #1b202b)` picks a value based on the element's `color-scheme`. Then the attribute only needs to set `color-scheme: light`, `dark` or `light dark`. Supported in all current major browsers since 2024.
- A preprocessor mixin, or generating both blocks from a token file (Style Dictionary and similar tools).
- Duplicate deliberately and test it (the app's tests check that switching sets the attribute).

## Derived colours with `color-mix()`

Six player colours appear as solid marbles, tinted arms, rims and home holes. Instead of 6 × 5 hand-picked shades, each element sets one variable, `--arm`, and CSS derives the rest:

```tsx
<polygon className="arm" style={{ ['--arm' as string]: COLOR_HEX[color] }} />
```
```css
.arm      { fill:   color-mix(in srgb, var(--arm) var(--arm-tint), var(--board)); }
.hole-home{ fill:   color-mix(in srgb, var(--arm) 35%, #000); }
.base-pad-empty { fill: color-mix(in srgb, var(--arm) 30%, var(--board)); }
```

Because the tint mixes with `var(--board)`, the same rule gives a pale tint on the cream light board and a deep one on the navy dark board. One input colour, many outputs, theme-aware. Mixing `in oklch` instead of `in srgb` gives more even perceived lightness between hues. The yellow arm is the one to look at if you try it.

Setting a custom property inline (`style={{ '--arm': ... }}`) is also how dynamic values reach CSS without generating classes at runtime, and it is cheaper than CSS-in-JS for per-instance values.

## A light theme is not the dark theme inverted

The light board first used the dark theme's near-black holes on cream. Every colour was fine on its own, but the visual hierarchy was upside down. On the dark board the holes sink into the background and the marbles glow. On cream, roughly 160 near-black holes were the highest-contrast thing on screen, so they drew the eye and the marbles had to compete with them. Players said the light theme "felt like a downgrade" and that it was hard to tell whose marbles were ready to move.

The fix was to rank the elements by importance and give contrast in that order, separately for each theme:

1. **Marbles** (what you act on): saturated, outlined, with a soft drop shadow (`--marble-shadow`) so they sit on the board.
2. **The current player** (whose turn): the active arm gets a stronger tint (`--arm-active-boost`) and, in light mode, its outline swells twice when the turn arrives (`--arm-flash`), then stays steady. A continuous pulse on the arm as well as the marbles would be two things competing for attention, and more motion than the job needs.
3. **The pickable marbles' halo**: white on dark, but on light a deep shade of the marble's own colour (`color-mix(in srgb, var(--arm) var(--halo-arm), var(--halo))`), so the glow also says whose marbles they are.
4. **Holes** (where pieces can go): shallow dimples (`--hole: #d3c7a9`), only a step darker than the board.

Each of these is a token with a value per theme, so the dark theme is unchanged.

The light theme then got its own palette ("Sorbet"): a warm paper-white board with peach dimples, and **pastel player colours**. Player colours used to be hex strings in TypeScript (`COLOR_HEX`), which meant one palette for every theme. Now `PLAYER_COLOR` holds `var(--player-red)` and so on, and the hex values are tokens in index.css: pastels in light, the original strong colours in dark. Every component already passed the colour to CSS as `--arm`, so none of them changed. Pastels need two adjustments: each marble's rim is a deeper shade of its own colour (`--marble-rim-arm`) rather than black, which looks heavy on pastels, and text drawn in a player's colour is darkened (`--arm-ink`) so it stays readable on a light surface. Note that `--arm` is set per element, so a token can't contain `var(--arm)` (a custom property resolves `var()` on the element where it is declared, here `:root`). The rule mixes in `var(--arm)` itself, and the token carries only the percentage.

## `color-scheme` tells the browser too

```css
:root { color-scheme: light; }
/* in both dark blocks: */ color-scheme: dark;
```

This switches the browser's own pieces (scrollbars, form controls such as the setup checkboxes, the default page background and text colour) to match. Without it you get a dark page with bright white scrollbars and checkboxes.

## No flash of the wrong theme

The React bundle loads after first paint. If the theme were applied only by React, a dark-mode user would see a light page flash first. The fix is a tiny **blocking inline script** in `<head>`:

```html
<script>
  try {
    var t = JSON.parse(localStorage.getItem('star-hop:settings') || '{}').theme
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
  } catch (e) {}
</script>
```

- It runs before the body is parsed, so the first paint already has the right attribute.
- It is ES5 and wrapped in `try`, because storage can throw (privacy modes, blocked cookies) and a bad value must not break the page.
- It duplicates the logic of `applyTheme`. The comment in both places says so; the duplication is the price of running before the bundle.
- It must stay tiny. Every byte delays first paint.
- A strict Content Security Policy would block inline scripts. You would then add a hash or nonce for this one script.

**With server rendering**, the server can't read `localStorage`, so the usual approach is a cookie: the server reads it and renders `<html data-theme="dark">` directly. Libraries such as `next-themes` exist mainly to solve this problem. Being able to explain why is a good interview signal.

## The setting itself

The theme is one field of the persisted `Settings` ([chapter 6](06-persistence.md)), validated on load (`THEMES.includes(parsed.theme)`), and applied in two places: in `initialState()` when the store is created, and in `updateSettings` on change. The control is a segmented group of three native radio buttons (System, Light, Dark) in the Settings sheet. It replaced an earlier toolbar button that cycled through the three on each click. A cycling button has to announce both the current state and the next one ("Theme: System. Switch to Light"), and you can't see all the options at once. With three states that are all visible, radios are simpler and more honest. [Chapter 14](14-settings.md) covers that change.

## Exercises

1. Rewrite the dark tokens with `light-dark()` and `color-scheme`, removing the duplicate block. What happens in a browser without support? How would you provide a fallback?
2. Add a high-contrast theme. Which tokens are missing? Hint: focus rings and borders often need their own tokens.
3. Change the arm tints to `color-mix(in oklch, ...)` and compare the yellow and blue arms side by side in both themes.
4. The SVG board uses tokens through CSS classes. Find any colour hard-coded in a component instead (hint: the die's pips) and decide whether it should be a token.
5. Design question: three brands, each with light and dark, in one component library. Sketch the token layers and how a product team picks a brand at runtime.
