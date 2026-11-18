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
        { color: 'red', kind: 'human', you: true },
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

  it('adds a seat on an empty arm, replacing the oldest pick but never your own seat', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a seat on Purple' }))
    expect(seat('Purple')).toHaveValue('bot')
    expect(seat('Red')).toHaveValue('human')
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string; kind: string }) => [c.color, c.kind])).toEqual([
      ['red', 'human'],
      ['purple', 'bot'],
    ])
  })

  it('moves you to another colour with Sit here, swapping with whoever sat there', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2 teams of 2' }))
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Asha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sit at Blue' }))
    expect(seat('Blue')).toHaveValue('human')
    expect(seat('Red')).toHaveValue('bot')
    fireEvent.click(startButton())
    const blue = onStart.mock.calls[0]![0].find((c: { color: string }) => c.color === 'blue')
    // Your name came with you, and blue's team is now yours.
    expect(blue).toMatchObject({ kind: 'human', name: 'Asha', team: 1 })
  })

  it('can sit on an empty arm in one tap', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sit at Purple' }))
    expect(seat('Purple')).toHaveValue('human')
    expect(seat('Red')).toHaveValue('bot') // your old seat stays, played by a bot
    expect(screen.getAllByRole('combobox', { name: / seat$/ })).toHaveLength(4)
  })

  it('turns everyone round a seat with the arrows, keeping the team pattern', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2 teams of 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move everyone one seat clockwise' }))
    expect(seat('Orange')).toHaveValue('human')
    fireEvent.click(screen.getByRole('button', { name: 'Move everyone one seat anticlockwise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move everyone one seat anticlockwise' }))
    expect(seat('Blue')).toHaveValue('human')
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string; team: number }) => c.team)).toEqual([0, 1, 0, 1])
  })

  it('keeps your colour when the number of players changes', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sit at Blue' }))
    fireEvent.click(screen.getByRole('radio', { name: '3' }))
    expect(seat('Blue')).toHaveValue('human')
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    expect(seat('Blue')).toHaveValue('human')
  })

  it('keeps the seat you chose as yours when other seats become human (Player 1, at the bottom)', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    const area = (name: string) => (seat(name).closest('.seat-card') as HTMLElement).style.gridArea
    const nameOf = (colour: string) => (screen.getByRole('textbox', { name: `${colour} player name` }) as HTMLInputElement).value
    fireEvent.click(screen.getByRole('button', { name: 'Sit at Yellow' }))
    setSeat('Blue', 'human')
    expect([nameOf('Yellow'), nameOf('Blue')]).toEqual(['Player 1', 'Player 2'])
    // Red comes first in colour order, but yellow is still your seat.
    setSeat('Red', 'human')
    expect(area('Yellow')).toBe('b')
    expect([nameOf('Yellow'), nameOf('Blue'), nameOf('Red')]).toEqual(['Player 1', 'Player 2', 'Player 3'])
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].find((c: { you?: boolean }) => c.you)).toMatchObject({ color: 'yellow' })
  })

  it('moves "you" to the next human seat clockwise if your seat becomes a bot', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    const area = (name: string) => (seat(name).closest('.seat-card') as HTMLElement).style.gridArea
    setSeat('Green', 'human')
    setSeat('Red', 'bot')
    expect(area('Green')).toBe('b')
  })

  it("doesn't call a remembered default name taken when seats move (the 'Player 2' bug)", () => {
    // The last game had two local players, saved with their default names.
    const initial = [
      { color: 'red' as const, kind: 'human' as const, name: 'Player 1' },
      { color: 'orange' as const, kind: 'human' as const, name: 'Player 2' },
      { color: 'green' as const, kind: 'bot' as const },
      { color: 'blue' as const, kind: 'bot' as const },
    ]
    render(<SetupScreen onStart={vi.fn()} initial={initial} />)
    setSeat('Orange', 'bot')
    setSeat('Green', 'human')
    setSeat('Blue', 'human')
    expect(screen.queryByText('Name is already taken.')).toBeNull()
    expect(startButton()).toBeEnabled()
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
      { color: 'red', kind: 'human', you: true },
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
        { color: 'purple', kind: 'human', name: 'Zed', you: true },
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
        { color: 'red', kind: 'human', you: true },
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
    expect(onStart).toHaveBeenCalledWith([{ color: 'red', kind: 'bot' }, { color: 'green', kind: 'human', you: true }], false)
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
