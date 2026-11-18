import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ARM_COUNT, COLORS, LOOP_LENGTH, SECTOR_LENGTH, STAR_INDICES, isStar, preStartIndex, startIndex } from '../game/board'
import { describeBoard, destinationLabel } from '../game/describe'
import {
  BOARD_CORNER,
  BOARD_HALF_X,
  BOARD_HALF_Y,
  CENTER_POINT,
  HOLE_R,
  MARBLE_R,
  STAR_BAND_WIDTH,
  STAR_RADIUS,
  VIEW_HALF_X,
  VIEW_HALF_Y,
  armOutline,
  baseCorners,
  baseOutline,
  basePoint,
  arrow,
  starRingChevrons,
  chevron,
  homePoint,
  loopPoint,
  marblePoint,
  starShape,
  stepBetween,
  type Point,
} from '../game/layout'
import type { Color, Move, Player } from '../game/types'
import { PLAYER_COLOR, COLOR_NAME } from './colors'
import type { PadTarget } from './MovePad'
import { snapTap } from './snap'
import { isTeammate } from '../game/teams'

interface BoardProps {
  /** Players as drawn (lags the game while a move animates). */
  players: Player[]
  /** Arm drawn at the bottom: this device's player. */
  bottom: number
  /** Seat whose marbles move next (a teammate being rolled for, in team play). Its arm is highlighted. */
  activeColor: Color | null
  /** Marbles of the active seat that can be picked now. */
  pickable: number[]
  /** Marble picked and waiting for a destination, or null. */
  selected: number | null
  /** The selected marble's destinations, badge 1 first. */
  destinations: Move[]
  /** Show 1-4 on the active seat's marbles: keyboard hints, and the link to the move buttons. */
  showNumbers: boolean
  /** A move button being pressed: its marble or destination is highlighted. */
  padTarget?: PadTarget | null
  /** The most recent move, drawn as a faint trail. */
  lastMove?: { color: Color; move: Move } | null
  onPickMarble: (marbleId: number) => void
  onChooseMove: (move: Move) => void
}

/**
 * Radius of the invisible tap target on each pickable marble and badge: half
 * the hole spacing, so neighbouring targets never overlap. Taps that miss
 * every target go to the nearest candidate instead (see snapTap).
 */
const TAP_R = 0.5
const VIEW = `${-VIEW_HALF_X} ${-VIEW_HALF_Y} ${VIEW_HALF_X * 2} ${VIEW_HALF_Y * 2}`
const fmt = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`

/** Enter or Space activates an SVG element acting as a button. */
const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/**
 * Small chevrons in the gaps between neighbouring holes of each arm, pointing
 * the way marbles walk: out along one side, across the end, back down the
 * other. The links to the stars are left out: the star shapes fill those gaps.
 */
function trackSteps(bottom: number) {
  const steps: { key: string; p: Point; angle: number; color: Color }[] = []
  for (let arm = 0; arm < ARM_COUNT; arm++) {
    for (let o = 1; o < SECTOR_LENGTH - 1; o++) {
      const pos = arm * SECTOR_LENGTH + o
      steps.push({ key: `step-${pos}`, ...stepBetween(loopPoint(pos, bottom), loopPoint(pos + 1, bottom)), color: COLORS[arm]! })
    }
  }
  return steps
}

/**
 * A band of light that sweeps across the active player's base pad when their
 * turn starts, to draw the eye to whose turn it is. Clipped to the pad; at rest
 * (and with reduced motion) the band sits off the pad, so nothing shows. Keyed
 * by colour, so it plays again for each new player but not on a bonus roll.
 */
function BaseGleam({ arm, bottom }: { arm: number; bottom: number }) {
  const id = useId()
  const corners = baseCorners(arm, bottom)
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const band = 1.2
  const slant = (y1 - y0) * 0.35
  // A slanted band just left of the pad; the animation slides it right, past the far edge.
  const points = [
    { x: x0 - band - slant, y: y1 },
    { x: x0 - slant, y: y1 },
    { x: x0, y: y0 },
    { x: x0 - band, y: y0 },
  ]
  return (
    <g clipPath={`url(#${id}-clip)`}>
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={baseOutline(arm, bottom)} />
        </clipPath>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        className="base-gleam"
        data-testid="base-gleam"
        points={points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
        fill={`url(#${id}-shine)`}
        style={{ ['--gleam-dx' as string]: `${(x1 - x0 + band + slant).toFixed(3)}px` }}
      />
    </g>
  )
}

/** The static board: arms, stars, centre and every hole. Drawn once per rotation. */
function BoardBase({ bottom, seated, activeColor }: { bottom: number; seated: Set<Color>; activeColor: Color | null }) {
  return (
    <g aria-hidden="true">
      <rect
        className="board-bg"
        x={-BOARD_HALF_X}
        y={-BOARD_HALF_Y}
        width={BOARD_HALF_X * 2}
        height={BOARD_HALF_Y * 2}
        rx={BOARD_CORNER}
      />
      {COLORS.map((color, arm) => (
        <path
          key={`arm-${color}`}
          className={`arm${seated.has(color) ? '' : ' arm-empty'}${color === activeColor ? ' arm-active' : ''}`}
          d={armOutline(arm, bottom)}
          style={{ ['--arm' as string]: PLAYER_COLOR[color] }}
        />
      ))}
      {COLORS.map((color, arm) => (
        <path
          key={`base-${color}`}
          className={`base-pad${seated.has(color) ? '' : ' base-pad-empty'}`}
          d={baseOutline(arm, bottom)}
          style={{ ['--arm' as string]: PLAYER_COLOR[color] }}
        />
      ))}
      {activeColor && <BaseGleam key={activeColor} arm={COLORS.indexOf(activeColor)} bottom={bottom} />}
      {/* The stars joined by a thin yellow band of black chevrons turning clockwise, the way star hops go. */}
      <circle className="star-band" cx={0} cy={0} r={STAR_RADIUS} strokeWidth={STAR_BAND_WIDTH} />
      {starRingChevrons(bottom).map(({ p, angle }, i) => (
        <polygon key={`band-${i}`} className="star-chevron" points={chevron(p, angle, 0.1, 0.08, 0.06)} />
      ))}
      {STAR_INDICES.map((pos) => {
        const p = loopPoint(pos, bottom)
        return <line key={`spoke-${pos}`} className="spoke" x1={0} y1={0} x2={p.x} y2={p.y} />
      })}
      {STAR_INDICES.map((pos) => (
        <polygon key={`star-${pos}`} className="star" points={starShape(loopPoint(pos, bottom))} />
      ))}
      <circle className="center-ring" cx={0} cy={0} r={0.72} />

      {/* Home columns. The arrow in from each pre-start hole is drawn over the holes, below. */}
      {COLORS.map((color) => {
        const first = homePoint(color, 0, bottom)
        const last = homePoint(color, 3, bottom)
        return (
          <line
            key={`homecol-${color}`}
            className="home-lane"
            x1={first.x}
            y1={first.y}
            x2={last.x}
            y2={last.y}
            style={{ ['--arm' as string]: PLAYER_COLOR[color] }}
          />
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
            style={startOf ? { ['--arm' as string]: PLAYER_COLOR[startOf] } : undefined}
          />
        )
      })}
      <circle className="hole hole-center" cx={0} cy={0} r={HOLE_R * 1.15} />
      {COLORS.map((color) =>
        [0, 1, 2, 3].map((slot) => {
          const h = homePoint(color, slot, bottom)
          const b = basePoint(color, slot, bottom)
          return (
            <g key={`private-${color}-${slot}`} style={{ ['--arm' as string]: PLAYER_COLOR[color] }}>
              <circle className="hole hole-home" cx={h.x} cy={h.y} r={HOLE_R} />
              <circle className="hole hole-base" cx={b.x} cy={b.y} r={HOLE_R} />
            </g>
          )
        }),
      )}

      {trackSteps(bottom).map(({ key, p, angle, color }) => (
        <polygon key={key} className="track-step" points={chevron(p, angle, 0.17, 0.09, 0.06)} style={{ ['--arm' as string]: PLAYER_COLOR[color] }} />
      ))}
      {COLORS.map((color) => {
        const into = stepBetween(loopPoint(preStartIndex(color), bottom), homePoint(color, 0, bottom))
        return (
          <g key={`home-steps-${color}`} style={{ ['--arm' as string]: PLAYER_COLOR[color] }}>
            {/* The turn off the loop into home: bold, in the owner's colour. */}
            <polygon className="home-entry" points={arrow(into.p, into.angle, 0.6, 0.13, 0.4)} />
            {[0, 1, 2].map((slot) => {
              const s = stepBetween(homePoint(color, slot, bottom), homePoint(color, slot + 1, bottom))
              return <polygon key={slot} className="home-step" points={chevron(s.p, s.angle, 0.2, 0.09, 0.07)} />
            })}
          </g>
        )
      })}
    </g>
  )
}

/** A faint trail along the most recent move, from a ring on the hole it left. */
function LastMoveTrail({ color, move, bottom }: { color: Color; move: Move; bottom: number }) {
  const at = (spot: Move['from']) => marblePoint(color, move.marbleId, spot, bottom)
  const from = at(move.from)
  return (
    <g style={{ ['--arm' as string]: PLAYER_COLOR[color] }} aria-hidden="true">
      <polyline className="last-move" points={[move.from, ...move.path].map((s) => fmt(at(s))).join(' ')} />
      <circle className="last-move-from" cx={from.x} cy={from.y} r={HOLE_R + 0.08} />
    </g>
  )
}

export function Board({ players, bottom, activeColor, pickable, selected, destinations, showNumbers, padTarget = null, lastMove = null, onPickMarble, onChooseMove }: BoardProps) {
  /** Badge being hovered or focused: its path is previewed. */
  const [preview, setPreview] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const seated = new Set(players.map((p) => p.color))
  const pickSet = new Set(pickable)
  const active = players.find((p) => p.color === activeColor)
  const shownPreview = preview ?? (padTarget?.kind === 'destination' ? padTarget.index : null)
  const previewMove = shownPreview !== null ? destinations[shownPreview] : undefined
  const padMarble = padTarget?.kind === 'marble' ? padTarget.id : null
  /** Team play: the move would bump a teammate. Legal, but flagged so nobody does it by accident. */
  const bumpsTeammate = (move: Move) => {
    const victim = move.bumped && players.find((p) => p.color === move.bumped!.color)
    return !!victim && !!active && isTeammate(victim, active)
  }

  // Where each marble is drawn. Two marbles can share a hole only on a start
  // hole under safe starts (R24): both are drawn smaller, side by side, so each
  // stays visible and tappable (the same trick as stacked tokens in Ludo).
  const placed = new Map<string, { p: Point; scale: number }>()
  const byHole = new Map<string, string[]>()
  for (const player of players) {
    for (const m of player.marbles) {
      const p = marblePoint(player.color, m.id, m.spot, bottom)
      placed.set(`${player.color}:${m.id}`, { p, scale: 1 })
      if (m.spot.kind !== 'base') {
        const hole = `${p.x.toFixed(3)},${p.y.toFixed(3)}`
        byHole.set(hole, [...(byHole.get(hole) ?? []), `${player.color}:${m.id}`])
      }
    }
  }
  for (const ids of byHole.values()) {
    if (ids.length < 2) continue
    ids.forEach((id, i) => {
      const at = placed.get(id)!
      const dx = (i - (ids.length - 1) / 2) * MARBLE_R * 0.95
      placed.set(id, { p: { x: at.p.x + dx, y: at.p.y }, scale: 0.68 })
    })
  }

  /** A tap that missed every piece: give it to the nearest usable one, if the choice is clear. */
  const onBoardClick = (e: MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-hit]')) return // a piece's own handler took it
    const ctm = svgRef.current?.getScreenCTM?.()
    if (!ctm || !active) return
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    type Hit = { kind: 'marble'; id: number } | { kind: 'move'; move: Move }
    const candidates: { p: Point; value: Hit }[] = [
      ...active.marbles
        .filter((m) => pickSet.has(m.id))
        .map((m) => ({ p: placed.get(`${active.color}:${m.id}`)!.p, value: { kind: 'marble', id: m.id } as Hit })),
      ...destinations.map((move) => ({ p: marblePoint(active.color, move.marbleId, move.to, bottom), value: { kind: 'move', move } as Hit })),
    ]
    const hit = snapTap(at, candidates)
    if (hit?.kind === 'marble') onPickMarble(hit.id)
    if (hit?.kind === 'move') onChooseMove(hit.move)
  }

  const pointOf = (move: Move, i: number): Point => {
    const spot = i < 0 ? move.from : move.path[i]!
    return active ? marblePoint(active.color, move.marbleId, spot, bottom) : CENTER_POINT
  }

  return (
    <div className="board-wrap">
      {/* The click handler only refines pointer taps; keyboard users use each piece's own button role. */}
      <svg ref={svgRef} className="board" viewBox={VIEW} role="group" aria-label="Star Hop board" onClick={onBoardClick}>
        <BoardBase bottom={bottom} seated={seated} activeColor={activeColor} />

        {lastMove && <LastMoveTrail {...lastMove} bottom={bottom} />}

        {previewMove && active && (
          <polyline
            className="path-preview"
            points={[-1, ...previewMove.path.keys()].map((i) => fmt(pointOf(previewMove, i))).join(' ')}
            style={{ ['--arm' as string]: PLAYER_COLOR[active.color] }}
            aria-hidden="true"
          />
        )}

        {players.flatMap((player) =>
          player.marbles.map((m) => {
            const { p, scale } = placed.get(`${player.color}:${m.id}`)!
            const mine = player.color === activeColor
            const canPick = mine && pickSet.has(m.id)
            const isSelected = mine && selected === m.id
            const label = `${COLOR_NAME[player.color]} marble ${m.id + 1}`
            return (
              <g
                key={`marble-${player.color}-${m.id}`}
                className={`marble${canPick ? ' marble-pickable' : ''}${isSelected ? ' marble-selected' : ''}${mine && padMarble === m.id ? ' marble-previewed' : ''}`}
                data-hit={canPick ? '' : undefined}
                style={{ transform: `translate(${p.x}px, ${p.y}px)${scale !== 1 ? ` scale(${scale})` : ''}`, ['--arm' as string]: PLAYER_COLOR[player.color] }}
                data-testid={`marble-${player.color}-${m.id}`}
                data-shared={scale !== 1 ? '' : undefined}
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
                {/* Mounts on selection, so its one-shot animation plays each time a marble is picked. */}
                {isSelected && <circle className="marble-ping" r={MARBLE_R + 0.13} />}
                <circle className="marble-shadow" cx={0.045} cy={0.07} r={MARBLE_R} />
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
                className={`badge${move.bumped ? (bumpsTeammate(move) ? ' badge-friendly' : ' badge-bump') : ''}${shownPreview === i ? ' badge-previewed' : ''}`}
                data-hit=""
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
                <circle className="badge-body" r={0.46} />
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
