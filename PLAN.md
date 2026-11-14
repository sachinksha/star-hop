# Star Hop: build plan

Star Hop is a browser marble race game for 2 to 6 players. It follows the traditional "marbles and a die" race rules of the Pachisi family: enter on a 1 or 6, race around the board, bump opponents back to base, and take shortcuts through the star spaces and the centre. It is built on the Ludo project's architecture ([../ludo-game/LEARNINGS.md](../ludo-game/LEARNINGS.md)).

**Name and look.** The game has its own name, its own visual design and its own vocabulary (an opponent is **bumped**). Only the traditional rules carry over, since game rules can't be owned.

**Decisions already made**

| Topic | Decision |
| --- | --- |
| Name | Star Hop |
| Board | Always the 6-arm board. With fewer players, unused arms stay empty and players pick which arms to sit at |
| Team play | Added after v1 (rules R17-R21 in the README). The reserved `team` field meant no engine rework: turns, blocking and game over gained team checks, and one new action (`pass`) plus a `for` field on rolls |
| Comeback dice | Kept, adapted to the 1-or-6 entry roll (see rule R13) |

---

## 1. Rules table (draft of the README's "Choices we made")

The ✔ rows come straight from the printed rules and the gathertogethergames page. The ⚑ rows are house decisions where the sources are silent or vague. **Please check the ⚑ rows.**

| # | Rule | Source |
| --- | --- | --- |
| R1 | Each player has 4 marbles, starting in their **base**. The board has 6 arms, a loop of 84 holes, 6 **star** holes (on the loop, where two arms meet) and one **centre** hole | ✔ (hole count is our geometry, §2) |
| R2 | Roll one die. A **1 or a 6** moves a marble from base onto your **start** hole. Not allowed if your own marble is on start. An opponent on your start is bumped | ✔ |
| R3 | Marbles move **clockwise** by the full die count. Every hole counts, occupied or not | ✔ |
| R4 | You may **jump over opponents** but never over your own marbles. You may not land on your own marble. This applies on the loop, on star hops and in home | ✔ |
| R5 | Landing exactly on an opponent **bumps** it back to its base. Any hole can be bumped: loop, start, stars, centre. Marbles can never be bumped in their base or home areas | ✔ (confirmed) |
| R6 | Rolling a **6** earns another roll, **even if no move was possible**. There is no three-sixes limit. Bumping an opponent does **not** earn another roll | ✔ (confirmed) |
| R7 | If any legal move exists you **must** make one. If none exists the turn passes, with an "oops" sound | ✔ |
| R8 | **Star hop:** a marble that *starts its turn* on a star may move star to star, clockwise, each star counting as 1. It may stop on any star (linger there), or stop on any star and walk the rest of the count down that star's arm. Passing a star mid-walk does not allow a hop | ✔ |
| R9 | Star hops may go **all the way round**, past your own home star and as many laps as you like, and the marble may stay on the stars for several turns (for example to wait for opponents). Walking down an arm from a star always continues clockwise; the walk only turns into home from your own pre-start hole | ✔ (confirmed) |
| R10 | **Centre in:** (a) a marble that starts its turn on a star enters the centre with a roll of exactly **1**; (b) a walking marble enters it when its last step would leave a star, by exact count (for example two holes before a star, roll 3: two steps to the star, then into the centre). Not straight after a star hop | ✔ (confirmed) |
| R11 | **Centre out:** needs a roll of exactly **1** on a later turn. The marble moves to **any star** you choose (not one with your own marble on it; an opponent there is bumped) | ✔ (confirmed) |
| R12 | **Home:** 4 holes, entered from the hole just before your start, by exact count, without jumping your own marbles. Marbles may move further up inside home. No overshooting | ✔ |
| R13 | **Comeback dice** (on by default, can be turned off, applies to bots too, shown to players): a player with nothing on the board (every unfinished marble in base) who has missed 3 rolls in a row gets a higher chance of a 1 or 6, +8% per further miss, capped at 60%. Fair odds are 33% | ⚑ (adapted from Ludo) |
| R14 | The **first player is chosen at random** when the game is created (recorded in the initial state), instead of a roll-off. Play then passes clockwise by arm | ⚑ |
| R15 | Play continues after the first finisher to rank every player. The game ends when one player is left, or early when only bots are still playing; unfinished players are ranked by progress | ⚑ (Ludo convention) |
| R16 | When a player finishes on a 6, they do not roll again: all 4 home holes are full, so nothing can move | ✔ (confirmed) |
| R17-R21 | Team play: 4 players in 2 teams, or 6 players in teams. Finished players roll for a teammate or pass; see the README | ✔ (added) |

---

## 2. Board geometry (our own design)

The arms are numbered 0 to 5 clockwise, each with its own colour (red, orange, yellow, green, blue, purple; our palette, not the photo's). The loop holes are numbered 0 to 83, with 14 per sector:

```
sector a (absolute 14a .. 14a+13), in travel order:
  14a+0        star S_a            (inner corner where arm a-1 meets arm a)
  14a+1..+5    inbound column      (5 holes, outward along arm a)
  14a+6        pre-start           (home entry: the next step is home slot 0)
  14a+7        START of arm a
  14a+8        post-start
  14a+9..+13   outbound column     (5 holes, back toward the centre)
```

**A marble's state is just the hole it is on.** Star hops can wrap round the board any number of times (R9), so "distance travelled" isn't meaningful. Instead:

- **Walking** always goes clockwise to the next loop hole, except from your own pre-start hole (`14a+6`), where the next step is home slot 0. A marble that has just entered on start (`14a+7`) is one hole *past* its pre-start, so it naturally goes round the whole loop.
- **Steps to home** are computed from the hole: `toHome(a, pos) = ((14a + 6 − pos) mod 84) + 1` steps to reach home slot 0. This is what the bots and end-early ranking use. Start is 84 steps away and pre-start is 1.
- The **home star** of arm `a` is `S_a` (absolute `14a`): walking from it leads down arm `a` to home in 7 steps. Walking from any other star `S_b` leads down arm `b`, past that arm's start, and round again.
- The **centre** is a separate spot. For ranking and bots its value is "one 1-roll away from any star" (a fixed estimate, tuned by simulation).

Positions on screen (SVG) live in `layout.ts`, separate from the rules (as in Ludo).

---

## 3. Key changes from Ludo

| Area | Ludo | Star Hop | Why it matters |
| --- | --- | --- | --- |
| Choosing a move | Pick a token (`tokenId`) | Pick a marble **and a destination**. A marble on a star or in the centre can have several destinations | The action, the intent, the UI and keyboard input all change |
| Board graph | A straight progress line | A loop with a home branch per arm, a ring of stars that can be circled freely, and the centre | `rules.ts` builds paths; each move carries its `path` for blocking checks and animation. Progress isn't monotonic, so "steps to home" is computed from the hole |
| Blocking | No blocks | Own marbles block every hole on the path | Checked against the path |
| Sharing a hole | Tokens stack | Never more than one marble per hole outside base | Strong invariant for the simulation |
| Safe squares | Stars and starts | None, except base and home | Bots have more danger to weigh |
| Extra rolls | 6, capture, finish | Only a 6 | Simpler |
| Seats | 2 or 4 | 2 to 6, on 6 arms | Setup, layout and protocol |

---

## 4. `types.ts` sketch

```ts
export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'   // arm order 0..5
export type PlayerKind = 'human' | 'bot'
export const MARBLES_PER_PLAYER = 4

export type Spot =
  | { kind: 'base' }
  | { kind: 'loop'; pos: number }        // absolute 0..83
  | { kind: 'center' }
  | { kind: 'home'; slot: number }       // 0..3

export interface Marble { id: number; spot: Spot }

export interface Player {
  color: Color; kind: PlayerKind; name: string; remote: boolean
  bot: BotProfile | null
  team: number | null                    // team play (R17-R21)
  marbles: Marble[]
  finishRank: number | null
  lastRoll: number | null
  dryRolls: number                       // comeback dice
}

export type MoveVia = 'enter' | 'walk' | 'hop' | 'center' | 'leaveCenter'
export interface Move {
  marbleId: number
  from: Spot; to: Spot
  path: Spot[]                           // every hole stepped on, ending at `to`
  via: MoveVia                           // 'hop' = used stars; 'center' = ends in the centre
  bumped: { color: Color; marbleId: number } | null
  reachesHome: boolean
}

export type Phase = 'roll' | 'move' | 'gameOver'
export interface GameState {
  players: Player[]; currentIndex: number
  dice: number | null; phase: Phase; legalMoves: Move[]
  winners: Color[]; actionSeq: number; events: GameEvent[]
}

export type GameEvent =
  | { type: 'roll'; value: number; color: Color }
  | { type: 'move'; move: Move; color: Color }
  | { type: 'bump'; color: Color; victim: Color }
  | { type: 'finish'; color: Color; rank: number }
  | { type: 'turnPass'; color: Color; reason: 'noMoves' }
  | { type: 'gameOver'; winners: Color[]; early?: boolean }
  | { type: 'takeover'; color: Color; from: string; to: string }

export type GameAction =
  | { type: 'roll'; value: number; actor: PlayerKind }
  | { type: 'move'; marbleId: number; to: Spot; actor: PlayerKind }   // must match a legal move
  | { type: 'end'; actor: PlayerKind }
  | { type: 'takeover'; color: Color; bot: BotProfile; actor: PlayerKind }

export type PlayerConfig = { color: Color; kind: PlayerKind; name?: string; remote?: boolean; team?: number }
```

The engine API matches Ludo: `createGame(configs, rng)`, `applyAction` (returns the same state object for an illegal action), `rollFor(state, rng, comeback)`, `autoMove(legalMoves)` (non-null only when every legal move gives the same resulting position), `endGame` and `takeover`.

---

## 5. Feature checklist: what carries over

**Carried over unchanged:** at least one human; name validation; remembered setup; auto roll (on by default); undo/redo (local only); game log from events; pause and auto-pause (local only); synthesised sound with mute; game clock; touch-aware prompts; celebration for each finisher; end-early offer; win overlay; confirm dialog for abandoning a game; all of the online section (invite link with 5-minute expiry, lobby, host authority, seat secrets, reconnect, bot takeover with a notice, end/new online game, TURN); accessibility; reduced motion; safe `localStorage`; lazy PeerJS; "Choices we made" table.

**Adapted:**

| Item | Change |
| --- | --- |
| 2 or 4 seats | 2 to 6 seats on 6 arms. Default arms are spread evenly (2 → opposite arms, 3 → every other arm) |
| Pick colours ("third pick replaces the oldest") | Generalised: choose N arms; picking one more replaces the oldest pick |
| Automatic moves | "Equivalent" now compares destinations as well. Entering from base is automatic; choices involving the centre or star hops always wait for the player |
| Keyboard 1–4 | Two steps (see §5a): 1–4 picks a marble, then numbered badges on the board pick its destination |
| Comeback dice | Boosts the chance of a 1 or 6 instead of a 6 (R13) |
| Bot personas | Same 4 personas and the same ±15% jitter and noise. New scoring features: value of taking a shortcut, risk of getting stuck in the centre (a 1 is needed to leave), and threat to stars and the centre. Threat is computed with the real move generator for each die value, not hand-written reach maths |
| Online intent | `{ action: 'move', marbleId, to: Spot }`, strictly parsed. `PROTOCOL_VERSION` restarts at 1. The seat model gets 6 colours |

**Does not fit:**

| Ludo item | Reason |
| --- | --- |
| Three sixes forfeit the turn | Not in these rules (R6) |
| Extra roll for a capture or a finish | Only a 6 earns an extra roll here |
| Safe squares and stacked tokens | No safe holes on the loop, and two marbles never share a hole |

**Added for this game:** an "oops" sound (a short falling two-note blip) when a roll leaves no legal move.

### 5a. Choosing marble and destination

Where a marble can end up:

| Marble is | Roll | Destinations |
| --- | --- | --- |
| In base | 1 or 6 | Start |
| Walking, with the last step leaving a star | exact | The next hole down the adjacent arm, **or** the centre |
| On a star | 1 | The next hole down this star's arm, the next star, or the centre |
| On a star | 2–6 | Hop `h` stars (h = 0…roll), then walk `roll − h` down that star's arm. h = roll means stopping on a star. Up to 7 options |
| In the centre | 1 | Any of the 6 stars |
| Anywhere else | any | One hole (or none) |

Some options drop out because your own marble is in the way.

**Mouse/touch:** tap a marble. If it has one destination it moves at once. Otherwise every destination shows a numbered badge, and the marble's path is previewed when you hover or focus a badge. Tap a badge to move there, tap the marble again or press Esc to cancel.

**Keyboard:**
1. Press **1–4** to pick a marble (a marble with no legal move just shows a short hint). If it has exactly one destination, it moves at once.
2. Otherwise badges **1…N** appear (N ≤ 7). Press a number to move there, or **Esc** to go back to step 1. While badges are showing, the digit keys pick destinations, not marbles.
3. Numbering is predictable: **1 is the destination closest to your home** (fewest steps left), then further away; **the centre is always last**. When leaving the centre, 1 is your home star.

The prompt line names the step ("Pick a marble: 1–4", "Pick where: 1–5, Esc to go back"), and screen readers hear each badge's meaning ("3: hop 2 stars, then 4 holes down the blue arm, bumps Bot 2").

**Auto-play (as in Ludo):** with auto roll on, the die rolls itself. If the roll leaves no real decision, meaning every legal move gives the same resulting board (for example several base marbles that can all only enter start), the move is played automatically. Any choice between destinations always waits for the player.

**Added from "What to do differently":** `noUncheckedIndexedAccess` from the first commit; deploy plus a TURN check early; the game screen split from the start (`useShortcuts`, toolbar, banners); local games saved through the action log so a refresh keeps the game; a board text description for screen readers ("Your marbles: base 2, loop hole 14, home slot 1").

---

## 6. Phases

Each phase ends with passing tests, a clean lint, and a commit (when you ask for one).

**Status (2026-11-13):** phases 0 to 7 are done in code, with 201 tests passing. Deployed on Vercel (being renamed to star-hop) with TURN working. Still to do for phase 7: the manual test of a phone on mobile data against a laptop on Wi-Fi. Then phase 8 (docs).

| Phase | Work | Done when |
| --- | --- | --- |
| **0. Scaffold** | Copy configs from Ludo (tsconfig with `noUncheckedIndexedAccess`, `vite.config.ts` with `turnApi`, Vitest setup, oxlint, `.gitignore`, `.vercelignore`, `.env.example`), `api/turn.ts` and its test, `LICENSE` (GPL-3.0, copyright updated), `package.json` named `star-hop`. Placeholder page | `npm test` and `npm run build` pass. **You:** create the Vercel project and set `TURN_CREDENTIALS_URL`; `/api/turn` returns `turn:` URLs |
| **1. Rules and types** | Rules table into the README; `game/types.ts` | You approve the ⚑ rules |
| **2. Engine** | `board.ts` (geometry, progress ↔ absolute), `rules.ts` (paths, blocking, hops, centre, home, legal moves), `engine.ts`, `history.ts`, `names.ts`, `describe.ts` | One test per rule (R2–R16) on hand-built positions; geometry tests; seeded simulation of hundreds of bot-only 2–6 player games with invariants checked after every action (at most one marble per hole, 4 marbles each, home marbles never leave, unique ranks, games finish within a cap) |
| **3. Bots** | `bot.ts` personas and features | Position tests (always take a win or a bump of a far-travelled marble; avoid the centre when a persona should); simulation win rates per persona |
| **4. Store and pipeline** | `gameStore.ts` (with local game persistence), `history.ts`, `useStarHopGame.ts` (busy lock, `later()`, scheduler, exported `TIMING`); animation follows `move.path` (star arcs, a jump into the centre) | Hook tests with staged fake timers |
| **5. UI** | Original SVG board (`layout.ts`, `Board.tsx`), destination markers, setup with the arm picker, panels, dice, win overlay, game screen split into parts, board text description | Playable locally; component tests by role |
| **6. Polish** | Rest of the checklist: sounds, celebrations, notices, shortcuts, touch, reduced motion, pause | Checklist ticked |
| **7. Online** | Copy `net/`, `onlineStore.ts`, lobby and join screens; adapt the intent and seats | `MemoryNetwork` tests pass, **plus a manual test: phone on mobile data ↔ laptop on Wi-Fi** |
| **8. Docs** | README (features, choices, online setup, limitations), study guide notes on what's new (graph moves, destination choice), and an updated LEARNINGS | Done |

**Copy strategy:** copy files from `../ludo-game` as they are needed in each phase (Ludo's "copy almost as is" list), rather than building a shared package. LEARNINGS advises extracting shared code only after the second game proves what is common, so this is that second game.

**Main risks:**
1. Choosing a destination is new UX. Keep it to one tap when there is only one destination, and show tappable markers when there are several.
2. Bot danger is costlier to compute (stars and the centre widen reach). Measure it in the simulation and cache per turn if needed.
4. Because star hops can circle freely, a game could in theory never end. Bots must value getting home over circling, and the simulation asserts that every seeded game ends within an action cap.
3. Six seats need a lot of screen room on phones. Lay out the panels around the board early, in phase 5.
