import { shortDestination, shortSpot } from '../game/describe'
import { MARBLES_PER_PLAYER, type Color, type Move, type Player } from '../game/types'
import { COLOR_HEX } from './colors'

/** What a pad button points at on the board, for the press-to-preview highlight. */
export type PadTarget = { kind: 'marble'; id: number } | { kind: 'destination'; index: number }

interface MovePadProps {
  /** The player whose marbles move. */
  player: Player
  /** Marbles that can move with this roll. */
  pickable: number[]
  selected: number | null
  destinations: Move[]
  movesFor: (marbleId: number) => Move[]
  onPickMarble: (marbleId: number) => void
  onChooseMove: (move: Move) => void
  onBack: () => void
  /** Called while a button is pressed or focused, and with null when released. */
  onPreview: (target: PadTarget | null) => void
}

/**
 * Big buttons under the board for touch screens, where marbles are about
 * 13px across and 18px apart: smaller than a fingertip. Each button carries
 * the same number as the marble (or destination badge) on the board.
 *
 * Pressing a button highlights its target on the board; the action happens
 * on release, so sliding off the button cancels. That is the press-preview-
 * release pattern of a phone keyboard's key pop-up.
 */
export function MovePad({ player, pickable, selected, destinations, movesFor, onPickMarble, onChooseMove, onBack, onPreview }: MovePadProps) {
  const color: Color = player.color
  // Preview while pressed or focused; clear when the finger lifts, slides off, or focus leaves.
  const previewProps = (target: PadTarget) => ({
    onPointerDown: () => onPreview(target),
    onPointerLeave: () => onPreview(null),
    onPointerCancel: () => onPreview(null),
    onPointerUp: () => onPreview(null),
    onFocus: () => onPreview(target),
    onBlur: () => onPreview(null),
  })

  if (selected !== null) {
    return (
      <div className="move-pad" role="group" aria-label={`Where marble ${selected + 1} goes`} style={{ ['--arm' as string]: COLOR_HEX[color] }}>
        <button type="button" className="pad-back" onClick={onBack} aria-label="Back to picking a marble">
          <span aria-hidden="true">‹</span>
          <span className="pad-sub">Back</span>
        </button>
        {destinations.map((move, i) => (
          <button
            key={i}
            type="button"
            className={`pad-button pad-destination${move.bumped ? ' pad-bump' : ''}`}
            data-testid={`pad-destination-${i + 1}`}
            onClick={() => onChooseMove(move)}
            {...previewProps({ kind: 'destination', index: i })}
          >
            <span className="pad-number">{i + 1}</span>
            <span className="pad-sub">
              {shortDestination(move)}
              {move.bumped && <b className="pad-tag"> · Bump!</b>}
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="move-pad" role="group" aria-label="Pick a marble" style={{ ['--arm' as string]: COLOR_HEX[color] }}>
      {Array.from({ length: MARBLES_PER_PLAYER }, (_, id) => {
        const marble = player.marbles.find((m) => m.id === id)
        const can = pickable.includes(id)
        const places = can ? movesFor(id).length : 0
        return (
          <button
            key={id}
            type="button"
            className="pad-button pad-marble"
            data-testid={`pad-marble-${id + 1}`}
            disabled={!can}
            aria-label={`Marble ${id + 1}, ${marble ? shortSpot(color, marble.spot) : ''}${can ? `, ${places} ${places === 1 ? 'place' : 'places'}` : ", can't move"}`}
            onClick={() => onPickMarble(id)}
            {...previewProps({ kind: 'marble', id })}
          >
            <span className="pad-number">{id + 1}</span>
            <span className="pad-sub">{marble ? shortSpot(color, marble.spot) : ''}</span>
          </button>
        )
      })}
    </div>
  )
}
