import { teamLabel, type TeamStanding } from '../game/teams'
import type { Color } from '../game/types'
import { PLAYER_COLOR, COLOR_NAME } from './colors'
import { unit } from './random'

interface WinOverlayProps {
  winners: Color[]
  /** Team play: teams in finishing order. Shown instead of individual places. */
  teams?: TeamStanding[]
  /** Display name per colour. Falls back to the colour name. */
  names?: Partial<Record<Color, string>>
  /** Formatted game duration, shown under the heading. */
  time?: string
  /** The game was ended before every place was decided. */
  early?: boolean
  onNewGame?: () => void
  onSetup: () => void
  setupLabel?: string
  /** Extra line under the standings. */
  note?: string
}

const PALETTE = Object.values(PLAYER_COLOR)

/** Confetti pieces with fixed, varied positions and timings. */
const PIECES = Array.from({ length: 90 }, (_, i) => ({
  id: i,
  left: unit(i + 1) * 100,
  delay: unit(i + 101) * 1.2,
  duration: 2.6 + unit(i + 201) * 2,
  drift: (unit(i + 301) - 0.5) * 120,
  colour: PALETTE[i % PALETTE.length],
}))

/** End of game: full ranking, play again, or back to setup. */
export function WinOverlay({ winners, teams, names = {}, time, early, onNewGame, onSetup, setupLabel = 'Change setup', note }: WinOverlayProps) {
  const champion = winners[0]
  const label = (c: Color) => names[c] ?? COLOR_NAME[c]
  const topTeam = teams?.[0]
  const title = topTeam
    ? `${teamLabel(topTeam.team)} wins!`
    : champion === undefined
      ? 'Game over'
      : label(champion) === 'You'
        ? 'You win!'
        : `${label(champion)} wins!`

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ['--drift' as string]: `${p.drift}px`,
            }}
          />
        ))}
      </div>
      <div className="overlay-card">
        <h2 id="win-title">{title}</h2>
        {time && <p className="overlay-note">Game time {time}</p>}
        {early && <p className="overlay-note">Ended early. Unfinished players are ranked by how far their marbles got.</p>}
        {teams ? (
          <ol className="standings">
            {teams.map((t) => (
              <li key={t.team} className="standing-team">
                <span className="standing-rank">{t.rank}</span>
                <span className={`team-chip team-${t.team}`} aria-hidden="true">
                  {teamLabel(t.team).slice(-1)}
                </span>
                <span>
                  <b>{teamLabel(t.team)}</b>
                  <span className="standing-colour"> {t.members.map(label).join(' & ')}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
        <ol className="standings">
          {winners.map((c, i) => (
            <li key={c} style={{ ['--arm' as string]: PLAYER_COLOR[c] }}>
              <span className="standing-rank">{i + 1}</span>
              <span className="standing-dot" aria-hidden="true" />
              {label(c)}
              {names[c] && <span className="standing-colour"> ({COLOR_NAME[c]})</span>}
            </li>
          ))}
        </ol>
        )}
        {note && (
          <p className="overlay-note" role="status">
            {note}
          </p>
        )}
        <div className="overlay-actions">
          {onNewGame && (
            <button type="button" className="primary" onClick={onNewGame}>
              Play again
            </button>
          )}
          <button type="button" onClick={onSetup}>
            {setupLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
