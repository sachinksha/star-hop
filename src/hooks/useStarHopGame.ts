import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playSound } from '../audio/sfx'
import { isStar, sameSpot } from '../game/board'
import { chooseBotMove, chooseHelperTarget, createBotProfile } from '../game/bot'
import { rollFor, secureRandom, type Rng } from '../game/engine'
import { undoIndex } from '../game/history'
import { autoMove as autoMoveFor } from '../game/rules'
import { helperTargets, isHelperTurn, moverOf, takesTurns, teamLabel } from '../game/teams'
import type { Color, GameAction, GameEvent, GameState, Move, Player, Spot } from '../game/types'
import type { Intent } from '../net/protocol'
import { useGameStore } from '../store/gameStore'
import { useOnlineStore, type Role } from '../store/onlineStore'
import { useGuestView } from './useOnline'

/** Timing constants, in milliseconds. Tests and tuning use the same numbers. */
export const TIMING = {
  /** Length of the dice tumble before the result is shown. */
  ROLL_MS: 600,
  /** Delay between each hole a marble walks through. */
  STEP_MS: 140,
  /** A star hop, or a jump into or out of the centre: a longer arc. */
  HOP_MS: 280,
  /** Pause after an action settles before the next one can start. */
  SETTLE_MS: 250,
  /** Extra pause after a roll with no legal move, so the "oops" registers. */
  OOPS_MS: 700,
  /** Bot thinking delays. */
  BOT_ROLL_MS: 700,
  BOT_MOVE_MS: 600,
  /** Delay before a move with no real decision is played automatically. */
  AUTO_MOVE_MS: 450,
  /** Delay before a human's die rolls by itself when auto roll is on. */
  AUTO_ROLL_MS: 650,
  /** How long play holds while a player's finish is celebrated. */
  CELEBRATE_MS: 2200,
  /** How long a notice (such as a bot taking a seat) stays on screen. Play continues. */
  NOTICE_MS: 5000,
} as const

export interface Notice {
  /** Changes for each new notice, so the UI can re-announce it. */
  id: number
  color: Color
  text: string
}

export interface Celebration {
  color: Color
  name: string
  rank: number
  /** Set when a whole team just finished: the banner names the team. */
  team?: number
}

/** What happened when a marble was picked. */
export type PickResult = 'moved' | 'choose' | 'none'

/** Returns a copy of `players` with one marble moved to `spot`. */
function withMarbleAt(players: Player[], color: Color, marbleId: number, spot: Spot): Player[] {
  return players.map((p) =>
    p.color !== color ? p : { ...p, marbles: p.marbles.map((m) => (m.id === marbleId ? { ...m, spot } : m)) },
  )
}

/** True when stepping from `prev` to `next` is an arc (star hop, centre in or out) rather than a walk. */
function isArc(prev: Spot, next: Spot): boolean {
  if (prev.kind === 'center' || next.kind === 'center') return true
  // Two stars are never next to each other on the loop, so star to star is always a hop.
  return prev.kind === 'loop' && next.kind === 'loop' && isStar(prev.pos) && isStar(next.pos)
}

/** Plays the sounds for a settled action's events. */
function playOutcomeSounds(events: GameEvent[]): void {
  // A player finishing and the game ending often happen together: one fanfare.
  const fanfare = events.some((e) => e.type === 'finish' || e.type === 'gameOver')
  for (const e of events) {
    if (e.type === 'bump') playSound('bump')
    if (e.type === 'move' && e.move.reachesHome && !fanfare) playSound('home')
    if (e.type === 'noMoves') playSound('oops')
  }
  if (fanfare) playSound('win')
}

/** The legal move an intent asks for, or undefined. `die` picks among pooled dice (R22). */
function findMove(g: GameState, marbleId: number, to: Spot, die?: number): Move | undefined {
  return g.legalMoves.find((m) => m.marbleId === marbleId && sameSpot(m.to, to) && (die === undefined || m.die === die))
}

/**
 * The die the player is using: their choice if it still has a move, else the
 * first die in the pool that does. Null outside the move phase.
 */
function dieInUse(g: GameState, choice: { seq: number; die: number } | null): number | null {
  if (g.phase !== 'move') return null
  if (choice && choice.seq === g.actionSeq && g.legalMoves.some((m) => m.die === choice.die)) return choice.die
  return g.legalMoves[0]?.die ?? null
}

export interface StarHopController {
  game: GameState
  /** Players as currently drawn. Lags `game` while a move is animating. */
  shownPlayers: Player[]
  /** True while the die is tumbling. */
  rolling: boolean
  /** True while a roll or move is animating or settling. */
  busy: boolean
  paused: boolean
  /** local, host or guest. */
  role: Role
  /** The seat to play is controlled from this device. */
  humanTurn: boolean
  /** The player whose marbles move this turn: the roller, or the teammate they rolled for. */
  mover: Player
  /**
   * Team play: a finished player on this device must choose which teammate to
   * roll for (or pass). Lists the choices; empty otherwise.
   */
  helperChoices: Player[]
  /** True for seats played from this device. */
  isMine: (color: Color) => boolean

  /** Dice rolled this turn and not used yet (more than one only with R22). */
  pool: number[]
  /** The die the next move uses: chosen by the player, or the first usable one. */
  selectedDie: number | null
  /** Chooses which pooled die to use next (R22). Clears a picked marble. */
  selectDie: (die: number) => void
  /** Legal moves for the selected die. */
  dieMoves: Move[]
  /** The marble picked by this device's player, waiting for a destination. */
  selected: number | null
  /** The selected marble's destinations, in display order (badge 1 first). */
  destinations: Move[]
  /** Legal moves for one of the current player's marbles with the selected die, in display order. */
  movesFor: (marbleId: number) => Move[]
  /**
   * Picks a marble. With one destination it moves at once ('moved'); with
   * several it is selected and waits for a destination ('choose'); with none,
   * nothing happens ('none').
   */
  pickMarble: (marbleId: number) => PickResult
  /** Moves the selected marble to destination `index` (0-based, in display order). */
  chooseDestination: (index: number) => void
  /** Plays a move directly (a tap on a destination marker). */
  playMove: (move: Move) => void
  cancelSelection: () => void

  /** The most recent move, drawn as a faint trail so others' moves are easy to follow. */
  lastMove: { color: Color; move: Move } | null
  /** A player who just finished, while their banner is up. */
  celebration: Celebration | null
  /** A short message for everyone at the table, such as a bot taking a seat. */
  notice: Notice | null
  /** Every human has finished but bots are still playing: offer to end the game. */
  offerEnd: boolean
  endEarly: () => void
  keepWatching: () => void
  /** Host: hands an online seat (a player who left) to a bot. */
  takeoverSeat: (color: Color) => void
  canUndo: boolean
  canRedo: boolean
  /** Pausing is possible from this device (not for online guests). */
  canPause: boolean
  roll: () => void
  /** Team play: a finished player rolls for this teammate. */
  rollFor: (color: Color) => void
  /** Team play: a finished player skips this roll. */
  pass: () => void
  undo: () => void
  redo: () => void
  togglePause: () => void
}

/**
 * Connects the store and the rules to the UI. Owns the timing: die tumble,
 * hole-by-hole and star-to-star animation, bot turns, auto rolls and automatic
 * moves. All game state lives in the store; this hook only schedules actions.
 *
 * Every action follows one path: decide it, announce it (when hosting online),
 * animate it, record it, settle. Online guests never decide: they send intents
 * for their own seat and animate the actions the host announces.
 *
 * @param rng Random source for dice and bot choices. Injectable for tests.
 */
export function useStarHopGame(rng: Rng = secureRandom): StarHopController {
  const game = useGameStore((s) => s.game)
  const paused = useGameStore((s) => s.paused)
  const autoRoll = useGameStore((s) => s.settings.autoRoll)
  const autoMove = useGameStore((s) => s.settings.autoMove)
  const actions = useGameStore((s) => s.actions)
  const redoStack = useGameStore((s) => s.redoStack)
  const role = useOnlineStore((s) => s.role)
  const inbox = useOnlineStore((s) => s.inbox)
  const guestColor = useGuestView()?.color ?? null
  if (!game) throw new Error('useStarHopGame requires an active game')

  // Animation-only state: what the board shows while an action plays out.
  const [shownPlayers, setShownPlayers] = useState<Player[]>(() => game.players)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeId = useRef(0)
  const [lastMove, setLastMove] = useState<{ color: Color; move: Move } | null>(null)
  const [endDeclined, setEndDeclined] = useState(false)
  /** The picked marble, tied to the position it was picked in so it clears itself after any action. */
  const [selection, setSelection] = useState<{ seq: number; marbleId: number } | null>(null)
  /**
   * The action count an undo went back to. Auto roll and auto move hold off at
   * that position, so an undone move or roll isn't replayed straight away: the
   * player undid it to decide again.
   */
  const [heldAt, setHeldAt] = useState<number | null>(null)
  /** The die chosen from a pool (R22), tied to its position like the selection. */
  const [dieChoice, setDieChoice] = useState<{ seq: number; die: number } | null>(null)

  // Refs let scheduled callbacks read the latest values without stale closures.
  const busyRef = useRef(false)
  const timers = useRef<number[]>([])
  /** Guest: the action count at which an intent was last sent, to avoid repeats. */
  const intentSentAt = useRef(-1)

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const setBusyBoth = useCallback((value: boolean) => {
    busyRef.current = value
    setBusy(value)
  }, [])

  /** Which seats this device plays: its own seat as a guest, otherwise local humans. */
  const isMine = useCallback(
    (color: Color) => {
      const p = game.players.find((x) => x.color === color)
      if (!p || p.kind !== 'human') return false
      if (role === 'guest') return color === guestColor
      return !p.remote
    },
    [game.players, role, guestColor],
  )

  /**
   * Shows the settled state after an action, plays its sounds and releases the
   * busy lock. A finish (that does not end the game) holds play for a banner;
   * a takeover shows a notice without holding play.
   */
  const settle = useCallback(() => {
    const next = useGameStore.getState().game!
    setShownPlayers(next.players)
    playOutcomeSounds(next.events)
    const moved = next.events.find((e) => e.type === 'move')
    if (moved?.type === 'move') setLastMove({ color: moved.color, move: moved.move })
    const handover = next.events.find((e) => e.type === 'takeover')
    if (handover?.type === 'takeover') {
      const id = ++noticeId.current
      setNotice({ id, color: handover.color, text: `${handover.from} left the game. ${handover.to} is playing for them now.` })
      // Only clear our own notice, not a newer one.
      later(() => setNotice((n) => (n?.id === id ? null : n)), TIMING.NOTICE_MS)
    }
    const finish = next.events.find((e) => e.type === 'finish')
    if (finish?.type === 'finish' && next.phase !== 'gameOver') {
      const player = next.players.find((p) => p.color === finish.color)!
      const teamDone = next.events.find((e) => e.type === 'teamFinish')
      setCelebration(
        teamDone?.type === 'teamFinish'
          ? { color: finish.color, name: teamLabel(teamDone.team), rank: teamDone.rank, team: teamDone.team }
          : { color: finish.color, name: player.name, rank: finish.rank },
      )
      later(() => {
        setCelebration(null)
        setBusyBoth(false)
      }, TIMING.CELEBRATE_MS)
      return
    }
    const oops = next.events.some((e) => e.type === 'noMoves')
    later(() => setBusyBoth(false), TIMING.SETTLE_MS + (oops ? TIMING.OOPS_MS : 0))
  }, [later, setBusyBoth])

  /**
   * Plays an action on screen, then records it: a tumble for a roll, the path
   * hole by hole (with longer arcs for star hops and the centre) for a move,
   * and straight to the result otherwise. Returns false if it does not fit.
   */
  const animate = useCallback(
    (action: GameAction): boolean => {
      const { game: g, record } = useGameStore.getState()
      if (!g) return false
      setBusyBoth(true)

      if (action.type === 'roll') {
        setRolling(true)
        playSound('roll')
        later(() => {
          setRolling(false)
          record(action)
          settle()
        }, TIMING.ROLL_MS)
        return true
      }

      if (action.type === 'move') {
        const move = g.phase === 'move' ? findMove(g, action.marbleId, action.to, action.die) : undefined
        if (!move) {
          setBusyBoth(false)
          return false
        }
        const color = moverOf(g).color
        let at = 0
        let prev = move.from
        for (const spot of move.path) {
          const arc = isArc(prev, spot)
          at += arc ? TIMING.HOP_MS : TIMING.STEP_MS
          later(() => {
            setShownPlayers((players) => withMarbleAt(players, color, move.marbleId, spot))
            playSound(arc ? 'hop' : 'move')
          }, at)
          prev = spot
        }
        later(() => {
          record(action)
          settle()
        }, at + TIMING.STEP_MS)
        return true
      }

      record(action)
      settle()
      return true
    },
    [later, setBusyBoth, settle],
  )

  /** Host or local: an action decided on this device. Hosts tell the guests first. */
  const submit = useCallback(
    (action: GameAction) => {
      useOnlineStore.getState().host?.announce(action)
      animate(action)
    },
    [animate],
  )

  /**
   * Rolls for whoever's turn it is (not used by guests). In team play a
   * finished player names the teammate `forColor` on the turn's first roll;
   * bonus rolls in the same turn are for that teammate again, so `forColor`
   * is ignored then. A first roll with no valid teammate named is not made.
   */
  const performRoll = useCallback(
    (forColor?: Color) => {
      const { game: g, paused: isPaused } = useGameStore.getState()
      if (busyRef.current || isPaused || !g || g.phase !== 'roll') return
      const seat = g.players[g.currentIndex]!
      const choosing = isHelperTurn(g)
      if (choosing && !helperTargets(g).some((p) => p.color === forColor)) return
      const target = choosing ? forColor : (g.playingFor ?? undefined)
      const value = rollFor(g, rng, true, target)
      submit(choosing ? { type: 'roll', value, actor: seat.kind, for: forColor } : { type: 'roll', value, actor: seat.kind })
    },
    [rng, submit],
  )

  /** A finished player skips their roll (not used by guests). */
  const performPass = useCallback(() => {
    const { game: g, paused: isPaused } = useGameStore.getState()
    if (busyRef.current || isPaused || !g || !isHelperTurn(g)) return
    submit({ type: 'pass', actor: g.players[g.currentIndex]!.kind })
  }, [submit])

  /** Plays a legal move for whoever's turn it is (not used by guests). */
  const performMove = useCallback(
    (move: Move) => {
      const { game: g, paused: isPaused } = useGameStore.getState()
      if (busyRef.current || isPaused || !g || g.phase !== 'move') return
      setSelection(null)
      submit({ type: 'move', marbleId: move.marbleId, to: move.to, actor: g.players[g.currentIndex]!.kind, die: move.die })
    },
    [submit],
  )

  /** Guest: asks the host to act for this guest's seat, once per game position. */
  const sendIntent = useCallback((intent: Intent) => {
    const { guest } = useOnlineStore.getState()
    const seq = useGameStore.getState().actions.length
    if (!guest || busyRef.current || intentSentAt.current === seq) return
    intentSentAt.current = seq
    guest.sendIntent(seq, intent)
  }, [])

  /** Moves for this device's seat: locally, or as an intent when a guest. */
  const playMine = useCallback(
    (move: Move) => {
      setSelection(null)
      if (role === 'guest') sendIntent({ action: 'move', marbleId: move.marbleId, to: move.to, die: move.die })
      else performMove(move)
    },
    [role, sendIntent, performMove],
  )

  /** The current position, when it is this device's player's decision to make. */
  const myMovePhase = useCallback(() => {
    const { game: g, paused: isPaused } = useGameStore.getState()
    if (!g || g.phase !== 'move' || isPaused || busyRef.current) return null
    return isMine(g.players[g.currentIndex]!.color) ? g : null
  }, [isMine])

  const selectedDie = dieInUse(game, dieChoice)
  const dieMoves = useMemo(() => (selectedDie === null ? [] : game.legalMoves.filter((m) => m.die === selectedDie)), [game, selectedDie])

  const movesFor = useCallback((marbleId: number) => dieMoves.filter((m) => m.marbleId === marbleId), [dieMoves])

  const selectDie = useCallback((die: number) => {
    const g = useGameStore.getState().game
    if (!g || g.phase !== 'move' || !g.legalMoves.some((m) => m.die === die)) return
    setDieChoice({ seq: g.actionSeq, die })
    setSelection(null)
  }, [])

  const pickMarble = useCallback(
    (marbleId: number): PickResult => {
      const g = myMovePhase()
      if (!g) return 'none'
      const die = dieInUse(g, dieChoice)
      const moves = g.legalMoves.filter((m) => m.marbleId === marbleId && m.die === die)
      const only = moves.length === 1 ? moves[0] : undefined
      if (only) {
        playMine(only)
        return 'moved'
      }
      if (moves.length === 0) return 'none'
      setSelection({ seq: g.actionSeq, marbleId })
      return 'choose'
    },
    [myMovePhase, playMine, dieChoice],
  )

  const selected = selection && selection.seq === game.actionSeq && game.phase === 'move' ? selection.marbleId : null
  const destinations = useMemo(() => (selected === null ? [] : movesFor(selected)), [selected, movesFor])

  const chooseDestination = useCallback(
    (index: number) => {
      if (!myMovePhase()) return
      const move = destinations[index]
      if (move) playMine(move)
    },
    [myMovePhase, destinations, playMine],
  )

  const playMove = useCallback(
    (move: Move) => {
      const g = myMovePhase()
      if (g && g.legalMoves.includes(move)) playMine(move)
    },
    [myMovePhase, playMine],
  )

  const cancelSelection = useCallback(() => setSelection(null), [])

  /** UI: roll for this device's seat. A finished player uses rollFor instead. */
  const roll = useCallback(() => {
    const g = useGameStore.getState().game
    if (!g || g.phase !== 'roll' || !isMine(g.players[g.currentIndex]!.color) || isHelperTurn(g)) return
    if (role === 'guest') sendIntent({ action: 'roll' })
    else performRoll()
  }, [isMine, role, sendIntent, performRoll])

  /** UI: a finished player on this device rolls for a teammate. */
  const rollForTeammate = useCallback(
    (color: Color) => {
      const g = useGameStore.getState().game
      if (!g || !isHelperTurn(g) || !isMine(g.players[g.currentIndex]!.color)) return
      if (role === 'guest') sendIntent({ action: 'roll', for: color })
      else performRoll(color)
    },
    [isMine, role, sendIntent, performRoll],
  )

  /** UI: a finished player on this device passes. */
  const pass = useCallback(() => {
    const g = useGameStore.getState().game
    if (!g || !isHelperTurn(g) || !isMine(g.players[g.currentIndex]!.color)) return
    if (role === 'guest') sendIntent({ action: 'pass' })
    else performPass()
  }, [isMine, role, sendIntent, performPass])

  // Every human is out of the game (finished, and in team play their whole team
  // too) while bots play on: offer to end. Guests never decide this.
  const humans = game.players.filter((p) => p.kind === 'human')
  const humansDone = humans.length > 0 && humans.every((p) => !takesTurns(game.players, p))
  const offerEnd = role !== 'guest' && humansDone && !endDeclined && !busy && game.phase !== 'gameOver'

  /** Guest: play the host's actions in order, one at a time. */
  useEffect(() => {
    if (role !== 'guest' || busy || inbox.length === 0) return
    // Like every scheduled action, run it from a timer rather than during the effect.
    const id = window.setTimeout(() => {
      const item = useOnlineStore.getState().shiftInbox()
      if (item?.kind !== 'action') return
      if (!animate(item.action)) useOnlineStore.getState().guest?.requestResync()
    }, 0)
    return () => window.clearTimeout(id)
  }, [role, busy, inbox, animate])

  /** Each automatic action is scheduled from here: bot turns, auto rolls, moves with no real decision, guest intents. */
  useEffect(() => {
    if (busy || paused || offerEnd || game.phase === 'gameOver') return
    const seat = game.players[game.currentIndex]!

    if (role === 'guest') {
      // Guests automate only their own seat, by sending intents; the host does everything else.
      if (!isMine(seat.color) || inbox.length > 0) return
      // A finished player's roll for the team is always a real decision: never automatic.
      if (game.phase === 'roll' && autoRoll && !isHelperTurn(game)) {
        const id = window.setTimeout(() => sendIntent({ action: 'roll' }), TIMING.AUTO_ROLL_MS)
        return () => window.clearTimeout(id)
      }
      const auto = game.phase === 'move' && autoMove ? autoMoveFor(moverOf(game).color, game.legalMoves) : null
      if (auto) {
        const id = window.setTimeout(() => sendIntent({ action: 'move', marbleId: auto.marbleId, to: auto.to, die: auto.die }), TIMING.AUTO_MOVE_MS)
        return () => window.clearTimeout(id)
      }
      return
    }

    // Host: act on a guest's intent if it is for the current seat and position.
    if (seat.remote && inbox.length > 0) {
      const id = window.setTimeout(() => {
        const { inbox: pending, clearInbox } = useOnlineStore.getState()
        const intent = pending.find((i) => i.kind === 'intent' && i.color === seat.color && i.seq === actions.length)
        clearInbox() // anything else is stale
        if (intent?.kind !== 'intent') return
        const g = useGameStore.getState().game!
        if (intent.intent.action === 'roll' && g.phase === 'roll') performRoll(intent.intent.for)
        if (intent.intent.action === 'pass') performPass()
        if (intent.intent.action === 'move' && g.phase === 'move') {
          // Only a legal move for that marble and hole is played; anything else is ignored.
          const move = findMove(g, intent.intent.marbleId, intent.intent.to, intent.intent.die)
          if (move) performMove(move)
        }
      }, 0)
      return () => window.clearTimeout(id)
    }

    const held = heldAt === actions.length
    if (game.phase === 'roll') {
      // A finished bot picks the teammate it helps most. A finished human always decides.
      if (isHelperTurn(game)) {
        if (seat.kind !== 'bot') return
        const id = window.setTimeout(() => {
          const target = chooseHelperTarget(useGameStore.getState().game!)
          if (target) performRoll(target)
        }, TIMING.BOT_ROLL_MS)
        return () => window.clearTimeout(id)
      }
      if (seat.kind === 'human' && (seat.remote || !autoRoll || held)) return
      const id = window.setTimeout(() => performRoll(), seat.kind === 'bot' ? TIMING.BOT_ROLL_MS : TIMING.AUTO_ROLL_MS)
      return () => window.clearTimeout(id)
    }

    // Move phase. When the roll leaves no real decision, play it without a
    // click: always for bots, and for this device's humans when auto move is on.
    // A remote player's own device decides that for them, so the host waits.
    const auto = seat.kind === 'bot' || (autoMove && isMine(seat.color) && !held) ? autoMoveFor(moverOf(game).color, game.legalMoves) : null
    if (auto) {
      const id = window.setTimeout(() => performMove(auto), TIMING.AUTO_MOVE_MS)
      return () => window.clearTimeout(id)
    }

    if (seat.kind === 'bot') {
      const id = window.setTimeout(() => {
        const choice = chooseBotMove(useGameStore.getState().game!, rng)
        if (choice) performMove(choice)
      }, TIMING.BOT_MOVE_MS)
      return () => window.clearTimeout(id)
    }
  }, [game, actions, busy, paused, offerEnd, autoRoll, autoMove, role, inbox, isMine, performRoll, performMove, performPass, sendIntent, rng, heldAt])

  const endEarly = useCallback(() => {
    if (busyRef.current || role === 'guest') return
    submit({ type: 'end', actor: 'human' })
  }, [role, submit])

  const keepWatching = useCallback(() => setEndDeclined(true), [])

  const takeoverSeat = useCallback(
    (color: Color) => {
      if (busyRef.current || role !== 'host') return
      submit({ type: 'takeover', color, bot: createBotProfile(rng), actor: 'human' })
    },
    [role, rng, submit],
  )

  const resetView = useCallback(() => {
    setShownPlayers(useGameStore.getState().game!.players)
    setRolling(false)
    setSelection(null)
    setLastMove(null)
  }, [])

  const undo = useCallback(() => {
    if (busyRef.current || role !== 'local') return
    useGameStore.getState().undo()
    setHeldAt(useGameStore.getState().actions.length)
    resetView()
  }, [role, resetView])

  const redo = useCallback(() => {
    if (busyRef.current || role !== 'local') return
    useGameStore.getState().redo()
    resetView()
  }, [role, resetView])

  // Local games pause when the player looks away: the tab goes to the
  // background or the window loses focus. Resuming is left to the player.
  // Online games do not, since one player switching tabs would stop everyone.
  useEffect(() => {
    if (role !== 'local') return
    const pauseIfPlaying = () => {
      const { game: g, paused: isPaused, setPaused } = useGameStore.getState()
      if (g && g.phase !== 'gameOver' && !isPaused) setPaused(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseIfPlaying()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', pauseIfPlaying)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseIfPlaying)
    }
  }, [role])

  const togglePause = useCallback(() => {
    if (role === 'guest') return
    const { paused: isPaused, setPaused } = useGameStore.getState()
    setPaused(!isPaused)
  }, [role])

  const seat = game.players[game.currentIndex]!
  const local = role === 'local'
  return {
    game,
    shownPlayers,
    rolling,
    busy,
    paused,
    role,
    humanTurn: isMine(seat.color) && game.phase !== 'gameOver',
    mover: moverOf(game),
    helperChoices: isMine(seat.color) && !paused && isHelperTurn(game) ? helperTargets(game) : [],
    isMine,
    pool: game.pool ?? [],
    selectedDie,
    selectDie,
    dieMoves,
    selected,
    destinations,
    movesFor,
    pickMarble,
    chooseDestination,
    playMove,
    cancelSelection,
    lastMove,
    celebration,
    notice,
    offerEnd,
    endEarly,
    keepWatching,
    takeoverSeat,
    canUndo: local && !busy && !paused && undoIndex(actions) !== null,
    canRedo: local && !busy && !paused && redoStack.length > 0,
    canPause: role !== 'guest',
    roll,
    rollFor: rollForTeammate,
    pass,
    undo,
    redo,
    togglePause,
  }
}
