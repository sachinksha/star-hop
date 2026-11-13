import { useState } from 'react'
import { COLORS, armOf } from '../game/board'
import { MAX_PLAYERS, MIN_PLAYERS, displayNames } from '../game/engine'
import { validateNames } from '../game/names'
import { MAX_NAME_LENGTH, type Color, type PlayerConfig, type PlayerKind } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { COLOR_HEX, COLOR_NAME } from './colors'
import { ThemeSwitch } from './Toolbar'

const KIND_LABEL: Record<PlayerKind, string> = { human: 'Human', bot: 'Bot' }

/** Arms spread evenly round the board for each player count. */
const DEFAULT_ARMS: Record<number, Color[]> = {
  2: ['red', 'green'],
  3: ['red', 'yellow', 'blue'],
  4: ['red', 'orange', 'green', 'blue'],
  5: ['red', 'orange', 'yellow', 'green', 'blue'],
  6: [...COLORS],
}

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)

/** Seats in clockwise arm order. */
const byArm = (colors: Color[]) => [...colors].sort((a, b) => armOf(a) - armOf(b))

interface SetupScreenProps {
  onStart: (configs: PlayerConfig[]) => void
  /** Seats from the previous game, used to prefill the form. */
  initial?: PlayerConfig[] | null
}

export function SetupScreen({ onStart, initial }: SetupScreenProps) {
  const valid0 = initial && initial.length >= MIN_PLAYERS && initial.length <= MAX_PLAYERS ? initial : null
  /** Chosen arms, oldest pick first, so a new pick can replace the oldest. */
  const [arms, setArms] = useState<Color[]>(() => valid0?.map((c) => c.color) ?? DEFAULT_ARMS[4]!)
  const [kinds, setKinds] = useState<Partial<Record<Color, PlayerKind>>>(() =>
    Object.fromEntries(valid0?.map((c) => [c.color, c.kind]) ?? []),
  )
  const [names, setNames] = useState<Partial<Record<Color, string>>>(() =>
    Object.fromEntries(valid0?.filter((c) => c.name).map((c) => [c.color, c.name!]) ?? []),
  )
  const comebackDice = useGameStore((s) => s.settings.comebackDice)
  const updateSettings = useGameStore((s) => s.updateSettings)

  const count = arms.length
  const seats = byArm(arms)
  // The first seat defaults to a human, the rest to bots.
  const kindOf = (c: Color): PlayerKind => kinds[c] ?? (c === seats[0] ? 'human' : 'bot')
  const configsFor = (custom: boolean): PlayerConfig[] =>
    seats.map((color) => {
      const kind = kindOf(color)
      const name = custom && kind === 'human' ? names[color]?.trim() : undefined
      return name ? { color, kind, name } : { color, kind }
    })

  const defaults = displayNames(configsFor(false))
  const shown = seats.map((color, i) => {
    const kind = kindOf(color)
    return { color, kind, name: kind === 'human' ? (names[color] ?? defaults[i]!) : defaults[i]! }
  })
  const errors = validateNames(shown)
  const anyHuman = shown.some((s) => s.kind === 'human')
  const valid = Object.keys(errors).length === 0 && anyHuman

  const setCount = (n: number) => setArms(DEFAULT_ARMS[n]!)

  /** Picks an arm. With all seats placed, a new pick replaces the oldest one. */
  const pickArm = (color: Color) => {
    if (arms.includes(color)) return
    setArms((prev) => [...prev.slice(1), color])
  }

  return (
    <section className="setup" aria-labelledby="setup-title">
      <div className="setup-corner">
        <ThemeSwitch />
      </div>
      <h1 id="setup-title">Star Hop</h1>
      <p className="tagline">A marble race for 2 to 6. Roll, hop the stars, bump your friends.</p>

      <fieldset className="choice-row">
        <legend>Players</legend>
        {COUNTS.map((n) => (
          <label key={n} className="chip">
            <input type="radio" name="count" value={n} checked={count === n} onChange={() => setCount(n)} />
            {n}
          </label>
        ))}
      </fieldset>

      {count < MAX_PLAYERS && (
        <fieldset className="arm-picker">
          <legend>Arms</legend>
          <p className="setup-hint">Pick {count} of the 6 arms. A new pick replaces your oldest one.</p>
          <div className="arm-chips">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="arm-chip"
                style={{ ['--arm' as string]: COLOR_HEX[color] }}
                aria-pressed={arms.includes(color)}
                onClick={() => pickArm(color)}
              >
                <span className="seat-dot" aria-hidden="true" />
                {COLOR_NAME[color]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="seat-list">
        <legend>Seats</legend>
        {shown.map(({ color, kind, name }) => {
          const error = errors[color]
          const inputId = `name-${color}`
          return (
            <div key={color} className="seat-card" style={{ ['--arm' as string]: COLOR_HEX[color] }}>
              <button
                type="button"
                className="seat-kind"
                onClick={() => setKinds((prev) => ({ ...prev, [color]: kind === 'human' ? 'bot' : 'human' }))}
                aria-label={`${COLOR_NAME[color]} seat: ${KIND_LABEL[kind]}. Click to change`}
              >
                <span className="seat-dot" aria-hidden="true" />
                <span>{COLOR_NAME[color]}</span>
                <strong>{KIND_LABEL[kind]}</strong>
              </button>
              {kind === 'human' ? (
                <>
                  <label className="sr-only" htmlFor={inputId}>
                    {COLOR_NAME[color]} player name
                  </label>
                  <input
                    id={inputId}
                    className={`seat-name${error ? ' seat-name-invalid' : ''}`}
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    onChange={(e) => setNames((prev) => ({ ...prev, [color]: e.target.value }))}
                  />
                  {error && (
                    <span id={`${inputId}-error`} className="field-error" role="alert">
                      {error}
                    </span>
                  )}
                </>
              ) : (
                <span className="seat-bot-name">{name}</span>
              )}
            </div>
          )
        })}
      </fieldset>
      <p className="setup-hint">Names can be up to {MAX_NAME_LENGTH} characters. Click a seat to switch between human and bot.</p>
      {!anyHuman && (
        <p className="field-error" role="alert">
          At least one seat must be a human player.
        </p>
      )}

      <label className="setup-option">
        <input type="checkbox" checked={comebackDice} onChange={(e) => updateSettings({ comebackDice: e.target.checked })} />
        <span>
          <strong>Comeback dice</strong>
          <span className="setup-option-hint">
            A player with nothing on the board who misses 3 entry rolls in a row gets a growing chance of a 1 or 6. Applies to bots too.
          </span>
        </span>
      </label>

      <button type="button" className="primary start-button" onClick={() => valid && onStart(configsFor(true))} disabled={!valid}>
        Start game
      </button>
    </section>
  )
}
