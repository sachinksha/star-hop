import { useRef, useState } from 'react'
import { armOf } from '../game/board'
import { hasTeams, isHelperTurn, teamStandings } from '../game/teams'
import { HOUSE_RULE_KEYS } from '../game/types'
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
import { DicePool } from './DicePool'
import { HOUSE_RULE_TEXT } from './houseRuleText'
import { FinishBanner } from './FinishBanner'
import { GameLog, KeyboardHelp } from './GameLog'
import { Icon } from './Icons'
import { MovePad, type PadTarget } from './MovePad'
import { PlayerPanel } from './PlayerPanel'
import { RulesSheet } from './RulesSheet'
import { GameMenu } from './GameMenu'
import { SettingsSheet } from './SettingsSheet'
import { SHEET_QUERY } from './Sheet'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { TeamTurn } from './TeamTurn'
import { suggestingTeammate, suggestionOptions } from '../net/nudges'
import { ToolButton } from './Toolbar'
import { WinOverlay } from './WinOverlay'

/** A confirmation waiting on screen: leave for setup, or start a new game. */
type PendingAction = 'settings' | 'new' | null
/** The sheet open over the game, if any. */
type OpenSheet = 'rules' | 'settings' | 'game' | null

/** "Your turn." for the default name, otherwise addresses the player by name. */
function turnOf(name: string): string {
  return name === 'You' ? 'Your turn.' : `${name}, your turn.`
}

export function GameScreen({ hop }: { hop: StarHopController }) {
  const { game, shownPlayers, rolling, busy, paused, role, humanTurn, mover, helperChoices, isMine, pool, selectedDie, selectDie, dieMoves, selected, destinations, movesFor, pickMarble, chooseDestination, playMove, cancelSelection, lastMove, celebration, notice, offerEnd, endEarly, keepWatching, takeoverSeat, canUndo, canRedo, canPause, roll, rollFor, pass, undo, redo, togglePause } = hop
  const leaveOnline = useOnlineStore((s) => s.leave)
  const reconnect = useOnlineStore((s) => s.reconnect)
  const nudges = useOnlineStore((s) => s.nudges)
  const sendNudge = useOnlineStore((s) => s.nudge)
  const hostView = useHostView()
  const guestView = useGuestView()
  const online = role !== 'local'
  const isGuest = role === 'guest'
  const actions = useGameStore((s) => s.actions)
  const latestLog = useGameStore((s) => s.log.at(-1)?.text ?? '')
  const autoRoll = useGameStore((s) => s.settings.autoRoll)
  const moveButtons = useGameStore((s) => s.settings.moveButtons)
  const start = useGameStore((s) => s.start)
  const abort = useGameStore((s) => s.abort)
  const configs = useGameStore((s) => s.configs)
  const logOpen = useGameStore((s) => s.logOpen)
  const setLogOpen = useGameStore((s) => s.setLogOpen)

  const [pending, setPending] = useState<PendingAction>(null)
  const [sheet, setSheet] = useState<OpenSheet>(null)
  /** True when opening a sheet paused the game, so closing it resumes it. */
  const pausedForSheet = useRef(false)
  /** The move button being pressed, highlighted on the board. */
  const [padTarget, setPadTarget] = useState<PadTarget | null>(null)
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
  const helperTurn = isHelperTurn(game)
  const canRoll = humanTurn && game.phase === 'roll' && !busy && !paused && !helperTurn
  const canPick = humanTurn && game.phase === 'move' && !busy && !paused
  // Move buttons: on phones by default (touch, or a narrow screen), where board pieces are smaller than a fingertip.
  const phoneSized = useMediaQuery(SHEET_QUERY)
  const showPad = moveButtons === 'on' || (moveButtons === 'auto' && (IS_TOUCH || phoneSized))
  const teams = hasTeams(game.players)
  const pickable = canPick ? [...new Set(dieMoves.map((m) => m.marbleId))] : []
  const usableDice = new Set(game.legalMoves.map((m) => m.die))
  /** "Rolled 4", or with several dice banked (R22) "Dice 6, 6, 3: using the 3". */
  const rolledText = pool.length > 1 ? `Dice ${pool.join(', ')}: using the ${selectedDie}.` : `Rolled ${selectedDie ?? game.dice}.`
  const banking = game.phase === 'roll' && pool.length > 0
  /** The same turn still has a banked die to use after a move: keep showing it (R22). */
  const continuing = game.phase === 'move' && game.rules?.rollSixesFirst === true && actions.at(-1)?.type === 'move'
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
  // Reading the rules or changing settings mid-game shouldn't cost a turn: a
  // local game pauses while a sheet is open. Online games never pause for one player.
  const openSheet = (which: Exclude<OpenSheet, null>) => {
    if (role === 'local' && !paused && !gameOver) {
      pausedForSheet.current = true
      togglePause()
    }
    setSheet(which)
  }
  const closeSheet = () => {
    setSheet(null)
    if (pausedForSheet.current) {
      pausedForSheet.current = false
      if (useGameStore.getState().paused) togglePause()
    }
  }
  const openRules = () => openSheet('rules')
  const openSettings = () => openSheet('settings')
  const openGameMenu = () => openSheet('game')
  /** From the game menu: close it, then ask before ending or restarting the game. */
  const fromMenu = (action: () => void) => () => {
    closeSheet()
    action()
  }

  const confirmPending = () => {
    if (pending === 'settings') doSettings()
    if (pending === 'new') doNew()
    setPending(null)
  }

  const pick = (marbleId: number) => {
    const result = pickMarble(marbleId)
    if (result === 'none' && canPick) {
      setHint({ seq: game.actionSeq, text: `Marble ${marbleId + 1} can't move with a ${selectedDie}.` })
    } else {
      setHint(null)
    }
  }

  const undoOn = useGameStore((s) => s.settings.undo) && !online
  /**
   * Moves keyboard focus to the next (or previous) pickable marble, or
   * numbered hole when a marble is picked. Focus previews the path, and Enter
   * on the focused piece chooses it (each piece is a button).
   */
  const cycleFocus = (dir: 1 | -1) => {
    if (!canPick) return false
    const selector = selected !== null ? '[data-testid^="destination-"]' : '.marble-pickable'
    const pieces = [...document.querySelectorAll<SVGGElement>(`svg.board ${selector}`)]
    if (pieces.length === 0) return false
    const at = pieces.indexOf(document.activeElement as SVGGElement)
    const next = at < 0 ? (dir === 1 ? 0 : pieces.length - 1) : (at + dir + pieces.length) % pieces.length
    pieces[next]!.focus()
  }

  // Team play keys: the roller picks a teammate with 1, 2... and passes with 0; an online
  // teammate on this device sends the same choices as suggestions.
  const suggester = suggestingTeammate(game, isMine, online)
  const teamKey = (n: number): boolean | null => {
    if (!helperTurn || busy || paused) return null
    if (helperChoices.length > 0) {
      if (n === 0) pass()
      else if (helperChoices[n - 1]) rollFor(helperChoices[n - 1]!.color)
      else return false
      return true
    }
    if (suggester) {
      const options = suggestionOptions(game, suggester)
      const option = n === 0 ? options.at(-1) : n <= options.length - 1 ? options[n - 1] : undefined
      if (!option) return false
      sendNudge(suggester.color, option.nudge)
      return true
    }
    return null
  }

  /** Digit keys: a teammate on a helper turn; a destination while badges are up; otherwise a marble. */
  const digit = (n: number) => () => {
    const team = teamKey(n)
    if (team !== null) return team
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
        // A finished player with one teammate: Space rolls for them, like any other roll.
        else if (helperTurn && helperChoices.length === 1 && !busy && !paused) rollFor(helperChoices[0]!.color)
      },
      '0': () => teamKey(0) ?? false,
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), digit(n)])),
      Escape: () => {
        if (selected === null) return false
        cancelSelection()
      },
      // Arrow keys step through the marbles you can pick, or the numbered holes once a marble is
      // picked, previewing each; Enter chooses. Works for any number of destinations.
      ArrowLeft: () => cycleFocus(-1),
      ArrowRight: () => cycleFocus(1),
      ArrowUp: () => cycleFocus(-1),
      ArrowDown: () => cycleFocus(1),
      ...(undoOn ? { 'mod+z': () => (canUndo ? void undo() : false), 'mod+y': () => (canRedo ? void redo() : false), 'mod+shift+z': () => (canRedo ? void redo() : false) } : {}),
      g: openGameMenu,
      p: () => {
        if (!gameOver && canPause) togglePause()
      },
      n: requestNew,
      s: openSettings,
      l: () => setLogOpen(!logOpen),
      '?': openRules,
      // R22: switch to the next die in the pool that can move something.
      d: () => {
        if (!canPick || usableDice.size < 2) return false
        const order = [...usableDice]
        selectDie(order[(order.indexOf(selectedDie ?? order[0]!) + 1) % order.length]!)
      },
    },
    !pending && !offerEnd && !gameOver && !sheet,
  )
  // With the win overlay up, only new game and back to setup make sense.
  useShortcuts({ n: doNew, s: doSettings }, gameOver && !busy && !sheet)

  const lastEvents = game.events
  const oops = lastEvents.find((e) => e.type === 'noMoves')
  // Phones (touch, or a narrow window) get short prompts: the dice row already shows the
  // dice, and a prompt that never grows past two lines keeps the board from jumping.
  const compact = IS_TOUCH || phoneSized
  const helping = mover.color !== current.color
  let prompt: string
  if (gameOver) prompt = 'Game over'
  else if (paused && isGuest) prompt = 'The host paused the game.'
  else if (paused) prompt = compact ? 'Paused. Tap Resume to play on.' : 'Paused. Press P or Resume to keep playing.'
  else if (oops?.type === 'noMoves' && (busy || !humanTurn || game.phase === 'roll')) {
    const who = game.players.find((p) => p.color === oops.color)!
    const roller = who.name === 'You' ? 'You' : who.name
    prompt = oops.unused
      ? `Oops! ${roller} can't use the ${oops.unused.join(', ')}.`
      : `Oops! ${roller} rolled a ${who.lastRoll} with no legal move.${oops.rollAgain ? ' A 6 rolls again.' : ''}`
  } else if (busy) prompt = 'Moving...'
  else if (celebration) prompt = celebration.name === 'You' ? 'You got all your marbles home!' : `${celebration.name} got all their marbles home!`
  else if (helperTurn && helperChoices.length > 0)
    prompt = compact
      ? 'All home! Roll for a teammate, or pass.'
      : `${current.name === 'You' ? 'Your' : `${current.name}, your`} marbles are all home. Roll for a teammate (${helperChoices.length > 1 ? `1–${helperChoices.length}` : '1 or Space'}), or pass (0).`
  else if (helperTurn) prompt = `${current.name} is choosing who to roll for...`
  else if (!humanTurn) prompt = `${current.name} is playing...`
  else if (banking) prompt = `${turnOf(current.name)} A 6! Roll again${autoRoll ? '...' : '.'}`
  else if (game.phase === 'roll' && autoRoll) prompt = `${turnOf(current.name)} Rolling...`
  else if (game.phase === 'roll')
    prompt = `${turnOf(current.name)} ${compact ? 'Tap the die.' : 'Press Space or tap the die to roll.'}${helping ? ` (For ${mover.name}.)` : ''}`
  else if (compact) {
    const lead = pool.length > 1 ? `Using the ${selectedDie}` : `Rolled ${selectedDie ?? game.dice}`
    if (selected !== null) prompt = `${lead}: where does marble ${selected + 1} go?`
    else if (helping) prompt = `${lead} for ${mover.name}: tap a marble.`
    else prompt = `${lead}: tap a glowing marble.`
  } else if (helping && selected === null)
    prompt = `${rolledText} For ${mover.name}: pick one of ${mover.name}'s glowing marbles.`
  else if (selected !== null)
    prompt = `${rolledText} Pick where marble ${selected + 1} goes: press ${destinations.length > 9 ? '1–9' : `1–${destinations.length}`} or use ← → and Enter, or Esc to go back.`
  else prompt = `${rolledText} Pick a marble: press 1–4, use ← → and Enter, or click a glowing one.${usableDice.size > 1 ? ' D switches die.' : ''}`

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
          {undoOn && <ToolButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} shortcut="Control+Z" shortcutLabel="Ctrl+Z" />}
          {undoOn && <ToolButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} shortcut="Control+Y" shortcutLabel="Ctrl+Y" />}
          {canPause && (
            <ToolButton icon={paused ? 'play' : 'pause'} label={paused ? 'Resume' : 'Pause'} onClick={togglePause} disabled={gameOver} pressed={paused} shortcut="P" shortcutLabel="P" />
          )}
          <ToolButton icon="book" label="Rules" onClick={openRules} shortcut="?" shortcutLabel="?" />
          <ToolButton icon="gear" label="Settings" onClick={openSettings} shortcut="S" shortcutLabel="S" />
          <ToolButton icon="flag" label="Game" onClick={openGameMenu} shortcut="G" shortcutLabel="G" />
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
            <PlayerPanel key={p.color} player={p} active={!gameOver && p.color === current.color} playingFor={!gameOver && p.color === current.color && mover.color !== p.color ? mover.name : null} />
          ))}
        </ol>

        <div className={`table${paused ? ' table-paused' : ''}`}>
          <Board
            players={shownPlayers}
            bottom={bottom}
            activeColor={gameOver ? null : mover.color}
            pickable={pickable}
            selected={canPick ? selected : null}
            destinations={canPick ? destinations : []}
            showNumbers={humanTurn && (!IS_TOUCH || (showPad && canPick))}
            padTarget={canPick ? padTarget : null}
            lastMove={lastMove}
            onPickMarble={(id) => (selected === id ? cancelSelection() : pick(id))}
            onChooseMove={playMove}
          />
          {showPad && canPick && (
            <MovePad
              player={mover}
              players={game.players}
              pickable={pickable}
              selected={selected}
              destinations={destinations}
              movesFor={movesFor}
              onPickMarble={(id) => {
                setPadTarget(null)
                pick(id)
              }}
              onChooseMove={(move) => {
                setPadTarget(null)
                playMove(move)
              }}
              onBack={cancelSelection}
              onPreview={setPadTarget}
            />
          )}
          {showPad && canRoll && !autoRoll && (
            <div className="move-pad">
              <button type="button" className="pad-button pad-roll primary" onClick={roll}>
                <Icon name="dice" /> Roll
              </button>
            </div>
          )}
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
            {/* A short hint replaces the prompt for a moment rather than adding a row. */}
            <p className={`prompt${shownHint ? ' prompt-hint' : ''}`} aria-live="polite">
              {shownHint ?? prompt}
            </p>
            {/* One reserved row for whatever the turn needs: banked dice, a die to choose, or
                a teammate to roll for. Its height never changes, so the board never jumps. */}
            <div className="turn-actions">
              <DicePool
                pool={pool}
                banking={banking}
                selectedDie={selectedDie}
                usable={(d) => usableDice.has(d)}
                interactive={canPick}
                keyHint={!compact}
                continuing={continuing}
                onSelect={selectDie}
              />
              <TeamTurn
                game={game}
                choices={busy ? [] : helperChoices}
                isMine={isMine}
                online={online}
                nudges={nudges}
                disabled={busy || paused}
                compact={compact}
                onRollFor={rollFor}
                onPass={pass}
                onNudge={sendNudge}
              />
            </div>
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

      <RulesSheet open={sheet === 'rules'} onClose={closeSheet} />
      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} />
      <GameMenu
        open={sheet === 'game'}
        onClose={closeSheet}
        role={role}
        canRestart={configs !== null || role === 'host'}
        rulesText={HOUSE_RULE_KEYS.filter((k) => game.rules?.[k]).map((k) => HOUSE_RULE_TEXT[k].title).join(', ') || 'none'}
        onRestart={fromMenu(requestNew)}
        onLeave={fromMenu(requestSettings)}
      />

      {pending && (
        <ConfirmDialog
          title={
            role === 'host' && pending === 'settings'
              ? 'End the online game?'
              : isGuest
                ? 'Leave this game?'
                : pending === 'new'
                  ? 'Restart this game?'
                  : 'Leave this game for setup?'
          }
          message={
            role === 'host' && pending === 'settings'
              ? 'This ends the game for everyone and closes the invite link.'
              : isGuest
                ? 'You will leave the game. The host can let a bot take your seat.'
                : pending === 'new'
                  ? role === 'host'
                    ? 'The game starts again from the beginning for everyone, with the same seats and house rules.'
                    : 'The game starts again from the beginning, with the same players and house rules. This game is discarded.'
                  : 'This game is still in progress and will be discarded. Setup opens with the same players, ready to change.'
          }
          confirmLabel={
            role === 'host' && pending === 'settings'
              ? 'End for everyone'
              : isGuest
                ? 'Leave'
                : pending === 'settings'
                  ? 'Discard and set up'
                  : 'Restart'
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
          teams={teams ? teamStandings(game) : undefined}
          time={formatClock(elapsed)}
          names={Object.fromEntries(game.players.map((p) => [p.color, p.name]))}
          onNewGame={isGuest || !configs ? undefined : doNew}
          onSetup={doSettings}
          setupLabel={role === 'host' ? 'End online game' : isGuest ? 'Leave' : 'Set up a new game'}
          note={isGuest ? 'Waiting for the host to start another game...' : undefined}
        />
      )}
    </section>
  )
}
