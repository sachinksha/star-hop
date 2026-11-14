import { useState } from 'react'
import { ENTRY_ROLLS } from '../game/board'
import { BASE_ENTRY_CHANCE, BONUS_ROLL, COMEBACK_CAP, COMEBACK_GRACE, COMEBACK_STEP } from '../game/engine'
import { IS_TOUCH } from '../hooks/useShortcuts'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icons'
import { Sheet } from './Sheet'

const pct = (x: number) => `${Math.round(x * 100)}%`
const [ENTRY_LOW, ENTRY_HIGH] = ENTRY_ROLLS

/**
 * The game rules in plain words. Numbers come from the engine's constants, so
 * the text cannot drift from what the game actually does.
 */
export function RulesContent() {
  const comebackDice = useGameStore((s) => s.settings.comebackDice)
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

      <section aria-labelledby="rules-controls">
        <h3 id="rules-controls">Playing here</h3>
        <ul>
          <li>{tap} a glowing marble to move it.</li>
          <li>
            If it can go to more than one place, numbered circles show the choices. {tap} one to go there
            {IS_TOUCH ? ', or tap the marble again to go back.' : '. Press 1, 2, 3... or Esc to go back.'}
          </li>
          <li>Auto roll and Auto move (in the toolbar) skip the clicks when there's no real choice to make.</li>
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
