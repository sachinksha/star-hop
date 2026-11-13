import { useEffect, useRef } from 'react'
import { IS_TOUCH } from '../hooks/useShortcuts'
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
  if (IS_TOUCH) return null
  return (
    <section className="side-card">
      <h2>Keyboard</h2>
      <dl className="shortcuts">
        <dt><kbd>Space</kbd></dt><dd>Roll the die</dd>
        <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Pick a marble</dd>
        <dt><kbd>1</kbd>–<kbd>7</kbd></dt><dd>Then pick where it goes (numbered on the board)</dd>
        <dt><kbd>Esc</kbd></dt><dd>Back to picking a marble</dd>
        <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Undo / redo</dd>
        <dt><kbd>P</kbd></dt><dd>Pause / resume</dd>
        <dt><kbd>L</kbd></dt><dd>Show / hide game log</dd>
        <dt><kbd>N</kbd></dt><dd>New game</dd>
        <dt><kbd>S</kbd></dt><dd>Settings</dd>
      </dl>
    </section>
  )
}
