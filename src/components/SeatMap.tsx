import { COLORS, STAR_INDICES } from '../game/board'
import { VIEW_HALF_X, VIEW_HALF_Y, armOutline, baseOutline, loopPoint, starShape } from '../game/layout'
import type { Color } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'

interface MiniBoardProps {
  /** Arm drawn at the bottom: the seat this device will play, as in the game. */
  bottom: number
  seated: Color[]
  /** Empty arms can be tapped to seat someone there. */
  onPickArm?: (color: Color) => void
}

/**
 * A small picture of the board for the setup screen, drawn with the game's own
 * geometry (layout.ts) and the same rotation, so the seats around it match what
 * the game will show. Decorative for assistive tech: the seat cards are the
 * real controls.
 */
export function MiniBoard({ bottom, seated, onPickArm }: MiniBoardProps) {
  const view = `${-VIEW_HALF_X} ${-VIEW_HALF_Y} ${VIEW_HALF_X * 2} ${VIEW_HALF_Y * 2}`
  return (
    <svg className="mini-board" viewBox={view} aria-hidden="true">
      <rect className="board-bg" x={-VIEW_HALF_X + 0.15} y={-VIEW_HALF_Y + 0.15} width={VIEW_HALF_X * 2 - 0.3} height={VIEW_HALF_Y * 2 - 0.3} rx={2.4} />
      {COLORS.map((color, arm) => {
        const on = seated.includes(color)
        const pick = !on && onPickArm ? () => onPickArm(color) : undefined
        return (
          <g
            key={color}
            className={`mini-arm${on ? ' mini-arm-on' : ''}${pick ? ' mini-arm-pickable' : ''}`}
            style={{ ['--arm' as string]: COLOR_HEX[color] }}
            onClick={pick}
          >
            <title>{on ? `${COLOR_NAME[color]}: seated` : `${COLOR_NAME[color]}: empty`}</title>
            <polygon points={armOutline(arm, bottom)} />
            <polygon className="mini-base" points={baseOutline(arm, bottom)} />
          </g>
        )
      })}
      {STAR_INDICES.map((pos) => (
        <polygon key={pos} className="star" points={starShape(loopPoint(pos, bottom))} />
      ))}
      <circle className="center-ring" cx={0} cy={0} r={0.72} />
    </svg>
  )
}
