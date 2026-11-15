import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startIndex } from '../game/board'
import { game, loop, place } from '../game/testUtils'
import { DEFAULT_SETTINGS, useGameStore } from '../store/gameStore'
import { Board } from './Board'
import { DicePool } from './DicePool'
import { RulesContent } from './RulesSheet'
import { SetupScreen } from './SetupScreen'

beforeEach(() => {
  useGameStore.getState().abort()
  useGameStore.getState().updateSettings(DEFAULT_SETTINGS)
})

describe('shared start holes (R24)', () => {
  it('draws two marbles on one start hole smaller, side by side', () => {
    const S = startIndex('red')
    const g = place(place(game(), 'red', [loop(S)]), 'blue', [loop(S)])
    render(<Board players={g.players} bottom={0} activeColor={null} pickable={[]} selected={null} destinations={[]} showNumbers={false} onPickMarble={vi.fn()} onChooseMove={vi.fn()} />)
    const red = screen.getByTestId('marble-red-0')
    const blue = screen.getByTestId('marble-blue-0')
    expect(red).toHaveAttribute('data-shared')
    expect(blue).toHaveAttribute('data-shared')
    expect(red.style.transform).toContain('scale(0.68)')
    expect(red.style.transform).not.toBe(blue.style.transform)
    // A marble alone is drawn at full size.
    expect(screen.getByTestId('marble-red-1')).not.toHaveAttribute('data-shared')
  })
})

describe('DicePool (R22)', () => {
  it('shows banked sixes while rolling, then lets the player pick a usable die', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<DicePool pool={[6, 6]} banking selectedDie={null} usable={() => true} interactive onSelect={onSelect} />)
    expect(screen.getByRole('group', { name: 'Banked dice' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<DicePool pool={[6, 6, 3]} banking={false} selectedDie={6} usable={(d) => d === 6} interactive onSelect={onSelect} />)
    const group = screen.getByRole('group', { name: 'Dice to use' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Use the 3 (no move)' })).toBeDisabled()
    fireEvent.click(buttons[1]!)
    expect(onSelect).toHaveBeenCalledWith(6)
  })

  it('stays out of the way with a single die', () => {
    const { container } = render(<DicePool pool={[4]} banking={false} selectedDie={4} usable={() => true} interactive onSelect={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('house rules on setup and in the rules', () => {
  it('starts with every house rule on, lets setup turn them off, and starts the game with the choice', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    const group = screen.getByRole('group', { name: 'House rules' })
    expect(within(group).getByRole('checkbox', { name: /Walk across the centre/ })).toBeChecked()
    fireEvent.click(within(group).getByRole('checkbox', { name: /Walk across the centre/ }))
    expect(useGameStore.getState().settings.houseRules).toEqual({ rollSixesFirst: true, crossCentre: false, safeStarts: true })
    useGameStore.getState().start([{ color: 'red', kind: 'human' }, { color: 'blue', kind: 'bot' }], () => 0)
    expect(useGameStore.getState().game!.rules).toEqual({ rollSixesFirst: true, crossCentre: false, safeStarts: true })
  })

  it('shows which house rules the current game uses', () => {
    useGameStore.getState().updateSettings({ houseRules: { rollSixesFirst: false, crossCentre: true, safeStarts: false } })
    render(<RulesContent />)
    const section = screen.getByRole('heading', { name: 'House rules' }).closest('section')!
    const items = within(section).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.rules-tag')!.textContent)).toEqual(['Off', 'On', 'Off'])
  })
})
