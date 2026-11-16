# Star Hop

A browser marble race game for 2 to 6 players, built with React, TypeScript, Vite and Zustand. Bring your four marbles out of base, race them round the board, take shortcuts across the stars and through the centre, bump opponents back to base, and get all four home first.

Star Hop belongs to the traditional family of marble-and-die race games (descended from Pachisi). It is built on the architecture of the author's Ludo game. Status and next steps are in [PLAN.md](PLAN.md).

## Quick start

```sh
npm install
npm run dev     # local dev server
npm test        # all tests
npm run build   # typecheck and production build
```

## How to play

Pick 2 to 6 players, choose which arms they sit at, and set each seat to Human or Bot. The seats are laid out around a small picture of the board, exactly as the game will show them, with your seat at the bottom. To play a particular colour (and, in teams, a particular team), tap **Sit here** on that seat or empty arm: you swap places with whoever sat there and keep your name. The arrows beside the little board move everyone one seat round, keeping the team pattern. **Add a seat** on an empty arm uses it instead of the oldest other seat (never yours). Each seat's menu sets Human, Bot or Online. With 4 or 6 players you can also play in **teams** (see below). Your arm is drawn at the bottom of the board.

- **Roll:** press Space or tap the die. With Auto roll on (off by default; turn it on in Settings) your die rolls by itself.
- **Pick a marble:** marbles you can move glow. Tap one, or press its number (1 to 4). If it can only go one place, it moves straight away. With Auto move on (off by default), a roll that leaves no real choice plays itself.
- **Pick where it goes:** when a marble has several destinations (on a star, near the centre), each gets a numbered badge on the board, 1 being the one closest to home and the centre always last. Tap a badge or press its number. Hover or focus a badge to see the path; Esc goes back.
- **Rules:** the Rules button (on setup, the join screen and the toolbar) or **?** opens a plain-language summary. On phones it is a bottom sheet you can swipe down to close. Reading the rules pauses a local game.
- **On a phone:** big numbered **move buttons** appear under the board, matching the numbers on the marbles and destination circles. Press one to see which piece it means; lift to choose, or slide off to cancel. Taps that miss a small piece go to the nearest piece you can use, unless two are about equally close. Turn the buttons on or off in Settings.
- **Keyboard:** Space rolls; 1–4 picks a marble and 1–9 a numbered hole; **← →** (or ↑ ↓) step through the marbles or holes you can choose, previewing each path, and **Enter** chooses, so even a dozen destinations are all reachable; Esc goes back; **D** switches die when several are banked; in team play a finished player presses **1, 2…** to roll for a teammate (Space if there is only one) or **0** to pass, and online teammates use the same keys to suggest. Keyboard help is hidden on phones. P pauses, L shows the log, ? opens the rules, S settings, G the Game menu, N restarts.
- **Game menu** (the flag button, or G): **Restart** starts the same game again from the beginning (same players, seats and house rules); **Set up a new game** goes back to setup, prefilled, to change anything. Online, the host can restart for everyone or end the online game, and a guest can leave. Each asks before discarding a game in progress.
- **Undo** is off by default. Turn on "Undo and redo" in Settings to show the buttons (local games only; Ctrl+Z and Ctrl+Y or Ctrl+Shift+Z). Each undo goes back one step: first your move, back to the same roll so you can choose differently; then the roll itself. An undone move or roll isn't replayed automatically.
- Refreshing the page keeps your game: it comes back paused.

### Settings

The gear button (on setup, the join screen and in the game) opens Settings. Opening it pauses a local game.

- **Playing:** Auto roll, Auto move, Undo and redo, move buttons (on phones, meaning any touch screen or narrow window, which is the default; always; or never).
- **Sound:** on or off, volume, and a **sound style**: Tabla (the default), Classic, Bansuri (flute), Sitar or Santoor. Each style has a play button for a sample, and "Try each sound" plays every game sound in the chosen style.
- **Look:** System, Light or Dark theme.
- **Undo and redo:** off by default (see above).

Settings holds only preferences that can't lose a game. Restarting and leaving live in the **Game** menu.

Everything except the game actions is remembered between visits. **Reset all settings to defaults** (at the bottom of the preferences) puts them back, including the house rules for new games. Defaults: auto roll and auto move off, all house rules on, Tabla sounds, System theme, move buttons on phones.

### House rules

Three rules from childhood games, **on by default**, each with a checkbox in the **House rules** section of the setup screen (next to Comeback dice). They are fixed for the whole game, apply to bots too, and are shown in the rules sheet and in the Game menu.

- **Roll all your sixes first (R22):** after a 6 you keep rolling, and the dice are banked ("Banked: ⚅ ⚅"). Then you choose which die to use for each move: tap a die (or press **D**) to switch, then pick a marble as usual. Plan the order: a die nothing can use is lost.
- **Walk across the centre (R23):** a marble starting on a star can go through the centre to any star, round the stars, or a mix, then down an arm. A single roll can offer a dozen destinations; the move buttons wrap onto extra rows.
- **Safe start holes (R24):** your start hole is safe for you. Others can share it with you, but only you are safe there: your next marble out of base bumps a visitor, and so does any other player landing on it. Marbles sharing a hole are drawn smaller, side by side.

Bots understand all three. With several dice banked they plan the order with a short look-ahead (trying the most promising moves for each die in turn), in their own persona's style.

### Teams

With 4 players you can play as 2 teams of 2; with 6, as 2 teams of 3 or 3 teams of 2. Teammates sit alternately round the board, so turns alternate between teams.

- Landing on a teammate's marble bumps it, just like an opponent's (the traditional rule). It's legal but sets your team back: the board marks such moves in amber ("Teammate!"), and bots avoid them unless there's no other move.
- When your marbles are all home you keep your turns: before rolling, choose which unfinished teammate the turn is for (or **pass**), then move their marble. The choice holds for the whole turn, bonus rolls included.
- Online, teammates can **suggest** who you should roll for, or that you pass. Suggestions show on your buttons like votes; only your team sees them, and you decide.
- The first team with everyone home wins.

## Online play

Play with friends on their own devices: no accounts, just a name.

1. On setup choose **Online (invite link)**, set one or more seats to **Online friend** (click a seat to cycle Human → Bot → Online friend), and press **Create invite link**.
2. Copy or share the link. It admits new players for **5 minutes** (a countdown shows), and **Reset link** makes a fresh one. Each friend who opens it types a name and takes the next open seat.
3. Press **Start game** when everyone is in, or **Start now** to let bots take the empty seats.

How it works:

- **Browser to browser.** Moves travel over an encrypted WebRTC data channel. A free public PeerJS server only introduces the browsers, and a TURN relay (from `/api/turn`) helps when networks cannot connect directly, such as a phone on mobile data.
- **The host's browser runs the game.** Guests send requests ("roll", "move marble 2 to this hole"); the host checks each against the rules and the turn, rolls the die, and sends the result to everyone. Guests cannot fake dice or move out of turn.
- **Dropped connections.** A guest who refreshes or loses connection rejoins the same seat automatically (even after the link expired). The host sees "lost connection" with **Let a bot play**; when a bot takes over, the seat is renamed "Bot N" and everyone gets a notice.
- **Team suggestions.** Before a finished teammate rolls, the others on the team can tap "Roll for me", "Roll for …" or "Pass this one". The host checks each suggestion and forwards it to that team only. They are advice, and they expire as soon as anything happens on the board.
- **Host controls.** Only the host can pause, start a new game with the same people, or end the online game. Undo is off online, and online games never pause by themselves.
- **Limits.** If the host closes their tab, the game ends. The host could in principle cheat, so play with people you know.

## The board

Six arms around a ring of stars, with one hole in the middle:

- **Base**: each player's 4 marbles start here.
- **Loop**: 84 holes shared by everyone, travelled clockwise. Each arm has a **start** hole, and just before it the **pre-start** hole that leads into that player's home.
- **Stars**: 6 loop holes where two arms meet. Your **home star** is the one just before your own arm.
- **Centre**: one hole, linked to every star.
- **Home**: 4 private holes per player.

## Choices we made

Rules marked *house rule* are where the traditional rules are silent or vague. The rest follow them.

| # | Rule |
| --- | --- |
| R1 | 2 to 6 players, 4 marbles each, one six-sided die. The board always has 6 arms; unused arms stay empty |
| R2 | A **1 or a 6** moves a marble from base to your start hole. You can't do this while your own marble is on start. An opponent on your start is bumped |
| R3 | Marbles move clockwise by the full count. Every hole counts, whether occupied or not |
| R4 | You may jump over opponents, never over your own marbles, and you can't land on your own marble. This applies everywhere: on the loop, across stars and in home |
| R5 | Landing exactly on an opponent **bumps** it back to its base. Marbles can never be bumped in their base or home areas. Everywhere else can be bumped, including start holes (start is not part of base), stars and the centre |
| R6 | A **6** earns another roll, even if it allowed no move. There is no limit on sixes in a row. Bumping does not earn another roll |
| R7 | If you can move, you must. If you can't, the turn passes (with an "oops" sound) |
| R8 | **Star hop:** a marble that *starts its turn* on a star may move star to star clockwise, each star counting as 1. It may stop on any star, or stop on one and walk the rest of the count down that star's arm. Walking *past* a star never allows a hop |
| R9 | Star hops may go all the way round, past your own home star, and a marble may stay on the stars as long as you like, for example to lie in wait. A marble only turns into home when it walks off your own pre-start hole |
| R10 | **Into the centre:** from the star your marble is sitting on, with exactly a **1**; or when walking, if the last step of your count would leave a star, by exact count. Not straight after a star hop |
| R11 | **Out of the centre:** only with a **1**, onto any star you choose, except one with your own marble on it |
| R12 | **Home** is entered from your pre-start hole, by exact count, without jumping your own marbles. Marbles may move further up inside home |
| R13 | **Comeback dice** (*house rule*, on by default, can be turned off, same for bots): if you have nothing on the board and miss 3 entry rolls in a row, your chance of a 1 or 6 rises by 8% per further miss, up to 60% (fair odds are 33%) |
| R14 | The first player is picked at random (*house rule*, instead of a roll-off). Play passes clockwise |
| R15 | Play continues until everyone is ranked (*house rule*). When only bots are left you can end the game early, and unfinished players are ranked by progress |
| R16 | A player who finishes on a 6 does not roll again: with all 4 marbles home, every home hole is full and nothing can move (*house rule*) |
| R17 | **Teams** (optional): 4 players as 2 pairs, or 6 players as 2 teams of 3 or 3 pairs. Seats alternate between teams round the board |
| R18 | Landing on a teammate's marble **bumps it**, as with an opponent (the traditional rule), including on your start hole. Teammates can be jumped like anyone else. It is legal but best avoided: the UI flags such moves and bots avoid them |
| R19 | A player with all marbles home keeps taking turns while a teammate is still playing. Before their first roll they choose which unfinished teammate the turn is for, and move that teammate's marbles. The choice holds for the whole turn: a 6 rolls again for the same teammate. A move that brings the teammate (or the player) home ends the turn, even with a bonus roll or dice left. Comeback dice follow the teammate whose marbles move |
| R20 | On such a turn the player may **pass** instead of rolling (*house rule*). Players who are still racing can't pass |
| R21 | A team finishes when all its members have. Play continues until at most one team is left, which is ranked last; ending early ranks teams by their last member's place |
| R22 | **Roll all your sixes first** (*house rule*, on by default): after a 6, roll again straight away until a roll isn't a 6. Then use the dice one at a time, on any marbles, in any order. Each step you must use a die if any can move; dice the chosen order leaves unusable are lost. Bringing your last marble home ends the turn. No extra roll after using a 6 (the bonus rolls were already made) |
| R23 | **Walk across the centre** (*house rule*, on by default): a marble that starts its turn on a star walks a network of the stars and the centre, one hole per step: clockwise star to star, star to centre, centre to any star, never straight back to the hole it just left, and never past its own marbles. It may stop on a star and walk the rest down that star's arm, end in the centre, or come back to its own star. A marble starting in the centre still needs a 1 |
| R24 | **Safe start holes** (*house rule*, on by default): a marble can't be bumped off its owner's start hole. Another player may land there and share it with the owner. The owner bringing a marble out of base still bumps whoever sits on their start. Nobody shares a hole with their own marble, and a visitor on someone else's start is not safe |

**Online:** undo is off, and games never pause by themselves (one player switching tabs would stop everyone).

## Bots

Each bot gets a random persona every game (balanced, hunter, guardian or racer), with its weights nudged ±15% so no two bots play exactly alike. A bot scores every legal move and plays the best one, with a small random nudge on close calls. It weighs:

- what the move does: gets a marble home, bumps an opponent (more for a far-travelled one), brings a marble out, gains steps, lands on a star or in the centre;
- **danger**: the chance an opponent can bump the moved marble next turn, against how far that marble has come, plus credit for moving a threatened marble away;
- **attack**: how many opponents the moved marble could bump next turn.

Reach is worked out with the real move generator for every die value, so star hops, the centre exit and bumps on start holes all count.

In team play bots work as a team: a move that would bump a teammate scores 1.5 times worse than bumping an opponent would score well, teammates are never counted as targets or threats, and parking on a hole a teammate may need to land on costs a little. In seeded bot games that cut teammate bumps from 22% of all bumps to 3% (only when no other move was legal). A finished bot rolls for the teammate whose best move is worth most on average over the six die faces. Bots never pass.

| Persona | Style |
| --- | --- |
| Balanced | A bit of everything |
| Hunter | Chases bumps, parks within reach of opponents, takes risks |
| Guardian | Avoids holes opponents can reach; uses the centre only when it saves a lot |
| Racer | Pushes lead marbles home and loves shortcuts |

In tests every persona beats a random mover in at least 75% of 2-player games. In bot-only tournaments the personas win at roughly fair rates: 40–57% each with 2 players (fair is 50%), 18–39% each with 4 players (fair is 25%).

## Architecture

The design is the same as the Ludo game's (see `LEARNINGS.md` in that project):

- **Event sourced:** a game is its initial state plus a list of actions. Die values are stored in the actions, so undo, replays and online sync are exact.
- **Pure rules core** in [src/game/](src/game/): no React, no DOM, no timers. Randomness is injected (`rng`).
  - [board.ts](src/game/board.ts): geometry (holes, stars, steps to home).
  - [rules.ts](src/game/rules.ts): every legal move with its path, including blocking, hops and the centre.
  - [engine.ts](src/game/engine.ts): turns, bumping, finishing, comeback dice, ending early, bot takeover.
  - [bot.ts](src/game/bot.ts): personas and move scoring.
  - [teams.ts](src/game/teams.ts): team helpers shared by the engine, bots and UI.
- **Sound** in [src/audio/](src/audio/): every theme is synthesised with Web Audio (no audio files). [synth.ts](src/audio/synth.ts) has the building blocks (Karplus-Strong strings, tabla strokes, a breathy flute); [themes.ts](src/audio/themes.ts) is where to tweak a theme.
- A move is chosen as **marble + destination**, because a marble on a star or in the centre can have several destinations. Legal moves are ordered with the destination closest to home first and the centre last; the UI numbers destinations in this order.

## Learning guide

[docs/](docs/README.md) is a study guide that uses this codebase to prepare for senior and principal frontend interviews. It builds on the Ludo game's guide and covers what is new here: graph-shaped domain modelling, SVG geometry, the native-`<dialog>` bottom sheet, a mobile debugging case study, theming, persistence, probability in the bots, React patterns, modern tooling, touch-target design, team play with collaborative online decisions, sound synthesis, settings design, and how the codebase adapted when house rules were added. [LEARNINGS.md](LEARNINGS.md) records the house rules precisely and how to carry them to the Ludo game.

## Licence

Copyright (C) 2026 Sachin Kiran Shah.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).
