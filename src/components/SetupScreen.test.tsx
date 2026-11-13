import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, useGameStore } from '../store/gameStore'
import { SetupScreen } from './SetupScreen'

beforeEach(() => {
  useGameStore.getState().updateSettings(DEFAULT_SETTINGS)
})

const startButton = () => screen.getByRole('button', { name: 'Start game' })
const seat = (colour: string) => screen.getByRole('button', { name: new RegExp(`^${colour} seat`) })

describe('SetupScreen', () => {
  it('starts with 4 seats: you and three bots, spread round the board', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(startButton())
    expect(onStart).toHaveBeenCalledWith([
      { color: 'red', kind: 'human' },
      { color: 'orange', kind: 'bot' },
      { color: 'green', kind: 'bot' },
      { color: 'blue', kind: 'bot' },
    ])
  })

  it('offers 2 to 6 players, with even default arms', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string }) => c.color)).toEqual(['red', 'green'])
    fireEvent.click(screen.getByRole('radio', { name: '6' }))
    expect(screen.queryByRole('group', { name: 'Arms' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /seat:/ })).toHaveLength(6)
  })

  it('replaces the oldest arm pick with a new one', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Purple' }))
    expect(screen.getByRole('button', { name: 'Purple' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(startButton())
    expect(onStart.mock.calls[0]![0].map((c: { color: string }) => c.color)).toEqual(['green', 'purple'])
  })

  it('needs at least one human', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(seat('Red'))
    expect(screen.getByRole('alert')).toHaveTextContent('At least one seat must be a human player.')
    expect(startButton()).toBeDisabled()
  })

  it('validates names and passes custom names on', () => {
    const onStart = vi.fn()
    render(<SetupScreen onStart={onStart} />)
    fireEvent.click(seat('Orange'))
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
    expect(onStart).toHaveBeenCalledWith([
      { color: 'yellow', kind: 'bot' },
      { color: 'purple', kind: 'human', name: 'Zed' },
    ])
  })

  it('switches comeback dice in the saved settings', () => {
    render(<SetupScreen onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Comeback dice/ }))
    expect(useGameStore.getState().settings.comebackDice).toBe(false)
  })
})
