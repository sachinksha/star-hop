import { useState } from 'react'
import { armOf } from '../game/board'
import { formatClock, useGameClock } from '../hooks/useGameClock'
import { useGuestView, useHostView } from '../hooks/useOnline'
import { IS_TOUCH, useShortcuts } from '../hooks/useShortcuts'
import type { StarHopController } from '../hooks/useStarHopGame'
import { useGameStore } from '../store/gameStore'
import { useOnlineStore } from '../store/onlineStore'
import { Board } from './Board'
import { COLOR_HEX } from './colors'
import { ConfirmDialog } from './ConfirmDialog'
import { Die } from './Dice'
import { FinishBanner } from './FinishBanner'
import { GameLog, KeyboardHelp } from './GameLog'
import { Icon } from './Icons'
import { PlayerPanel } from './PlayerPanel'
import { SettingSwitch, ThemeSwitch, ToolButton } from './Toolbar'
import { WinOverlay } from './WinOverlay'

type PendingAction = 'settings' | 'new' | null

/** "Your turn." for the default name, otherwise addresses the player by name. */
function turnOf(name: string): string {
  return name === 'You' ? 'Your turn.' : `${name}, your turn.`
}

export function GameScreen({ hop }: { hop: StarHopController }) {
  const { game, shownPlayers, rolling, busy, paused, role, humanTurn, isMine, selected, destinations, movesFor, pickMarble, chooseDestination, playMove, cancelSelection, lastMove, celebration, notice, offerEnd, endEarly, keepWatching, takeoverSeat, canUndo, canRedo, canPause, roll, undo, redo, togglePause } = hop
  const leaveOnline = useOnlineStore((s) => s.leave)
  const reconnect = useOnlineStore((s) => s.reconnect)
  const hostView = useHostView()
  const guestView = useGuestView()
  const online = role !== 'local'
  const isGuest = role === 'guest'
  const actions = useGameStore((s) => s.actions)
  const latestLog = useGameStore((s) => s.log.at(-1)?.text ?? '')
  const autoRoll = useGameStore((s) => s.settings.autoRoll)
  const start = useGameStore((s) => s.start)
  const abort = useGameStore((s) => s.abort)
  const configs = useGameStore((s) => s.configs)
  const logOpen = useGameStore((s) => s.logOpen)
  const setLogOpen = useGameStore((s) => s.setLogOpen)

  const [pending, setPending] = useState<PendingAction>(null)
  /** A short hint for the last thing the player tried, tied to the position it was given in. */
  const [hint, setHint] = useState<{ seq: number; text: string } | null>(null)
  // This device's player sits at the bottom. Fixed for the game, so the board never spins.
  const [bottom] = useState(() => {
    const me = game.players.find((p) => isMine(p.color))
    return me ? armOf(me.color) : 0
  })

  const gameOver = game.phase === 'gameOver'
  const inProgress = !gameOver && actions.length > 0
  const current = game.players[game.currentIndex]!
  const elapsed = useGameClock(!paused && !gameOver)
  const canRoll = humanTurn && game.phase === 'roll' && !busy && !paused
  const canPick = humanTurn && game.phase === 'move' && !busy && !paused
  const pickable = canPick ? [...new Set(game.legalMoves.map((m) => m.marbleId))] : []
  const lastRoll = [...actions].reverse().find((a) => a.type === 'roll')
  const shownHint = hint && hint.seq === game.actionSeq ? hint.text : null

  // Online, leaving ends the session (host) or leaves it (guest).
  const doSettings = () => (online ? leaveOnline() : abort())
  const doNew = () => {
    if (isGuest) return
    // Hosts restart from the session's current seats (a seat a bot took over stays a bot).
    if (role === 'host') useOnlineStore.getState().startHostedGame()
    else if (configs) start(configs)
  }
  const requestSettings = () => (inProgress || (online && !gameOver) ? setPending('settings') : doSettings())
  const requestNew = () => {
    if (isGuest) return
    if (inProgress) setPending('new')
    else doNew()
  }

  // Host: online players who dropped out of a game still in progress.
  const leftSeats =
    !gameOver && hostView
      ? hostView.seats.filter(
          (s) => s.remote && s.joined && !s.connected && game.players.some((p) => p.color === s.color && p.remote && p.finishRank === null),
        )
      : []
  const confirmPending = () => {
    if (pending === 'settings') doSettings()
    if (pending === 'new') doNew()
    setPending(null)
  }

  const pick = (marbleId: number) => {
    const result = pickMarble(marbleId)
    if (result === 'none' && canPick) {
      setHint({ seq: game.actionSeq, text: `Marble ${marbleId + 1} can't move with a ${game.dice}.` })
    } else {
      setHint(null)
    }
  }

  /** Digit keys: a destination while badges are up, otherwise a marble. */
  const digit = (n: number) => () => {
    if (selected !== null) {
      if (n > destinations.length) return false
      chooseDestination(n - 1)
      return true
    }
    if (!canPick || n > 4) return false
    pick(n - 1)
    return true
  }

  useShortcuts(
    {
      ' ': () => {
        if (canRoll) roll()
      },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), digit(n)])),
      Escape: () => {
        if (selected === null) return false
        cancelSelection()
      },
      ArrowLeft: () => (canUndo ? void undo() : false),
      ArrowRight: () => (canRedo ? void redo() : false),
      p: () => {
        if (!gameOver && canPause) togglePause()
      },
      n: requestNew,
      s: requestSettings,
      l: () => setLogOpen(!logOpen),
    },
    !pending && !offerEnd && !gameOver,
  )
  // With the win overlay up, only new game and settings make sense.
  useShortcuts({ n: doNew, s: doSettings }, gameOver && !busy)

  const lastEvents = game.events
  const oops = lastEvents.find((e) => e.type === 'noMoves')
  let prompt: string
  if (gameOver) prompt = 'Game over'
  else if (paused && isGuest) prompt = 'The host paused the game.'
  else if (paused) prompt = IS_TOUCH ? 'Paused. Tap Resume to keep playing.' : 'Paused. Press P or Resume to keep playing.'
  else if (oops?.type === 'noMoves' && (busy || !humanTurn || game.phase === 'roll')) {
    const who = game.players.find((p) => p.color === oops.color)!
    const roller = who.name === 'You' ? 'You' : who.name
    prompt = `Oops! ${roller} rolled a ${who.lastRoll} with no legal move.${oops.rollAgain ? ' A 6 rolls again.' : ''}`
  } else if (busy) prompt = 'Moving...'
  else if (celebration) prompt = celebration.name === 'You' ? 'You got all your marbles home!' : `${celebration.name} got all their marbles home!`
  else if (!humanTurn) prompt = `${current.name} is playing...`
  else if (game.phase === 'roll' && autoRoll) prompt = `${turnOf(current.name)} Rolling...`
  else if (game.phase === 'roll') prompt = `${turnOf(current.name)} ${IS_TOUCH ? 'Tap the die to roll.' : 'Press Space or tap the die to roll.'}`
  else if (selected !== null)
    prompt = IS_TOUCH
      ? `Rolled ${game.dice}. Tap a numbered hole for marble ${selected + 1}, or tap the marble again to go back.`
      : `Rolled ${game.dice}. Pick where marble ${selected + 1} goes: press 1–${destinations.length}, or Esc to go back.`
  else prompt = IS_TOUCH ? `Rolled ${game.dice}. Tap a glowing marble.` : `Rolled ${game.dice}. Pick a marble: press 1–4 or click a glowing one.`

  return (
    <section className="game" aria-label="Star Hop game">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1 className="game-title">Star Hop</h1>
          <span className={`clock${paused ? ' clock-paused' : ''}`} role="timer" aria-label={`Game time ${formatClock(elapsed)}${paused ? ', paused' : ''}`}>
            <Icon name="clock" size={16} />
            <span aria-hidden="true">{formatClock(elapsed)}</span>
          </span>
        </div>
        <div className="toolbar-actions">
          {!online && <ToolButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} shortcut="ArrowLeft" shortcutLabel="←" />}
          {!online && <ToolButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} shortcut="ArrowRight" shortcutLabel="→" />}
          {canPause && (
            <ToolButton icon={paused ? 'play' : 'pause'} label={paused ? 'Resume' : 'Pause'} onClick={togglePause} disabled={gameOver} pressed={paused} shortcut="P" shortcutLabel="P" />
          )}
          <SettingSwitch setting="autoRoll" icon="dice" label="Auto roll" title="Roll the die automatically on your turn. You still choose every real move." />
          <SettingSwitch setting="autoMove" icon="forward" label="Auto move" title="Play your move automatically when the roll leaves no real choice." />
          <SettingSwitch setting="sound" icon="speaker" label="Sound" />
          <ThemeSwitch />
          <ToolButton
            icon="gear"
            label={role === 'host' ? 'End online game' : isGuest ? 'Leave game' : 'Settings'}
            onClick={requestSettings}
            shortcut="S"
            shortcutLabel="S"
          />
          {!isGuest && <ToolButton icon="restart" label="New game" onClick={requestNew} disabled={!configs} shortcut="N" shortcutLabel="N" />}
        </div>
      </header>

      {isGuest && guestView?.status === 'lost' && (
        <div className="net-banner" role="alert">
          <span>The connection to the host dropped.</span>
          <button type="button" className="primary" onClick={reconnect}>
            Reconnect
          </button>
          <button type="button" onClick={leaveOnline}>
            Leave
          </button>
        </div>
      )}
      {notice && (
        <div key={notice.id} className="notice" style={{ ['--arm' as string]: COLOR_HEX[notice.color] }} role="status">
          <Icon name="robot" />
          <span>{notice.text}</span>
        </div>
      )}
      {leftSeats.map((s) => (
        <div key={s.color} className="net-banner" role="alert">
          <span>{s.name} lost connection. They can rejoin with their link, or a bot can take over.</span>
          <button type="button" onClick={() => takeoverSeat(s.color)} disabled={busy}>
            Let a bot play
          </button>
        </div>
      ))}

      <div className="game-body">
        <ol className="panels" aria-label="Players in turn order">
          {shownPlayers.map((p) => (
            <PlayerPanel key={p.color} player={p} active={!gameOver && p.color === current.color} />
          ))}
        </ol>

        <div className={`table${paused ? ' table-paused' : ''}`}>
          <Board
            players={shownPlayers}
            bottom={bottom}
            activeColor={gameOver ? null : current.color}
            pickable={pickable}
            selected={canPick ? selected : null}
            destinations={canPick ? destinations : []}
            showNumbers={humanTurn && !IS_TOUCH}
            lastMove={lastMove}
            onPickMarble={(id) => (selected === id ? cancelSelection() : pick(id))}
            onChooseMove={playMove}
          />
          {celebration && <FinishBanner key={celebration.color} {...celebration} />}
          {paused && (
            <div className="pause-veil" role="status">
              <p>{isGuest ? 'The host paused the game' : 'Game paused'}</p>
              {canPause && (
                <button type="button" className="primary" onClick={togglePause}>
                  <Icon name="play" /> <span>Resume</span>
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="side">
          <div className="dice-card" style={{ ['--arm' as string]: COLOR_HEX[current.color] }}>
            <Die
              value={game.dice ?? (lastRoll?.type === 'roll' ? lastRoll.value : null)}
              rolling={rolling}
              clickable={canRoll}
              onRoll={roll}
              label={`${current.name}'s die`}
            />
            <p className="prompt" aria-live="polite">
              {prompt}
            </p>
            {shownHint && (
              <p className="hint" role="status">
                {shownHint}
              </p>
            )}
            {canPick && selected === null && pickable.length > 0 && (
              <p className="sr-only">
                Marbles you can move: {pickable.map((id) => `${id + 1} (${movesFor(id).length} ${movesFor(id).length === 1 ? 'place' : 'places'})`).join(', ')}
              </p>
            )}
          </div>
          <GameLog />
          <KeyboardHelp />
        </aside>
      </div>

      {/* Reads out each new log line (bumps, bot moves) for screen reader users. */}
      <p className="sr-only" aria-live="polite" data-testid="announcer">
        {latestLog}
      </p>

      {pending && (
        <ConfirmDialog
          title={role === 'host' && pending === 'settings' ? 'End the online game?' : isGuest ? 'Leave this game?' : 'Abandon the current game?'}
          message={
            role === 'host' && pending === 'settings'
              ? 'This ends the game for everyone and closes the invite link.'
              : isGuest
                ? 'You will leave the game. The host can let a bot take your seat.'
                : role === 'host'
                  ? 'This game is still in progress. A new game starts for everyone with the same seats.'
                  : 'This game is still in progress. Abandoning it discards it for good.'
          }
          confirmLabel={
            role === 'host' && pending === 'settings'
              ? 'End for everyone'
              : isGuest
                ? 'Leave'
                : pending === 'settings'
                  ? 'Abandon and open settings'
                  : 'Abandon and start new'
          }
          cancelLabel="Keep playing"
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}

      {offerEnd && !pending && (
        <ConfirmDialog
          title={game.players.filter((p) => p.kind === 'human').length > 1 ? 'All human players have finished' : 'You have finished'}
          message="Only bots are left. End the game now and rank the remaining bots by how far their marbles got, or keep watching them play it out."
          confirmLabel="End game"
          cancelLabel="Keep watching"
          confirmClass="primary"
          onConfirm={endEarly}
          onCancel={keepWatching}
        />
      )}

      {gameOver && !busy && (
        <WinOverlay
          early={game.events.some((e) => e.type === 'gameOver' && e.early)}
          winners={game.winners}
          time={formatClock(elapsed)}
          names={Object.fromEntries(game.players.map((p) => [p.color, p.name]))}
          onNewGame={isGuest || !configs ? undefined : doNew}
          onSetup={doSettings}
          setupLabel={role === 'host' ? 'End online game' : isGuest ? 'Leave' : undefined}
          note={isGuest ? 'Waiting for the host to start another game...' : undefined}
        />
      )}
    </section>
  )
}
