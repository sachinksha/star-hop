import { isHelperTurn } from '../game/teams'
import type { Color, GameState, Player } from '../game/types'
import { liveNudges, suggestingTeammate, suggestionOptions } from '../net/nudges'
import type { Nudge, TeamNudge } from '../net/protocol'
import { PLAYER_COLOR } from './colors'
import { Icon } from './Icons'

interface TeamTurnProps {
  game: GameState
  /** Choices for a finished player on this device; empty when someone else decides. */
  choices: Player[]
  /** Seats played from this device. */
  isMine: (color: Color) => boolean
  /** Online games only: suggestions travel between devices. Locally, people just talk. */
  online: boolean
  nudges: TeamNudge[]
  disabled: boolean
  /** Phones: one compact row (names only), no keyboard hints. */
  compact?: boolean
  onRollFor: (color: Color) => void
  onPass: () => void
  onNudge: (from: Color, nudge: Nudge) => void
}

const sameNudge = (a: Nudge, b: Nudge) => a.kind === b.kind && (a.kind !== 'rollFor' || (b.kind === 'rollFor' && a.color === b.color))

/** Names of teammates who suggested `nudge`, e.g. ["Bo", "Cy"]. */
function suggesters(game: GameState, nudges: TeamNudge[], nudge: Nudge): string[] {
  return nudges.filter((n) => sameNudge(n.nudge, nudge)).map((n) => game.players.find((p) => p.color === n.from)?.name ?? n.from)
}

/** A small corner badge: how many teammates asked for this, without adding a line. */
function Votes({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <span className="nudge-badge" title={`${names.join(', ')} asked`} aria-hidden="true">
      {names.length}
    </span>
  )
}

/**
 * Team play: a finished player's turn. The roller chooses which teammate the
 * roll is for (keys 1, 2, ...), or passes (0). Online, teammates see the same
 * choices as suggestion buttons, and their suggestions show on the roller's
 * buttons as vote badges. The roller always has the final say.
 *
 * Everything fits one row of buttons, so the turn area keeps its height.
 */
export function TeamTurn({ game, choices, isMine, online, nudges, disabled, compact = false, onRollFor, onPass, onNudge }: TeamTurnProps) {
  if (!isHelperTurn(game)) return null
  const roller = game.players[game.currentIndex]!
  const live = liveNudges(game, nudges)
  const key = (k: string) => (compact ? null : <kbd className="team-key">{k}</kbd>)

  if (choices.length > 0) {
    const passBy = suggesters(game, live, { kind: 'pass' })
    return (
      <div className="team-turn" role="group" aria-label="Choose who this roll is for">
        {choices.map((p, i) => {
          const by = suggesters(game, live, { kind: 'rollFor', color: p.color })
          return (
            <button
              key={p.color}
              type="button"
              className={`team-choice${by.length ? ' team-choice-nudged' : ''}`}
              style={{ ['--arm' as string]: PLAYER_COLOR[p.color] }}
              onClick={() => onRollFor(p.color)}
              disabled={disabled}
              aria-label={`Roll for ${p.name}${by.length ? `, ${by.join(' and ')} asked` : ''}`}
              aria-keyshortcuts={String(i + 1)}
            >
              {key(String(i + 1))}
              {!compact && <Icon name="dice" size={16} />}
              <span className="team-choice-name">{compact ? p.name : `Roll for ${p.name}`}</span>
              <Votes names={by} />
            </button>
          )
        })}
        <button
          type="button"
          className={`team-pass${passBy.length ? ' team-choice-nudged' : ''}`}
          onClick={onPass}
          disabled={disabled}
          aria-label={`Pass${passBy.length ? `, ${passBy.join(' and ')} suggested` : ''}`}
          aria-keyshortcuts="0"
        >
          {key('0')}
          Pass
          <Votes names={passBy} />
        </button>
      </div>
    )
  }

  // A teammate on this device, watching the roller decide: offer suggestions (online only).
  const me = suggestingTeammate(game, isMine, online)
  if (!me) return null
  const mine = live.find((n) => n.from === me.color)?.nudge
  const options = suggestionOptions(game, me)
  return (
    <div className="team-turn" role="group" aria-label={`Suggest to ${roller.name}`}>
      {!compact && <span className="team-turn-note">Suggest:</span>}
      {options.map((o, i) => {
        const k = o.nudge.kind === 'pass' ? '0' : String(i + 1)
        const others = suggesters(game, live, o.nudge).filter((n) => n !== me.name)
        return (
          <button
            key={o.label}
            type="button"
            className="chip-button team-suggest"
            aria-pressed={mine !== undefined && sameNudge(mine, o.nudge)}
            aria-label={`Suggest: ${o.label}${others.length ? ` (${others.join(' and ')} too)` : ''}`}
            aria-keyshortcuts={k}
            onClick={() => onNudge(me.color, o.nudge)}
            disabled={disabled}
          >
            {key(k)}
            {compact ? o.short : o.label}
            <Votes names={others} />
          </button>
        )
      })}
    </div>
  )
}
