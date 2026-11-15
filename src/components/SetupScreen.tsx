import { useState } from 'react'
import { COLORS, armOf } from '../game/board'
import { MAX_PLAYERS, MIN_PLAYERS, displayNames } from '../game/engine'
import { validateNames } from '../game/names'
import { TEAM_OPTIONS, assignTeams, teamLabel } from '../game/teams'
import { HOUSE_RULE_KEYS, MAX_NAME_LENGTH, type Color, type PlayerConfig } from '../game/types'
import { HOUSE_RULE_TEXT } from './houseRuleText'
import { useGameStore } from '../store/gameStore'
import { COLOR_HEX, COLOR_NAME } from './colors'
import { RulesButton } from './RulesSheet'
import { MiniBoard } from './SeatMap'
import { seatArea } from './seatArea'
import { SettingsButton } from './SettingsSheet'

/** What sits in a seat. "friend" is a human on another device; it only exists online. */
type SeatKind = 'human' | 'bot' | 'friend'
type PlayMode = 'local' | 'online'


/** Short labels for the seat menu, which is narrow on a phone. The hint below the seats explains them. */
const OPTION_LABEL: Record<SeatKind, string> = { human: 'Human', bot: 'Bot', friend: 'Online' }

/** Who can sit in a seat. "Online friend" only exists when playing online. */
const SEAT_KINDS: Record<PlayMode, readonly SeatKind[]> = { local: ['human', 'bot'], online: ['human', 'bot', 'friend'] }

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
  /** `online` asks to open an online lobby instead of starting at once. */
  onStart: (configs: PlayerConfig[], online: boolean) => void
  /** Seats from the previous game, used to prefill the form. */
  initial?: PlayerConfig[] | null
  /** True while an online lobby is being opened. */
  busy?: boolean
  /** A problem to show, such as the connection server being unreachable. */
  error?: string | null
}

export function SetupScreen({ onStart, initial, busy = false, error = null }: SetupScreenProps) {
  const valid0 = initial && initial.length >= MIN_PLAYERS && initial.length <= MAX_PLAYERS ? initial : null
  /** Chosen arms, oldest pick first, so a new pick can replace the oldest. */
  const [arms, setArms] = useState<Color[]>(() => valid0?.map((c) => c.color) ?? DEFAULT_ARMS[4]!)
  const [play, setPlay] = useState<PlayMode>(() => (valid0?.some((c) => c.remote) ? 'online' : 'local'))
  const [kinds, setKinds] = useState<Partial<Record<Color, SeatKind>>>(() =>
    Object.fromEntries(valid0?.map((c) => [c.color, c.remote ? 'friend' : c.kind]) ?? []),
  )
  /** Number of teams, or 0 for everyone on their own. Only offered for 4 and 6 players. */
  const [teamCount, setTeamCount] = useState<number>(() =>
    valid0?.every((c) => c.team !== undefined) ? new Set(valid0.map((c) => c.team)).size : 0,
  )
  const [names, setNames] = useState<Partial<Record<Color, string>>>(() =>
    Object.fromEntries(valid0?.filter((c) => c.name && !c.remote).map((c) => [c.color, c.name!]) ?? []),
  )
  const comebackDice = useGameStore((s) => s.settings.comebackDice)
  const houseRules = useGameStore((s) => s.settings.houseRules)
  const updateSettings = useGameStore((s) => s.updateSettings)

  const count = arms.length
  const seats = byArm(arms)
  const teamChoices = TEAM_OPTIONS[count] ?? []
  // A team layout that doesn't fit the new player count quietly switches off.
  const teams = teamChoices.includes(teamCount) ? assignTeams(count, teamCount) : null
  // The first seat defaults to a human, the rest to bots. Locally a friend seat is just a human.
  const kindOf = (c: Color): SeatKind => {
    const kind = kinds[c] ?? (c === seats[0] ? 'human' : 'bot')
    return play === 'local' && kind === 'friend' ? 'human' : kind
  }
  const configsFor = (custom: boolean): PlayerConfig[] =>
    seats.map((color, i) => {
      const kind = kindOf(color)
      const team = teams ? { team: teams[i]! } : {}
      if (kind === 'friend') return { color, kind: 'human', remote: true, ...team }
      const name = custom && kind === 'human' ? names[color]?.trim() : undefined
      return name ? { color, kind, name, ...team } : { color, kind, ...team }
    })

  // The game draws this device's first human seat at the bottom; setup shows the same view.
  const mySeat = seats.find((c) => kindOf(c) === 'human') ?? seats[0]
  const bottom = mySeat ? armOf(mySeat) : 0

  const defaults = displayNames(configsFor(false))
  const shown = seats.map((color, i) => {
    const kind = kindOf(color)
    return { color, kind, name: kind === 'human' ? (names[color] ?? defaults[i]!) : defaults[i]! }
  })
  // Friends choose their own names when they join, so only local humans are checked here.
  const errors = validateNames(shown.map((s) => ({ ...s, kind: s.kind === 'human' ? 'human' : 'bot' })))
  const anyHuman = shown.some((s) => s.kind === 'human')
  const anyFriend = shown.some((s) => s.kind === 'friend')
  const problem = !anyHuman
    ? play === 'online'
      ? 'You need a Human seat on this device to host.'
      : 'At least one seat must be a human player.'
    : play === 'online' && !anyFriend
      ? 'Set at least one seat to Online friend.'
      : null
  const valid = Object.keys(errors).length === 0 && problem === null && !busy

  const setCount = (n: number) => setArms(DEFAULT_ARMS[n]!)

  /** Picks an arm. With all seats placed, a new pick replaces the oldest one. */
  const pickArm = (color: Color) => {
    if (arms.includes(color)) return
    setArms((prev) => [...prev.slice(1), color])
  }

  return (
    <section className="setup" aria-labelledby="setup-title">
      <div className="setup-corner">
        <RulesButton />
        <SettingsButton />
      </div>
      <h1 id="setup-title">Star Hop</h1>
      <p className="tagline">A marble race for 2 to 6. Roll, hop the stars, bump your friends.</p>

      <fieldset className="choice-row">
        <legend>Play</legend>
        {(['local', 'online'] as const).map((p) => (
          <label key={p} className="chip">
            <input type="radio" name="play" value={p} checked={play === p} onChange={() => setPlay(p)} />
            {p === 'local' ? 'On this device' : 'Online (invite link)'}
          </label>
        ))}
      </fieldset>

      <fieldset className="choice-row">
        <legend>Players</legend>
        {COUNTS.map((n) => (
          <label key={n} className="chip">
            <input type="radio" name="count" value={n} checked={count === n} onChange={() => setCount(n)} />
            {n}
          </label>
        ))}
      </fieldset>

      {teamChoices.length > 0 && (
        <fieldset className="choice-row">
          <legend>Teams</legend>
          {[0, ...teamChoices].map((k) => (
            <label key={k} className="chip">
              <input type="radio" name="teams" value={k} checked={(teams ? teamCount : 0) === k} onChange={() => setTeamCount(k)} />
              {k === 0 ? 'Everyone for themselves' : `${k} teams of ${count / k}`}
            </label>
          ))}
          {teams && (
            <p className="setup-hint setup-hint-wide">
              Teammates sit apart and take turns in between. Landing on a teammate bumps them too, so steer clear. Once
              you're home you roll for a teammate. Click seats to choose who plays which.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="seat-list">
        <legend>Seats</legend>
        <p className="setup-hint">
          Laid out like the board, with your seat at the bottom.
          {count < MAX_PLAYERS && ` Tap an empty arm to seat a player there (it replaces your oldest pick).`}
        </p>
        <div className="seat-grid">
          <div className="seat-grid-board">
            <MiniBoard bottom={bottom} seated={seats} onPickArm={count < MAX_PLAYERS ? pickArm : undefined} />
          </div>
          {COLORS.filter((c) => !seats.includes(c)).map((color) => (
            <button
              key={color}
              type="button"
              className="seat-empty"
              style={{ gridArea: seatArea(armOf(color), bottom), ['--arm' as string]: COLOR_HEX[color] }}
              onClick={() => pickArm(color)}
              disabled={count >= MAX_PLAYERS}
              aria-label={`${COLOR_NAME[color]} arm: empty. Seat a player here`}
            >
              <span className="seat-dot" aria-hidden="true" />
              <span>{COLOR_NAME[color]}</span>
              <span className="seat-empty-hint">Empty · tap to seat</span>
            </button>
          ))}
        {shown.map(({ color, kind, name }, i) => {
          const error = errors[color]
          const inputId = `name-${color}`
          return (
            <div key={color} className="seat-card" style={{ gridArea: seatArea(armOf(color), bottom), ['--arm' as string]: COLOR_HEX[color] }}>
              {teams && <span className={`team-chip team-chip-wide team-${teams[i]}`}>{teamLabel(teams[i]!)}</span>}
              <div className="seat-kind">
                <span className="seat-dot" aria-hidden="true" />
                <span>{COLOR_NAME[color]}</span>
                {/* A labelled dropdown says plainly what can change and to what. */}
                <select
                  className="seat-kind-select"
                  aria-label={`${COLOR_NAME[color]} seat`}
                  value={kind}
                  onChange={(e) => setKinds((prev) => ({ ...prev, [color]: e.target.value as SeatKind }))}
                >
                  {SEAT_KINDS[play].map((k) => (
                    <option key={k} value={k}>
                      {OPTION_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
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
                <span className="seat-bot-name">{kind === 'friend' ? 'Joins by link' : name}</span>
              )}
            </div>
          )
        })}
        </div>
      </fieldset>
      <p className="setup-hint">
        Use each seat's menu to choose who plays it: <b>Human</b> (on this device) or <b>Bot</b>
        {play === 'online' ? <>, or <b>Online</b>: a friend who joins with your invite link and picks their own name</> : ' (choose Online above to invite friends)'}.
        Names can be up to {MAX_NAME_LENGTH} characters.
      </p>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}

      <fieldset className="house-rules">
        <legend>House rules</legend>
        <p className="setup-hint">Optional rules, fixed for the whole game. Everyone (bots too) plays by them.</p>
        <label className="setup-option">
          <input type="checkbox" checked={comebackDice} onChange={(e) => updateSettings({ comebackDice: e.target.checked })} />
          <span>
            <strong>Comeback dice</strong>
            <span className="setup-option-hint">
              A player with nothing on the board who misses 3 entry rolls in a row gets a growing chance of a 1 or 6.
            </span>
          </span>
        </label>
        {HOUSE_RULE_KEYS.map((key) => (
          <label key={key} className="setup-option">
            <input
              type="checkbox"
              checked={houseRules[key]}
              onChange={(e) => updateSettings({ houseRules: { ...houseRules, [key]: e.target.checked } })}
            />
            <span>
              <strong>{HOUSE_RULE_TEXT[key].title}</strong>
              <span className="setup-option-hint">{HOUSE_RULE_TEXT[key].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary start-button" onClick={() => valid && onStart(configsFor(true), play === 'online')} disabled={!valid}>
        {play === 'online' ? (busy ? 'Opening lobby...' : 'Create invite link') : 'Start game'}
      </button>
    </section>
  )
}
