import { helperTargets, isHelperTurn, isTeammate } from '../game/teams'
import type { Color, GameState, Player } from '../game/types'
import { liveNudges } from '../net/nudges'
import type { Nudge, TeamNudge } from '../net/protocol'
import { COLOR_HEX } from './colors'

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
  onRollFor: (color: Color) => void
  onPass: () => void
  onNudge: (from: Color, nudge: Nudge) => void
}

const sameNudge = (a: Nudge, b: Nudge) => a.kind === b.kind && (a.kind !== 'rollFor' || (b.kind === 'rollFor' && a.color === b.color))

/** Names of teammates who suggested `nudge`, e.g. "Bo, Cy". */
function suggesters(game: GameState, nudges: TeamNudge[], nudge: Nudge): string[] {
  return nudges.filter((n) => sameNudge(n.nudge, nudge)).map((n) => game.players.find((p) => p.color === n.from)?.name ?? n.from)
}

/**
 * Team play: a finished player's turn. The roller chooses which teammate the
 * roll is for, or passes. Online, teammates see the same choices as
 * suggestion buttons, and their suggestions show up on the roller's buttons
 * like votes. The roller always has the final say.
 */
export function TeamTurn({ game, choices, isMine, online, nudges, disabled, onRollFor, onPass, onNudge }: TeamTurnProps) {
  if (!isHelperTurn(game)) return null
  const roller = game.players[game.currentIndex]!
  const live = liveNudges(game, nudges)

  if (choices.length > 0) {
    const passBy = suggesters(game, live, { kind: 'pass' })
    return (
      <div className="team-turn" role="group" aria-label="Choose who this roll is for">
        <div className="team-choices">
          {choices.map((p) => {
            const by = suggesters(game, live, { kind: 'rollFor', color: p.color })
            return (
              <button
                key={p.color}
                type="button"
                className={`team-choice${by.length ? ' team-choice-nudged' : ''}`}
                style={{ ['--arm' as string]: COLOR_HEX[p.color] }}
                onClick={() => onRollFor(p.color)}
                disabled={disabled}
              >
                <span className="panel-dot" aria-hidden="true" />
                <span>Roll for {p.name}</span>
                {by.length > 0 && <span className="nudge-tag">{by.join(', ')} asked</span>}
              </button>
            )
          })}
          <button type="button" className={`team-pass${passBy.length ? ' team-choice-nudged' : ''}`} onClick={onPass} disabled={disabled}>
            Pass
            {passBy.length > 0 && <span className="nudge-tag">{passBy.join(', ')} suggests</span>}
          </button>
        </div>
      </div>
    )
  }

  // A teammate on this device, watching the roller decide: offer suggestions (online only).
  const me = game.players.find((p) => isMine(p.color) && isTeammate(p, roller))
  if (!online || !me) return null
  const targets = helperTargets(game)
  const mine = live.find((n) => n.from === me.color)?.nudge
  const options: { nudge: Nudge; label: string }[] = [
    ...targets.map((p) => ({ nudge: { kind: 'rollFor', color: p.color } as Nudge, label: p.color === me.color ? 'Roll for me' : `Roll for ${p.name}` })),
    { nudge: { kind: 'pass' }, label: 'Pass this one' },
  ]
  return (
    <div className="team-turn" role="group" aria-label={`Suggest to ${roller.name}`}>
      <p className="team-turn-note">Suggest to {roller.name}:</p>
      <div className="team-choices">
        {options.map((o) => {
          const picked = mine !== undefined && sameNudge(mine, o.nudge)
          return (
            <button
              key={o.label}
              type="button"
              className="chip-button"
              aria-pressed={picked}
              onClick={() => onNudge(me.color, o.nudge)}
              disabled={disabled}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {live.length > 0 && (
        <ul className="nudge-list" aria-label="Team suggestions">
          {live.map((n) => {
            const who = game.players.find((p) => p.color === n.from)?.name ?? n.from
            const what = n.nudge.kind === 'pass' ? 'pass' : `roll for ${game.players.find((p) => n.nudge.kind === 'rollFor' && p.color === n.nudge.color)?.name}`
            return (
              <li key={n.from}>
                {who}: {what}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
