import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, useGameStore } from '../store/gameStore'
import { SetupScreen } from './SetupScreen'

beforeEach(() => {
  useGameStore.getState().updateSettings(DEFAULT_SETTINGS)
})

const startButton = () => screen.getByRole('button', { name: 'Start game' })
const seat = (colour: string) => screen.getByRole('combobox', { name: `${colour} seat` })
const setSeat = (colour: string, kind: 'human' | 'bot' | 'friend') => fireEvent.change(seat(colour), { target: { value: kind } })

describe('SetupScreen', () => {
  it('starts with 4 seats: you and three bots, spread round the board', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(startButton())
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'red', kind: 'human' },
        { color: 'orange', kind: 'bot' },
        { color: 'green', kind: 'bot' },
        { color: 'blue', kind: 'bot' },
      ],
      false,
    )
  })

  it('offers 2 to 6 players, with even default arms', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string }) => c.color)).toEqual(['red', 'green'])
    fireEvent.click(screen.getByRole('radio', { name: '6' }))
    expect(screen.queryByRole('button', { name: /arm: empty/ })).toBeNull()
    expect(screen.getAllByRole('combobox', { name: / seat$/ })).toHaveLength(6)
  })

  it('seats a player on an empty arm, replacing the oldest pick', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Purple arm: empty. Seat a player here' }))
    expect(seat('Purple')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Red arm: empty. Seat a player here' })).toBeInTheDocument()
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string }) => c.color)).toEqual(['green', 'purple'])
  })

  it('lays the seats out like the board, with your seat at the bottom', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    // Red is the human: bottom. Clockwise from there: orange bottom-left... as on the game board.
    const area = (name: string) => (seat(name).closest('.seat-card') as HTMLElement).style.gridArea
    expect(area('Red')).toBe('b')
    expect(area('Orange')).toBe('bl')
    expect(area('Green')).toBe('t')
    expect(area('Blue')).toBe('tr')
    // Make blue the only human: the layout turns so blue is at the bottom, as the game will show it.
    setSeat('Red', 'bot')
    setSeat('Blue', 'human')
    expect(area('Blue')).toBe('b')
    expect(area('Red')).toBe('tl')
  })

  it('needs at least one human', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    setSeat('Red', 'bot')
    expect(screen.getByRole('alert')).toHaveTextContent('At least one seat must be a human player.')
    expect(startButton()).toBeDisabled()
  })

  it('validates names and passes custom names on', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    setSeat('Orange', 'human')
    const second = screen.getAllByRole('textbox')[1]!
    // Clashes with red's default name "Player 1", ignoring case.
    fireEvent.change(second, { target: { value: 'player 1' } })
    expect(screen.getAllByText('Name is already taken.')).toHaveLength(2)
    expect(startButton()).toBeDisabled()
    fireEvent.change(second, { target: { value: 'Ana' } })
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].slice(0, 2)).toEqual([
      { color: 'red', kind: 'human' },
      { color: 'orange', kind: 'human', name: 'Ana' },
    ])
  })

  it('prefills the previous setup', () => {
    const onStart = vi.fn()
    render(
      <SetupScreen
        onStart={onStart}
        initial={[
          { color: 'yellow', kind: 'bot' },
          { color: 'purple', kind: 'human', name: 'Zed' },
        ]}
      />,
    )
    expect(screen.getByRole('radio', { name: '2' })).toBeChecked()
    fireEvent.click(startButton())
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'yellow', kind: 'bot' },
        { color: 'purple', kind: 'human', name: 'Zed' },
      ],
      false,
    )
  })

  it('hosts online: seats can be online friends, and hosting needs one plus a local human', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Online (invite link)' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Set at least one seat to Online friend.')
    // Online play adds "Online friend" to each seat's menu; locally it isn't offered.
    expect(screen.getAllByRole('option', { name: 'Online' }).length).toBeGreaterThan(0)
    setSeat('Orange', 'friend')
    expect(seat('Orange')).toHaveValue('friend')
    expect(screen.getByText('Joins by link')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: 'red', kind: 'human' },
        { color: 'orange', kind: 'human', remote: true },
        { color: 'green', kind: 'bot' },
        { color: 'blue', kind: 'bot' },
      ],
      true,
    )
  })

  it('treats a friend seat as a local human when switched back to this device', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} initial={[{ color: 'red', kind: 'bot' }, { color: 'green', kind: 'human', remote: true }]} />)
    expect(screen.getByRole('radio', { name: 'Online (invite link)' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'On this device' }))
    fireEvent.click(startButton())
    expect(onStart).toHaveBeenCalledWith([{ color: 'red', kind: 'bot' }, { color: 'green', kind: 'human' }], false)
  })

  it('switches comeback dice in the saved settings', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Comeback dice/ }))
    expect(useGameStore.getState().settings.comebackDice).toBe(false)
  })

  it('offers teams for 4 and 6 players, alternating seats round the board', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2 teams of 2' }))
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string; team?: number }) => [c.color, c.team])).toEqual([
      ['red', 0],
      ['orange', 1],
      ['green', 0],
      ['blue', 1],
    ])
    fireEvent.click(screen.getByRole('radio', { name: '6' }))
    expect(screen.getByRole('radio', { name: '3 teams of 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '3 teams of 2' }))
    fireEvent.click(startButton())
    expect(onStart.mock.calls[1]![0].map((c: { team?: number }) => c.team)).toEqual([0, 1, 2, 0, 1, 2])
    // 5 players can't split evenly: no team choice, and nobody gets a team.
    fireEvent.click(screen.getByRole('radio', { name: '5' }))
    expect(screen.queryByRole('group', { name: 'Teams' })).toBeNull()
    fireEvent.click(startButton())
    expect(onStart.mock.calls[2]![0].every((c: { team?: number }) => c.team === undefined)).toBe(true)
  })
})
