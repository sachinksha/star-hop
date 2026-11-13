import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { describeBoard, destinationLabel } from '../game/describe'
import { CENTER, game, home, loop, place, playerOf, rollAs } from '../game/testUtils'
import { Board } from './Board'

/** Red on star 14 with a 1: walk, hop, or the centre. Blue sits on the next star. */
function onStar() {
  const g = place(place(game(), 'red', [loop(14), home(3)]), 'blue', [loop(28)])
  return rollAs(g, 'red', 1)
}

function renderBoard(selected: number | null, onPick = vi.fn(), onChoose = vi.fn()) {
  const g = onStar()
  render(
    <Board
      players={g.players}
      bottom={0}
      activeColor="red"
      pickable={[0]}
      selected={selected}
      destinations={selected === null ? [] : g.legalMoves.filter((m) => m.marbleId === selected)}
      showNumbers
      onPickMarble={onPick}
      onChooseMove={onChoose}
    />,
  )
  return g
}

describe('Board', () => {
  it('makes only pickable marbles into buttons', () => {
    const onPick = vi.fn()
    renderBoard(null, onPick)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Move Red marble 1' }))
    expect(onPick).toHaveBeenCalledWith(0)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Red marble 1' }), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it('numbers each destination, closest to home first and the centre last', () => {
    const onChoose = vi.fn()
    const g = renderBoard(0, vi.fn(), onChoose)
    const badges = screen.getAllByRole('button', { name: /^\d:/ })
    expect(badges.map((b) => b.getAttribute('aria-label'))).toEqual([
      '1: Hop 1 star to the star by the Yellow arm. 63 steps from home. Bumps Player 2',
      '2: Walk 1 hole. 76 steps from home',
      '3: Into the centre',
    ])
    fireEvent.click(badges[2]!)
    expect(onChoose).toHaveBeenCalledWith(g.legalMoves.find((m) => m.to.kind === 'center'))
  })

  it('previews the path of a focused destination', () => {
    renderBoard(0)
    expect(document.querySelector('.path-preview')).toBeNull()
    fireEvent.focus(screen.getByTestId('destination-1'))
    expect(document.querySelector('.path-preview')).not.toBeNull()
    fireEvent.blur(screen.getByTestId('destination-1'))
    expect(document.querySelector('.path-preview')).toBeNull()
  })

  it('describes where every marble is, for screen readers', () => {
    renderBoard(null)
    const list = within(screen.getByRole('region', { name: 'Where the marbles are' })).getAllByRole('listitem')
    expect(list.map((li) => li.textContent)).toEqual([
      'Red (Player 1): 2 in base, marble 1 on a star 77 steps from home, 1 in home',
      'Blue (Player 2): 3 in base, marble 1 on a star 35 steps from home',
    ])
  })
})

describe('destination and board text', () => {
  it('labels centre exits by star, and the home star as yours', () => {
    const g = rollAs(place(game(), 'red', [CENTER]), 'red', 1)
    const red = playerOf(g, 'red')
    const labels = g.legalMoves.filter((m) => m.marbleId === 0).map((m) => destinationLabel(m, 'red', g.players))
    expect(labels[0]).toBe('Out of the centre to your home star. 7 steps from home')
    expect(labels[1]).toBe('Out of the centre to the star by the Purple arm. 21 steps from home')
    expect(red.color).toBe('red')
  })

  it('labels entering, walking into home and plain hops', () => {
    const enter = rollAs(game(), 'red', 6).legalMoves[0]!
    expect(destinationLabel(enter, 'red', [])).toBe('Out of base onto your start. 84 steps from home')
    const intoHome = rollAs(place(game(), 'red', [loop(5)]), 'red', 3).legalMoves[0]!
    expect(destinationLabel(intoHome, 'red', [])).toBe('Into home hole 2')
    const hopWalk = rollAs(place(game(), 'red', [loop(14)]), 'red', 3).legalMoves.find((m) => m.hops === 1)!
    expect(destinationLabel(hopWalk, 'red', [])).toBe('Hop 1 star, then 2 holes. 61 steps from home')
  })

  it('mentions the centre and finishing in the board text', () => {
    let g = place(game(), 'red', [CENTER, home(0), home(1), home(2)])
    g = { ...g, players: g.players.map((p) => (p.color === 'blue' ? { ...p, finishRank: 1 } : p)) }
    expect(describeBoard(g.players)).toEqual([
      'Red (Player 1): marble 1 in the centre, 3 in home',
      'Blue (Player 2, finished 1): 4 in base',
    ])
  })
})
