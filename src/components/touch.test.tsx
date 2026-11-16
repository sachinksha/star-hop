import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/engine'
import { assignTeams } from '../game/teams'
import { home, loop, place } from '../game/testUtils'
import type { Color, GameState, Move } from '../game/types'
import { rollWithValue } from '../game/engine'
import { MovePad } from './MovePad'
import { SNAP_R, snapTap } from './snap'
import { TeamTurn } from './TeamTurn'

describe('snapTap: taps that miss go to the nearest usable piece', () => {
  const a = { p: { x: 0, y: 0 }, value: 'a' }
  const b = { p: { x: 3, y: 0 }, value: 'b' }

  it('picks the nearest candidate within reach', () => {
    expect(snapTap({ x: 0.9, y: 0.4 }, [a, b])).toBe('a')
    expect(snapTap({ x: 2.2, y: 0 }, [a, b])).toBe('b')
  })

  it('ignores taps too far from every candidate', () => {
    expect(snapTap({ x: 0, y: SNAP_R + 0.1 }, [a, b])).toBeNull()
    expect(snapTap({ x: 0, y: 0 }, [])).toBeNull()
  })

  it('does nothing when two candidates are about equally close', () => {
    const near = { p: { x: 1, y: 0 }, value: 'near' }
    expect(snapTap({ x: 0.5, y: 0.1 }, [a, near])).toBeNull()
    expect(snapTap({ x: 0.1, y: 0 }, [a, near])).toBe('a')
  })
})

describe('MovePad', () => {
  /** Red with marbles on 9, 10 and 14 (a star), rolled a 3. */
  function position(): GameState {
    const g = createGame([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'human' }], () => 0)
    return rollWithValue(place({ ...g, currentIndex: 0 }, 'red', [loop(9), loop(10), loop(14)]), 3)
  }
  const movesFor = (g: GameState) => (id: number) => g.legalMoves.filter((m) => m.marbleId === id)
  const pickable = (g: GameState) => [...new Set(g.legalMoves.map((m) => m.marbleId))]

  it('numbers the marbles like the board, and only enables those that can move', () => {
    const g = position()
    const onPick = vi.fn()
    render(<MovePad player={g.players[0]!} players={g.players} pickable={pickable(g)} selected={null} destinations={[]} movesFor={movesFor(g)} onPickMarble={onPick} onChooseMove={vi.fn()} onBack={vi.fn()} onPreview={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Pick a marble' })
    expect(within(group).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByTestId('pad-marble-1')).toBeDisabled() // 9 -> 12 jumps over its own marble on 10
    expect(screen.getByTestId('pad-marble-4')).toBeDisabled() // in base
    expect(screen.getByTestId('pad-marble-3')).toHaveAccessibleName(/Marble 3, ★ \d+ to go, \d+ places/)
    fireEvent.click(screen.getByTestId('pad-marble-3'))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('previews while pressed and clears on release, then lists destinations in board order', () => {
    const g = position()
    const onPreview = vi.fn()
    const onChoose = vi.fn()
    const onBack = vi.fn()
    const dest = movesFor(g)(2)
    render(<MovePad player={g.players[0]!} players={g.players} pickable={pickable(g)} selected={2} destinations={dest} movesFor={movesFor(g)} onPickMarble={vi.fn()} onChooseMove={onChoose} onBack={onBack} onPreview={onPreview} />)
    const first = screen.getByTestId('pad-destination-1')
    fireEvent.pointerDown(first)
    expect(onPreview).toHaveBeenLastCalledWith({ kind: 'destination', index: 0 })
    fireEvent.pointerLeave(first)
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(screen.getAllByTestId(/pad-destination-/)).toHaveLength(dest.length)
    fireEvent.click(screen.getByTestId(`pad-destination-${dest.length}`))
    expect(onChoose).toHaveBeenCalledWith(dest[dest.length - 1] as Move)
    fireEvent.click(screen.getByRole('button', { name: 'Back to picking a marble' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('TeamTurn', () => {
  /** 6 players, 2 teams of 3. Red (team A, with yellow and blue) has finished and rolls next. */
  function helperTurn(): GameState {
    const colors: Color[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
    const teams = assignTeams(6, 2)
    const g = createGame(colors.map((color, i) => ({ color, kind: 'human' as const, team: teams[i]! })), () => 0)
    const done = place(g, 'red', [home(0), home(1), home(2), home(3)])
    return { ...done, currentIndex: 0, players: done.players.map((p) => (p.color === 'red' ? { ...p, finishRank: 1 } : p)) }
  }
  const noop = () => {}

  it('gives the roller a button per teammate and a pass, with suggestions shown as votes', () => {
    const g = helperTurn()
    const onRollFor = vi.fn()
    const onPass = vi.fn()
    const targets = g.players.filter((p) => p.color === 'yellow' || p.color === 'blue')
    render(
      <TeamTurn
        game={g}
        choices={targets}
        isMine={(c) => c === 'red'}
        online
        nudges={[{ from: 'blue', seq: g.actionSeq, nudge: { kind: 'rollFor', color: 'yellow' } }]}
        disabled={false}
        onRollFor={onRollFor}
        onPass={onPass}
        onNudge={noop}
      />,
    )
    const yellow = screen.getByRole('button', { name: 'Roll for Player 3, Player 5 asked' })
    // The vote shows as a corner badge, so the button keeps one line.
    expect(yellow.querySelector('.nudge-badge')).toHaveTextContent('1')
    expect(yellow).toHaveAttribute('aria-keyshortcuts', '1')
    fireEvent.click(yellow)
    expect(onRollFor).toHaveBeenCalledWith('yellow')
    const pass = screen.getByRole('button', { name: 'Pass' })
    expect(pass).toHaveAttribute('aria-keyshortcuts', '0')
    fireEvent.click(pass)
    expect(onPass).toHaveBeenCalled()
  })

  it('lets an online teammate suggest, and marks their current suggestion', () => {
    const g = helperTurn()
    const onNudge = vi.fn()
    render(
      <TeamTurn
        game={g}
        choices={[]}
        isMine={(c) => c === 'yellow'}
        online
        nudges={[{ from: 'yellow', seq: g.actionSeq, nudge: { kind: 'pass' } }]}
        disabled={false}
        onRollFor={noop}
        onPass={noop}
        onNudge={onNudge}
      />,
    )
    expect(screen.getByRole('group', { name: 'Suggest to Player 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest: Pass this one' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest: Roll for me' }))
    expect(onNudge).toHaveBeenCalledWith('yellow', { kind: 'rollFor', color: 'yellow' })
  })

  it('shows nothing to opponents, or locally where people just talk', () => {
    const g = helperTurn()
    const props = { game: g, choices: [], nudges: [], disabled: false, onRollFor: noop, onPass: noop, onNudge: noop }
    const { container, rerender } = render(<TeamTurn {...props} isMine={(c) => c === 'orange'} online />)
    expect(container).toBeEmptyDOMElement()
    rerender(<TeamTurn {...props} isMine={(c) => c === 'yellow'} online={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
