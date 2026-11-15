import { useState } from 'react'
import { ENTRY_ROLLS } from '../game/board'
import { BASE_ENTRY_CHANCE, BONUS_ROLL, COMEBACK_CAP, COMEBACK_GRACE, COMEBACK_STEP } from '../game/engine'
import { IS_TOUCH } from '../hooks/useShortcuts'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icons'
import { HOUSE_RULE_TEXT } from './houseRuleText'
import { Sheet } from './Sheet'

const pct = (x: number) => `${Math.round(x * 100)}%`
const [ENTRY_LOW, ENTRY_HIGH] = ENTRY_ROLLS

/**
 * The game rules in plain words. Numbers come from the engine's constants, so
 * the text cannot drift from what the game actually does.
 */
export function RulesContent() {
  const comebackDice = useGameStore((s) => s.settings.comebackDice)
  // In a game, the rules it was started with; on setup, the rules a new game would use.
  const houseRules = useGameStore((s) => s.game?.rules ?? s.settings.houseRules)
  const tap = IS_TOUCH ? 'Tap' : 'Click'

  return (
    <div className="rules">
      <section aria-labelledby="rules-short">
        <h3 id="rules-short">The short version</h3>
        <ol className="rules-steps">
          <li>
            Roll a <b>{ENTRY_LOW}</b> or a <b>{ENTRY_HIGH}</b> to bring a marble out of base.
          </li>
          <li>Race it clockwise round the board by the number you roll.</li>
          <li>Land on another player's marble to <b>bump</b> it back to their base.</li>
          <li>
            Get all <b>4 marbles home</b> first to win.
          </li>
        </ol>
      </section>

      <section aria-labelledby="rules-turn">
        <h3 id="rules-turn">Your turn</h3>
        <ul>
          <li>Roll the die, then move one marble by exactly that many holes.</li>
          <li>
            A <b>{BONUS_ROLL}</b> gives you another roll, even if you couldn't move.
          </li>
          <li>If you can move, you must. If no marble can move, your turn passes.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-moving">
        <h3 id="rules-moving">Moving and bumping</h3>
        <ul>
          <li>Every hole counts, empty or not.</li>
          <li>You can jump over other players' marbles, but never over your own.</li>
          <li>You can't land on your own marble.</li>
          <li>
            Land exactly on an opponent and it goes back to its base. Marbles are only safe in <b>base</b> and <b>home</b>, so
            start holes, stars and the centre are all fair game.
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-stars">
        <h3 id="rules-stars">Star shortcuts</h3>
        <ul>
          <li>
            If your marble <b>starts its turn on a star</b>, it can hop clockwise from star to star. Each star counts as 1.
          </li>
          <li>Stop on any star, or stop on one and walk the rest of your roll down that star's arm.</li>
          <li>Walking past a star doesn't count: you must begin the turn on it.</li>
          <li>You can circle the stars as long as you like, even past your own home.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-centre">
        <h3 id="rules-centre">The centre</h3>
        <ul>
          <li>
            <b>Getting in:</b> from a star your marble is sitting on, roll exactly a 1. Or, while walking, if your last step
            would leave a star, you can take it into the centre instead.
          </li>
          <li>
            <b>Getting out:</b> roll a 1 and jump to any star you like (one without your own marble on it).
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-home">
        <h3 id="rules-home">Getting home</h3>
        <ul>
          <li>Your home is the 4 holes in the middle of your arm. You turn in from the hole just before your start.</li>
          <li>You need the exact count to get in. Once inside, marbles can move further up.</li>
          <li>When all your marbles are home you finish. The others play on for the remaining places.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-teams">
        <h3 id="rules-teams">
          Teams <span className="rules-tag">4 or 6 players</span>
        </h3>
        <ul>
          <li>
            Play as <b>2 teams of 2</b>, or with 6 players as 2 teams of 3 or 3 teams of 2. Teammates sit apart, so turns
            go back and forth between teams.
          </li>
          <li>
            <b>Watch out for your teammates.</b> Landing on a teammate's marble bumps it back to base, just like an
            opponent's. It's allowed, but it sets your team back, so stay out of each other's way and save your bumps for
            the other team. The game marks a move that would bump a teammate.
          </li>
          <li>
            Once your marbles are all home you keep taking turns for your team. <b>Before you roll</b>, choose which
            teammate the roll is for, then move their marble. You can also <b>pass</b> if a roll might do more harm
            than good. Your choice holds for the whole turn: a {BONUS_ROLL} rolls again for the same teammate. If your
            move gets them home, the turn ends there.
          </li>
          <li>Online, your teammates can suggest who you should roll for. Their suggestions show on your buttons; you decide.</li>
          <li>A team finishes when everyone on it is home. The first team to finish wins, so help the teammate who is furthest behind.</li>
        </ul>
      </section>

      <section aria-labelledby="rules-comeback">
        <h3 id="rules-comeback">
          Comeback dice <span className="rules-tag">{comebackDice ? 'On' : 'Off'}</span>
        </h3>
        <p>
          If you have nothing on the board and miss {COMEBACK_GRACE} entry rolls in a row, your chance of a {ENTRY_LOW} or{' '}
          {ENTRY_HIGH} goes up by {pct(COMEBACK_STEP)} for each further miss, up to {pct(COMEBACK_CAP)} (normally it's{' '}
          {pct(BASE_ENTRY_CHANCE)}). It applies to bots too, and you can turn it off on the setup screen.
        </p>
      </section>

      <section aria-labelledby="rules-house">
        <h3 id="rules-house">House rules</h3>
        <p>Optional rules, chosen on the setup screen and fixed for the whole game.</p>
        <ul className="rules-house">
          <li>
            <b>{HOUSE_RULE_TEXT.rollSixesFirst.title}</b> <span className="rules-tag">{houseRules.rollSixesFirst ? 'On' : 'Off'}</span>
            <br />
            After a {BONUS_ROLL}, roll again straight away, and keep going until you roll something else. Then use every die,
            one at a time, on any marbles, in the order you choose. A die no marble can use is lost, so plan the order. Bringing
            a marble home ends your turn, even with dice left.
          </li>
          <li>
            <b>{HOUSE_RULE_TEXT.crossCentre.title}</b> <span className="rules-tag">{houseRules.crossCentre ? 'On' : 'Off'}</span>
            <br />
            A marble that <b>starts its turn on a star</b> may step into the centre and out to any star, as well as round the
            stars, in any mix, counting each step. It can never step straight back to the hole it just left. It can stop on a
            star, walk the rest down that star's arm, end in the centre, or even come back to where it started. A marble that
            starts in the centre still needs a 1 to leave.
          </li>
          <li>
            <b>{HOUSE_RULE_TEXT.safeStarts.title}</b> <span className="rules-tag">{houseRules.safeStarts ? 'On' : 'Off'}</span>
            <br />
            Only the owner is safe on a start hole: your marble can't be bumped off your own start. Another player can land
            there and share it with you, but they aren't safe: your next marble coming out of base bumps them, and so does any
            other player landing there. Nobody can share a hole with their own marble.
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-controls">
        <h3 id="rules-controls">Playing here</h3>
        <ul>
          <li>{tap} a glowing marble to move it.</li>
          <li>
            If it can go to more than one place, numbered circles show the choices. {tap} one to go there
            {IS_TOUCH ? ', or tap the marble again to go back.' : '. Press 1, 2, 3... or Esc to go back.'}
          </li>
          {IS_TOUCH && <li>The big numbered buttons under the board match the numbers on the marbles and circles. Press one to see which piece it means, and lift your finger to choose.</li>}
          <li>Auto roll, Auto move, sounds and the theme are in Settings (the gear button).</li>
        </ul>
      </section>
    </div>
  )
}

/** The rules in a sheet (phones) or dialog (wider screens). */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <RulesContent />
    </Sheet>
  )
}

/** A self-contained "Rules" button with its sheet, for screens outside the game. */
export function RulesButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tool" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="book" />
        <span>Rules</span>
      </button>
      <RulesSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
