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

Pick 2 to 6 players, choose which arms they sit at, and set each seat to Human or Bot. Your arm is drawn at the bottom of the board.

- **Roll:** with Auto roll on (the default) your die rolls by itself. Otherwise press Space or tap the die.
- **Pick a marble:** marbles you can move glow. Tap one, or press its number (1 to 4). If it can only go one place, it moves straight away. With Auto move on, a roll that leaves no real choice plays itself.
- **Pick where it goes:** when a marble has several destinations (on a star, near the centre), each gets a numbered badge on the board, 1 being the one closest to home and the centre always last. Tap a badge or press its number. Hover or focus a badge to see the path; Esc goes back.
- Undo/redo (← →), pause (P), log (L), new game (N) and settings (S) are on the toolbar and the keyboard.
- Refreshing the page keeps your game: it comes back paused.

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
| R5 | Landing exactly on an opponent **bumps** it back to its base. Any hole except base and home can be bumped, including start holes, stars and the centre |
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

Team play is not supported yet (planned).

## Bots

Each bot gets a random persona every game (balanced, hunter, guardian or racer), with its weights nudged ±15% so no two bots play exactly alike. A bot scores every legal move and plays the best one, with a small random nudge on close calls. It weighs:

- what the move does: gets a marble home, bumps an opponent (more for a far-travelled one), brings a marble out, gains steps, lands on a star or in the centre;
- **danger**: the chance an opponent can bump the moved marble next turn, against how far that marble has come, plus credit for moving a threatened marble away;
- **attack**: how many opponents the moved marble could bump next turn.

Reach is worked out with the real move generator for every die value, so star hops, the centre exit and bumps on start holes all count.

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
- A move is chosen as **marble + destination**, because a marble on a star or in the centre can have several destinations. Legal moves are ordered with the destination closest to home first and the centre last; the UI numbers destinations in this order.

## Licence

Copyright (C) 2026 Sachin Kiran Shah.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).
