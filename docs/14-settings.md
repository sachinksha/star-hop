# 14. Settings and information architecture

As features arrived, each new preference got a toolbar button: auto roll, auto move, sound, theme, then "settings" (which actually meant "leave for setup") and "new game". On a phone the toolbar wrapped onto two rows. Some buttons changed a preference instantly; others ended the game. This chapter is about reorganising that, which is mostly a question of **information architecture**: what goes where, and why.

Code: [SettingsSheet.tsx](../src/components/SettingsSheet.tsx), the toolbar and `gameSection` in [GameScreen.tsx](../src/components/GameScreen.tsx), settings in [gameStore.ts](../src/store/gameStore.ts).

## Sort by consequence, not by topic

Every control falls into one of three groups, depending on what happens if you press it by mistake:

| Group | Examples | What a mistake costs | Where it lives |
| --- | --- | --- | --- |
| **Moment-to-moment game controls** | Undo, redo, pause, rules | Nothing, or one undo | Toolbar, always visible |
| **Preferences** | Auto roll, auto move, move buttons, sound, volume, sound style, theme | Nothing: change it back | Settings sheet, applied instantly |
| **Game-ending actions** | New game, change setup, end online game, leave | The whole game | Settings sheet, in a separate "This game" section, always confirmed |

The toolbar went from ten controls to five and fits on one row on a phone. Inside Settings, the "This game" section sits at the bottom, with a tinted border, a sentence saying what these do ("These end or restart the game, so they always ask first"), and a confirmation for each. This is the same pattern as the "danger zone" at the bottom of a repository's settings page on GitHub: destructive actions are findable but never next to the everyday ones.

Two smaller decisions:

- **The same sheet everywhere.** Setup, the join screen and the game all open the same Settings. Only the game passes a `gameSection`, so the danger zone exists only where there is a game to end. That is composition through a slot prop: `SettingsSheet` knows nothing about games.
- **Comeback dice stayed on the setup screen.** It changes the *rules*, so it belongs with the other choices made before a game, not among preferences that can change mid-game.

## Opening settings mid-game pauses it

Changing the theme shouldn't cost a turn while bots keep playing. The rules sheet already paused a local game while open ([chapter 8](08-react-patterns.md)); that logic was generalised from one sheet to "whichever sheet is open":

```ts
type OpenSheet = 'rules' | 'settings' | null
const pausedForSheet = useRef(false)   // did *opening the sheet* pause the game?
```

Closing resumes only if opening paused it, so a game the player paused stays paused. Online games never pause for one player.

## Native controls first

Each control is the native element with the right semantics, styled:

| Control | Element | Why |
| --- | --- | --- |
| On/off preference | `<button role="switch" aria-checked>` | Screen readers say "switch, on". Its tap area is 44px even though the track is small |
| Theme, move buttons | A `<fieldset>` of native radios, styled as a segmented control | Arrow keys, grouping and "1 of 3" announcements for free. `.segment:has(input:checked)` styles the label from the radio's state with no JavaScript |
| Volume | `<input type="range">` with `aria-valuetext="80%"` | Announces a percentage, not "0.8" |
| Sound style | Radio cards, each with a separate play button | Choosing and previewing are different actions, so they get different controls |

The theme control used to be a single toolbar button that cycled System → Light → Dark. A cycling button hides two of the three options and has to announce both states ("Theme: System. Switch to Light"). With room in a sheet, three visible radios are simply clearer. **The right control depends on how much space you have**, which is why the same setting can be designed differently for a toolbar and for a settings page.

### A bug in the "visually hidden" radio

The first version had a bug: scroll Settings to the bottom, change the theme, and the whole sheet jumped up, the header vanished and an unusable blank area appeared below the content.

The cause was two ordinary-looking CSS rules interacting:

1. The hidden radio inside each segment was `position: absolute; opacity: 0`, but `.segment` wasn't positioned. So the radio's **containing block** was the nearest positioned ancestor: the `<dialog>` itself, *outside* the scrolling `.sheet-body`.
2. Choosing an option focuses its radio, and the browser scrolls a focused element into view. It scrolls the element's scroll containers, and because the radio's containing block was the dialog, that meant the dialog. `.sheet` had `overflow: hidden`, and **an `overflow: hidden` box can still be scrolled** by script or by focus. It only hides the scrollbars.

Measured in the browser, the dialog had scrolled 432px down inside itself. The fix has two layers:

```css
.segment { position: relative; }   /* the radio stays inside the scrolling body */
.sheet { overflow: hidden; overflow: clip; }   /* clip: no scrolling at all, even programmatic */
```

`overflow: clip` (on all major browsers since 2022) forbids every kind of scrolling, so the dialog can never be scrolled this way again, whatever is inside it. `hidden` comes first as a fallback for older browsers. Things worth remembering from this:

- **Visually hidden inputs need a positioned parent.** The common "sr-only" and custom-radio patterns all assume one.
- **`overflow: hidden` is not "unscrollable".** Use `clip` when you mean it.
- **jsdom can't catch this.** It has no layout. The reproduction was a browser script that read `dialog.scrollTop` before and after, which is the case for a few real-browser end-to-end tests in CI.

## Settings that evolve without migrations

Three settings were added (`soundTheme`, `volume`, `moveButtons`) with **no version bump**. Settings are loaded key by key over defaults ([chapter 6](06-persistence.md)):

```ts
if (SOUND_THEME_IDS.includes(parsed.soundTheme)) settings.soundTheme = parsed.soundTheme
if (typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1) settings.volume = parsed.volume
```

An old save lacks the keys and gets the defaults. A bad value (an unknown theme, a volume of 7) is ignored. There is a test for each case. Compare the game save, a structured document, which *did* need a real migration in the same release. Know when each policy applies: flat, independent preferences can merge; structured documents need versions.

## Stacking modals: a lesson from the top layer

"New game" inside Settings must ask for confirmation. The first idea was to show the confirm dialog on top of the open sheet. It didn't work, and the reason is worth knowing.

The Settings sheet is a native `<dialog>` opened with `showModal()`, so it lives in the browser's **top layer**, above every `z-index` in the page ([chapter 3](03-bottom-sheet.md)). `ConfirmDialog` is an older `div` with `position: fixed` and a z-index. **No z-index can put a normal element above the top layer**, so the confirm would have opened *behind* the sheet, and the inert background would have made it unclickable.

Two fixes:

1. Make `ConfirmDialog` a native `<dialog>` too. Each `showModal()` goes on top of the previous one, and stacking works.
2. Close the sheet first, then confirm.

Star Hop does the second (`fromSettings(action)` closes, then calls the action), because it is also better UX on a phone. The sheet would otherwise cover most of the screen behind a small confirm. The first is on the "what would you change" list ([chapter 10](10-interview-prep.md)). Mixing modal implementations is a classic source of stacking bugs in large apps, and "all overlays use the same layer system" is a design-system rule worth stating.

## Exercises

1. Convert `ConfirmDialog` to a native `<dialog>` and make the confirm open on top of the Settings sheet. Which of the two flows do you prefer on a phone, and why?
2. Add a "Reset to defaults" button. Which group does it belong to, and does it need a confirmation?
3. The sound preview plays even when sound is off. Write the product rule down, then argue the other side.
4. Add a high-contrast theme option ([chapter 5](05-theming.md)). Does the segmented control still fit at 320px? What would you switch to if not?
5. Design question: a product with 60 settings across web and mobile apps. How do you organise, search and sync them, and which ones should never sync between devices?
