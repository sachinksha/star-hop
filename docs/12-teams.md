# 12. Team play and deciding together online

Team play looks like a small feature ("some seats are on the same side") but it changes the meaning of a turn, touches every layer from rules to wire protocol, and raises a genuinely new design question: how do teammates on different devices make a decision together? This chapter follows that change through the code.

Code: [teams.ts](../src/game/teams.ts), team parts of [engine.ts](../src/game/engine.ts) and [rules.ts](../src/game/rules.ts), `chooseHelperTarget` in [bot.ts](../src/game/bot.ts), [nudges.ts](../src/net/nudges.ts), [TeamTurn.tsx](../src/components/TeamTurn.tsx), tests in [teams.test.ts](../src/game/teams.test.ts) and [nudges.test.ts](../src/net/nudges.test.ts).

## The rules, and why

| Rule | Decision | Reason |
| --- | --- | --- |
| R17 | 4 players as 2 pairs; 6 as 2 teams of 3 or 3 pairs. Seats alternate | Alternating seats means alternating turns, so no team gets two turns in a row, and partners sit opposite as in traditional partner games |
| R18 | Landing on a teammate bumps it, as with an opponent | The traditional rule. The first version blocked such landings instead, which felt kind but changed the game: a teammate became a wall. Allowing it and teaching players and bots to *avoid* it keeps the strategy of the original |
| R19 | A finished player keeps taking turns, choosing before the first roll which teammate the turn is for. The choice holds for bonus rolls, and a move that brings the teammate home ends the turn | Otherwise a finished player just watches. Choosing *before* the roll keeps it a decision, not a lucky pick after seeing the number. (The first version asked again after every 6; see "A rule that changed" below) |
| R20 | That player may pass | A forced move can wreck a teammate's safe position. Only finished players may pass, so the racing game is unchanged |
| R21 | A team finishes when all members have | The natural team goal |

Every rule above is a product decision, so each one is a README row, a test, and a line in the rules sheet. In a team setting you would agree these with the product owner *before* coding, which is why they are written down as a table.

## "Whose turn" is not "whose marbles"

Before teams, the player whose turn it was always moved their own marbles, so the code never had to tell the two apart. Now it does:

```ts
interface GameState {
  currentIndex: number          // who rolls: whose turn it is
  playingFor: Color | null      // whose marbles this roll moves, when a finished player rolls for a teammate
  ...
}

export function moverOf(state: GameState): Player {
  const roller = state.players[state.currentIndex]!
  if (!state.playingFor) return roller
  return state.players.find((p) => p.color === state.playingFor) ?? roller
}
```

The interesting part was finding every place that silently assumed the roller and the mover were the same. Code that reads "the current player" when it means "the player whose marbles move" was correct for the game's whole history, and suddenly wasn't:

- the move animation coloured and moved the **roller's** marble;
- auto move compared hole keys using the **roller's** colour (home holes are private per colour);
- bot scoring judged danger for the **roller's** marbles;
- the board highlighted the **roller's** arm and made their marbles pickable.

Each was a one-line fix, but finding them took a deliberate search for `currentIndex` and `players[...current...]`, reading each use and asking which of the two it meant. This is a classic **implicit coupling** bug class. Two concepts were always equal, so the code used one for both, and the day they differ, nothing fails at compile time. In an interview, "we introduced a distinct concept and audited every use of the old one" is a strong answer to "how do you extend a mature codebase safely?". A stronger one adds: "and the type system could enforce it next time" (see exercise 2).

## One decision, one action

How does a finished player's choice get recorded? Two options:

- A separate action, `{ type: 'choose', for: 'green' }`, then a normal roll.
- A field on the roll: `{ type: 'roll', value: 4, for: 'green' }`.

Star Hop uses the second. The choice and the roll are one decision from the player's point of view ("roll for Green"), so making them one action means:

- there is no half state ("chosen but not rolled") to save, sync, undo or show;
- the event log stays exact for replays, and a v1 roll is still a valid v2 roll (the field is optional);
- the engine validates the pair together: `rollWithValue` returns the same state if `for` is missing on a helper turn, names an opponent, or is set on a normal turn.

Passing is the one new action, `{ type: 'pass' }`, valid only on a helper turn.

Turn order needed one new idea: a seat **takes turns** while its side isn't done. "Side" means the team, or the seat alone in a solo game, so one function covers both:

```ts
export const takesTurns = (players: Player[], p: Player) => !sideDone(players, p)
```

The game-over rule generalised the same way: game over when at most one *side* still has unfinished members.

The safety net was the same as for everything else in this engine ([chapter 1](01-domain-modelling.md)). Seeded bot-only team games are played to the end, then **replayed from the action log and compared** with the live state. If the new field or action broke determinism anywhere, that test would fail.

## A rule that changed: the choice sticks for the whole turn

The first version cleared `playingFor` after every move, so a finished player who rolled a 6 for Green was asked again who the bonus roll was for. Playing it showed that wasn't how the game is played at a table: you commit to a teammate for your turn. Two changes:

- `playingFor` now survives the bonus roll and is cleared only when the turn passes, and `isHelperTurn` is true only while it is still unset. A bonus roll for the same teammate needs no `for` on the action.
- **A move that finishes the mover ends the turn**, whoever's marbles they were. Before, only a roller finishing their own marbles lost the bonus.

The test that encoded the old behaviour ("gives the roller another roll after a 6, choosing again") failed the moment the engine changed. That is the point of tests that state rules in plain words: when the specification changes, the failing test names exactly which promise you broke. It was rewritten to state the new rule. [Chapter 15](15-house-rules.md) follows this change and the house rules that came with it.

## The reserved field paid off

The first version of `Player` already had `team: number | null`, "always null until team play exists". That one line meant saved games, the network snapshot and the setup configs already had a slot. The remaining schema change, `playingFor` on `GameState`, needed a real save migration from version 1 to 2 ([chapter 6](06-persistence.md)) and a protocol version bump. Reserving a field is cheap when you know a feature is coming; the cost of not doing it is a migration in every place the shape is stored or sent.

## Bots: choosing whom to help

```ts
export function chooseHelperTarget(state: GameState): Color | null {
  for (const target of helperTargets(state)) {
    // average, over the six die faces, of the best move's score for this teammate (0 if no move)
  }
}
```

That is **expected value over the die**, reusing the existing move scorer with the roller's own persona. A hunter helps the teammate who could bump someone, and a racer helps the one nearest home. Bots never pass. Teammates are also removed from the danger calculation (`bumpRisk` skips anyone on the same side), since a teammate won't choose to bump you.

## Friendly fire: legal, but avoided

The first version of R18 made teammates' marbles impossible to land on. The traditional rule is that landing on a teammate bumps it like anyone else, so the rule was changed to match. The engine change was one deleted line in `toMove`. The interesting work was teaching everyone to avoid it:

- **The event says so.** A bump event carries `friendly: true` when the victim is a teammate, so the log reads "Red bumped teammate Green's marble" and the UI can react.
- **People are warned, not stopped.** The destination badge gets an amber dashed ring and the move button says "Teammate!", distinct from the red "Bump!" for an opponent. The spoken label says "Bumps your teammate Bo". The rules still allow it, because sometimes it's the only legal move and moving is compulsory (R7).
- **Bots value the team over the hit.** In `scoreMove`, a friendly bump is worth `-FRIENDLY_FIRE × value` (1.5 times the value of bumping an opponent, negated), so a bot only does it when every alternative is worse. Teammates' marbles are left out of the attack estimate, and a small "crowding" term (`teammateCrowding`) discourages parking where a teammate may need to land, the "don't get in each other's way" instinct.

**Measured, not assumed.** Six seeded 2-against-2 bot games, with and without the penalty:

| | Opponent bumps | Teammate bumps | Share friendly |
| --- | --- | --- | --- |
| Bots treat teammates like anyone | 204 | 58 | 22% |
| With the friendly-fire penalty | 127 | 4 | 3% |

The remaining 3% are positions where the friendly bump was the only legal move. The test suite keeps this honest with an assertion that friendly bumps stay under a tenth of opponent bumps.

## Deciding together online: suggestions, not chat

At a real table the discussion before a teammate rolls happens naturally: "roll for me, I'm one off home!", "no, pass, you'll break my block". Online, the roller is alone with a button. The request was to design for that.

**Options considered:**

| Option | Problem |
| --- | --- |
| Free-text chat | Moderation, abuse, safety for younger players, localisation, and typing on a phone takes longer than the turn should |
| Voting that binds the roller | Takes the decision away from the person whose turn it is, and needs quorum rules and timeouts |
| **Preset suggestions, shown as votes, advisory only** | Chosen |

What teammates see while a finished partner decides: **Roll for me**, **Roll for Bo** and **Pass this one**. What the roller sees: their normal buttons, each tagged with who asked ("Bo asked"). This is the "quick chat" or "ping" pattern from team games: fast, safe, language-light, and impossible to misuse.

Design properties, each a line or two of code:

- **Advice, never an action.** A nudge can't roll, move or pass. The roller always decides, and the host validates the roll as usual.
- **Expires on its own.** Each nudge is tagged with the action count it was given at (`seq`), exactly like the board's marble selection ([chapter 8](08-react-patterns.md)). The moment anything happens, it no longer matches and is no longer shown. No cleanup code.
- **One per person.** A new nudge replaces your previous one, so the list reads like votes, not a chat log.
- **Team only.** The host forwards nudges only to the roller's team (`shareNudges(teamColors(game), ...)`). Opponents never receive them.
- **Validated like everything from the network.** `acceptNudge` rejects opponents, the roller themselves, stale positions, and teammates who can't be rolled for. It is a pure function of the game state, which makes it trivial to test.
- **Not shown locally.** On one device, the players are sitting together and can just talk, so the UI doesn't add noise.

**The trust model, stated honestly:** the host's browser runs the game and relays everything, so the host *could* read the other team's nudges by inspecting memory. The same is true of every host-authoritative design without a server. Hiding them in the UI is the right default; real secrecy would need end-to-end encryption between teammates, which costs more than this feature is worth. Say that in an interview rather than claiming privacy you don't have.

## Protocol version 2

```ts
export const PROTOCOL_VERSION = 2   // team play
type Intent = { action: 'roll'; for?: Color } | { action: 'move'; ... } | { action: 'pass' }
type GuestMessage = ... | { t: 'nudge'; seq: number; nudge: Nudge }
type HostMessage  = ... | { t: 'nudges'; nudges: TeamNudge[] }
```

Bumping the version means an old guest and a new host refuse each other with a clear "refresh the page" message, rather than misreading messages. Since both sides load the same deployed bundle, that only happens around a deploy, but it fails loudly and cleanly. Each new field is parsed strictly (`isColor(raw.for)`), as the protocol treats all guest input as untrusted.

## Exercises

1. Trace one helper turn through every layer: `TeamTurn` button, `rollFor` in the hook, `performRoll`, the action, `rollWithValue`, `moverOf`, the animation, `applyMove`. Which layers needed changes, and which didn't notice?
2. Make "roller" and "mover" different types (a branded `RollerIndex` and `MoverColor`) so passing one where the other is expected is a compile error. Was it worth it?
3. Let a finished bot honour its human teammates' nudges when there are any. Where does that logic belong: bot, hook, or online store?
4. Add a 20-second decision timer for helper turns online, after which the roll goes to the most-requested teammate. What does that do to the "advice only" principle?
5. Design question: a game platform wants voice chat for teams. What changes about safety, consent, privacy and the trust model compared with preset nudges?
