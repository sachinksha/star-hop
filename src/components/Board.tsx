import { useState, type KeyboardEvent } from 'react'
import { COLORS, LOOP_LENGTH, STAR_INDICES, isStar, preStartIndex, startIndex } from '../game/board'
import { describeBoard, destinationLabel } from '../game/describe'
import {
  CENTER_POINT,
  HOLE_R,
  MARBLE_R,
  STAR_RADIUS,
  VIEW_HALF,
  armOutline,
  basePoint,
  homePoint,
  loopPoint,
  marblePoint,
  starShape,
  type Point,
} from '../game/layout'
import type { Color, Move, Player } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'

interface BoardProps {
  /** Players as drawn (lags the game while a move animates). */
  players: Player[]
  /** Arm drawn at the bottom: this device's player. */
  bottom: number
  /** Seat to play next. Its arm is highlighted. */
  activeColor: Color | null
  /** Marbles of the active seat that can be picked now. */
  pickable: number[]
  /** Marble picked and waiting for a destination, or null. */
  selected: number | null
  /** The selected marble's destinations, badge 1 first. */
  destinations: Move[]
  /** Show 1-4 on the active seat's marbles as keyboard hints. */
  showNumbers: boolean
  /** The most recent move, drawn as a faint trail. */
  lastMove?: { color: Color; move: Move } | null
  onPickMarble: (marbleId: number) => void
  onChooseMove: (move: Move) => void
}

/** Radius of invisible tap targets around pickable marbles and badges. */
const TAP_R = 0.72

const VIEW = `${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`
const fmt = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`

/** Enter or Space activates an SVG element acting as a button. */
const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/** The static board: arms, stars, centre and every hole. Drawn once per rotation. */
function BoardBase({ bottom, seated, activeColor }: { bottom: number; seated: Set<Color>; activeColor: Color | null }) {
  return (
    <g aria-hidden="true">
      <circle className="board-bg" cx={0} cy={0} r={VIEW_HALF - 0.1} />
      {COLORS.map((color, arm) => (
        <polygon
          key={`arm-${color}`}
          className={`arm${seated.has(color) ? '' : ' arm-empty'}${color === activeColor ? ' arm-active' : ''}`}
          points={armOutline(arm, bottom)}
          style={{ ['--arm' as string]: COLOR_HEX[color] }}
        />
      ))}
      <circle className="star-ring" cx={0} cy={0} r={STAR_RADIUS} />
      {STAR_INDICES.map((pos) => {
        const p = loopPoint(pos, bottom)
        return <line key={`spoke-${pos}`} className="spoke" x1={0} y1={0} x2={p.x} y2={p.y} />
      })}
      {STAR_INDICES.map((pos) => (
        <polygon key={`star-${pos}`} className="star" points={starShape(loopPoint(pos, bottom))} />
      ))}
      <circle className="center-ring" cx={0} cy={0} r={0.72} />

      {/* Home columns, with an arrow from each pre-start hole into home. */}
      {COLORS.map((color) => {
        const first = homePoint(color, 0, bottom)
        const last = homePoint(color, 3, bottom)
        const pre = loopPoint(preStartIndex(color), bottom)
        return (
          <g key={`homecol-${color}`} style={{ ['--arm' as string]: COLOR_HEX[color] }}>
            <line className="home-lane" x1={first.x} y1={first.y} x2={last.x} y2={last.y} />
            <line className="home-arrow" x1={pre.x} y1={pre.y} x2={first.x} y2={first.y} />
          </g>
        )
      })}

      {Array.from({ length: LOOP_LENGTH }, (_, pos) => {
        const p = loopPoint(pos, bottom)
        const startOf = COLORS.find((c) => startIndex(c) === pos)
        return (
          <circle
            key={`hole-${pos}`}
            className={`hole${isStar(pos) ? ' hole-star' : ''}${startOf ? ' hole-start' : ''}`}
            cx={p.x}
            cy={p.y}
            r={HOLE_R}
            style={startOf ? { ['--arm' as string]: COLOR_HEX[startOf] } : undefined}
          />
        )
      })}
      <circle className="hole hole-center" cx={0} cy={0} r={HOLE_R * 1.15} />
      {COLORS.map((color) =>
        [0, 1, 2, 3].map((slot) => {
          const h = homePoint(color, slot, bottom)
          const b = basePoint(color, slot, bottom)
          return (
            <g key={`private-${color}-${slot}`} style={{ ['--arm' as string]: COLOR_HEX[color] }}>
              <circle className="hole hole-home" cx={h.x} cy={h.y} r={HOLE_R} />
              <circle className="hole hole-base" cx={b.x} cy={b.y} r={HOLE_R} />
            </g>
          )
        }),
      )}
    </g>
  )
}

/** A faint trail along the most recent move, from a ring on the hole it left. */
function LastMoveTrail({ color, move, bottom }: { color: Color; move: Move; bottom: number }) {
  const at = (spot: Move['from']) => marblePoint(color, move.marbleId, spot, bottom)
  const from = at(move.from)
  return (
    <g style={{ ['--arm' as string]: COLOR_HEX[color] }} aria-hidden="true">
      <polyline className="last-move" points={[move.from, ...move.path].map((s) => fmt(at(s))).join(' ')} />
      <circle className="last-move-from" cx={from.x} cy={from.y} r={HOLE_R + 0.08} />
    </g>
  )
}

export function Board({ players, bottom, activeColor, pickable, selected, destinations, showNumbers, lastMove = null, onPickMarble, onChooseMove }: BoardProps) {
  /** Badge being hovered or focused: its path is previewed. */
  const [preview, setPreview] = useState<number | null>(null)
  const seated = new Set(players.map((p) => p.color))
  const pickSet = new Set(pickable)
  const active = players.find((p) => p.color === activeColor)
  const previewMove = preview !== null ? destinations[preview] : undefined

  const pointOf = (move: Move, i: number): Point => {
    const spot = i < 0 ? move.from : move.path[i]!
    return active ? marblePoint(active.color, move.marbleId, spot, bottom) : CENTER_POINT
  }

  return (
    <div className="board-wrap">
      <svg className="board" viewBox={VIEW} role="group" aria-label="Star Hop board">
        <BoardBase bottom={bottom} seated={seated} activeColor={activeColor} />

        {lastMove && <LastMoveTrail {...lastMove} bottom={bottom} />}

        {previewMove && active && (
          <polyline
            className="path-preview"
            points={[-1, ...previewMove.path.keys()].map((i) => fmt(pointOf(previewMove, i))).join(' ')}
            style={{ ['--arm' as string]: COLOR_HEX[active.color] }}
            aria-hidden="true"
          />
        )}

        {players.flatMap((player) =>
          player.marbles.map((m) => {
            const p = marblePoint(player.color, m.id, m.spot, bottom)
            const mine = player.color === activeColor
            const canPick = mine && pickSet.has(m.id)
            const isSelected = mine && selected === m.id
            const label = `${COLOR_NAME[player.color]} marble ${m.id + 1}`
            return (
              <g
                key={`marble-${player.color}-${m.id}`}
                className={`marble${canPick ? ' marble-pickable' : ''}${isSelected ? ' marble-selected' : ''}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px)`, ['--arm' as string]: COLOR_HEX[player.color] }}
                data-testid={`marble-${player.color}-${m.id}`}
                role={canPick ? 'button' : undefined}
                tabIndex={canPick ? 0 : undefined}
                aria-label={canPick ? `Move ${label}` : undefined}
                aria-pressed={canPick ? isSelected : undefined}
                onClick={canPick ? () => onPickMarble(m.id) : undefined}
                onKeyDown={canPick ? onActivate(() => onPickMarble(m.id)) : undefined}
              >
                {/* Larger invisible tap target: about 24px across on a phone. */}
                {canPick && <circle className="marble-hit" r={TAP_R} />}
                {(canPick || isSelected) && <circle className="marble-halo" r={MARBLE_R + 0.13} />}
                <circle className="marble-body" r={MARBLE_R} />
                <circle className="marble-shine" cx={-0.09} cy={-0.11} r={0.1} />
                {showNumbers && mine && (
                  <text className="marble-number" textAnchor="middle" dominantBaseline="central" aria-hidden="true">
                    {m.id + 1}
                  </text>
                )}
              </g>
            )
          }),
        )}

        {active &&
          destinations.map((move, i) => {
            const p = marblePoint(active.color, move.marbleId, move.to, bottom)
            const label = `${i + 1}: ${destinationLabel(move, active.color, players)}`
            return (
              <g
                key={`dest-${i}`}
                className={`badge${move.bumped ? ' badge-bump' : ''}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                role="button"
                tabIndex={0}
                aria-label={label}
                data-testid={`destination-${i + 1}`}
                onClick={() => onChooseMove(move)}
                onKeyDown={onActivate(() => onChooseMove(move))}
                onMouseEnter={() => setPreview(i)}
                onMouseLeave={() => setPreview(null)}
                onFocus={() => setPreview(i)}
                onBlur={() => setPreview(null)}
              >
                <title>{label}</title>
                <circle className="marble-hit" r={TAP_R} />
                <circle className="badge-body" r={0.44} />
                <text className="badge-number" textAnchor="middle" dominantBaseline="central" aria-hidden="true">
                  {i + 1}
                </text>
              </g>
            )
          })}
      </svg>

      <section className="sr-only" aria-label="Where the marbles are">
        <ul>
          {describeBoard(players).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
