import { useEffect, useRef } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { IS_TOUCH } from '../hooks/useShortcuts'
import { SHEET_QUERY } from './Sheet'
import { useGameStore } from '../store/gameStore'

/** Collapsible game log, newest first, derived from events in the store. */
export function GameLog() {
  const log = useGameStore((s) => s.log)
  const open = useGameStore((s) => s.logOpen)
  const setOpen = useGameStore((s) => s.setLogOpen)
  const listRef = useRef<HTMLOListElement>(null)
  const newestFirst = [...log].reverse()

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [log.length, open])

  return (
    <section className="side-card">
      <h2>
        <button
          type="button"
          className="log-toggle"
          aria-expanded={open}
          aria-controls="game-log"
          aria-keyshortcuts="L"
          onClick={() => setOpen(!open)}
        >
          <span className={`chevron${open ? ' chevron-open' : ''}`} aria-hidden="true" />
          Game log
          <span className="log-count">{log.length}</span>
        </button>
      </h2>
      {open && (
        <ol id="game-log" className="log" ref={listRef} aria-label="Game log, latest first">
          {newestFirst.length === 0 && <li className="log-empty">No moves yet.</li>}
          {newestFirst.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Keyboard help. Hidden on touch-only devices. */
export function KeyboardHelp() {
  const bankedDice = useGameStore((s) => s.game?.rules?.rollSixesFirst ?? false)
  const undo = useGameStore((s) => s.settings.undo)
  const teams = useGameStore((s) => s.game?.players.some((p) => p.team !== null) ?? false)
  // Phones (touch, or a narrow window) don't get keyboard help: no room, and rarely a keyboard.
  const phoneSized = useMediaQuery(SHEET_QUERY)
  if (IS_TOUCH || phoneSized) return null
  return (
    <section className="side-card">
      <h2>Keyboard</h2>
      <dl className="shortcuts">
        <dt><kbd>Space</kbd></dt><dd>Roll the die</dd>
        <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Pick a marble</dd>
        <dt><kbd>1</kbd>–<kbd>9</kbd></dt><dd>Then a numbered hole</dd>
        <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Step through marbles or holes (any number), <kbd>Enter</kbd> to choose</dd>
        <dt><kbd>Esc</kbd></dt><dd>Back to picking a marble</dd>
        {teams && (
          <>
            <dt><kbd>1</kbd> <kbd>2</kbd>… <kbd>0</kbd></dt><dd>All home: roll for teammate 1, 2… or pass (online: suggest)</dd>
          </>
        )}
        {bankedDice && (
          <>
            <dt><kbd>D</kbd></dt><dd>Switch die (when several are banked)</dd>
          </>
        )}
        {undo && (
          <>
            <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Undo (move, then roll)</dd>
            <dt><kbd>Ctrl</kbd>+<kbd>Y</kbd></dt><dd>Redo</dd>
          </>
        )}
        <dt><kbd>P</kbd></dt><dd>Pause / resume</dd>
        <dt><kbd>L</kbd></dt><dd>Show / hide game log</dd>
        <dt><kbd>G</kbd></dt><dd>Game: restart or set up a new one</dd>
        <dt><kbd>N</kbd></dt><dd>Restart this game</dd>
        <dt><kbd>S</kbd></dt><dd>Settings</dd>
        <dt><kbd>?</kbd></dt><dd>Game rules</dd>
      </dl>
    </section>
  )
}
