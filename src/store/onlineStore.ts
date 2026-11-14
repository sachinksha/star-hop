/**
 * Online play state: which role this device has (local, host or guest), the
 * live session object, and an inbox of messages for the game hook to act on.
 *
 * The sessions (HostSession, GuestSession) hold the networking logic; this
 * store only wires them to the game store and to React.
 */
import { create } from 'zustand'
import type { Color, GameAction, PlayerConfig } from '../game/types'
import { GuestSession, type SeatStore } from '../net/guestSession'
import { HostSession } from '../net/hostSession'
import type { Invite } from '../net/invite'
import { acceptNudge, teamColors } from '../net/nudges'
import type { Intent, Nudge, TeamNudge } from '../net/protocol'
import type { Network } from '../net/transport'
import { useGameStore } from './gameStore'

export type Role = 'local' | 'host' | 'guest'

/** Work for the game hook: a guest's intent (host side) or a host's action (guest side). */
export type Inbound =
  | { kind: 'intent'; color: Color; seq: number; intent: Intent }
  | { kind: 'action'; action: GameAction; seq: number; gameId: number }

export interface OnlineStoreState {
  role: Role
  host: HostSession | null
  guest: GuestSession | null
  /** An invite read from the page URL, waiting for the player to join. */
  invite: Invite | null
  /** True while the host endpoint is being created. */
  connecting: boolean
  error: string | null
  inbox: Inbound[]
  /** Team play: suggestions for the finished teammate about to roll (see net/nudges.ts). */
  nudges: TeamNudge[]

  /** Opens a host endpoint and a lobby for these seats. */
  startHosting: (configs: PlayerConfig[]) => Promise<void>
  /** Host: starts the game with whoever has joined (empty online seats become bots). */
  startHostedGame: () => void
  /** Remembers an invite from the URL. */
  openInvite: (invite: Invite | null) => void
  /** Guest: connects to the host in the stored invite. */
  join: (name: string) => Promise<void>
  /** Guest: tries the same seat again after the connection dropped. */
  reconnect: () => void
  /** Leaves online play (ending the session if hosting) and returns to local setup. */
  leave: () => void
  /** Team play: this device's player `from` suggests something to the roller. */
  nudge: (from: Color, nudge: Nudge) => void
  /** Removes and returns the first inbox item. */
  shiftInbox: () => Inbound | undefined
  clearInbox: () => void
}

/** Network and page URL, swappable in tests. */
let network: Network | null = null
let baseUrl = () => window.location.href.split('#')[0] ?? ''

export function configureOnline(options: { network?: Network; baseUrl?: () => string }): void {
  if (options.network) network = options.network
  if (options.baseUrl) baseUrl = options.baseUrl
}

async function getNetwork(): Promise<Network> {
  if (!network) network = (await import('../net/peerNetwork')).peerNetwork
  return network
}

/** sessionStorage, or a no-op when the browser blocks it. */
const seatStore: SeatStore = {
  getItem: (k) => {
    try {
      return window.sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      window.sessionStorage.setItem(k, v)
    } catch {
      // Without storage, a refresh just cannot reclaim the seat.
    }
  },
  removeItem: (k) => {
    try {
      window.sessionStorage.removeItem(k)
    } catch {
      // Nothing to clean up.
    }
  },
}

/** Drops "#join=..." from the address bar, so a refresh does not rejoin a finished game. */
function clearInviteFromUrl(): void {
  if (typeof window !== 'undefined' && window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

export const useOnlineStore = create<OnlineStoreState>()((set, get) => ({
  role: 'local',
  host: null,
  guest: null,
  invite: null,
  connecting: false,
  error: null,
  inbox: [],
  nudges: [],

  startHosting: async (configs) => {
    set({ role: 'host', connecting: true, error: null, inbox: [] })
    try {
      const endpoint = await (await getNetwork()).host()
      if (get().role !== 'host') {
        endpoint.close() // cancelled while connecting
        return
      }
      const session = new HostSession(endpoint, configs, { baseUrl: baseUrl() })
      session.onIntent = (color, seq, intent) => set((s) => ({ inbox: [...s.inbox, { kind: 'intent', color, seq, intent }] }))
      session.onNudge = (color, seq, nudge) => hostNudge(color, seq, nudge)
      set({ host: session, connecting: false })
    } catch {
      set({
        role: 'local',
        connecting: false,
        error: 'Could not reach the free connection server. Check your internet connection and try again.',
      })
    }
  },

  startHostedGame: () => {
    const { host } = get()
    if (!host) return
    // Starting the store's game triggers the subscription below, which sends it to guests.
    useGameStore.getState().start(host.gameConfigs())
  },

  openInvite: (invite) => set({ invite, role: invite ? 'guest' : get().role, error: null }),

  join: async (name) => {
    const { invite } = get()
    if (!invite) return
    get().guest?.leave()
    const session = new GuestSession(
      await getNetwork(),
      invite,
      name,
      {
        onSync: (snapshot) => {
          set({ inbox: [] })
          useGameStore.getState().load(snapshot.initial, snapshot.actions, snapshot.paused)
        },
        onAction: (action, seq, gameId) => {
          // Actions must arrive in order. A gap means something was missed: ask for a full copy.
          const queued = get().inbox.filter((i) => i.kind === 'action' && i.gameId === gameId).length
          const expected = useGameStore.getState().actions.length + queued
          if (seq < expected) return // duplicate
          if (seq > expected) {
            get().guest?.requestResync()
            return
          }
          set((s) => ({ inbox: [...s.inbox, { kind: 'action', action, seq, gameId }] }))
        },
        onPaused: (paused) => useGameStore.getState().setPaused(paused),
        onNudges: (nudges) => set({ nudges }),
      },
      seatStore,
    )
    session.subscribe(() => {
      // The host ended the session: leave the game screen for the "ended" notice.
      if (session.getView().status === 'ended' && useGameStore.getState().game) useGameStore.getState().abort()
    })
    set({ guest: session, role: 'guest', inbox: [] })
    await session.connect()
  },

  reconnect: () => {
    void get().guest?.connect()
  },

  leave: () => {
    const { host, guest } = get()
    host?.end()
    guest?.leave()
    clearInviteFromUrl()
    set({ role: 'local', host: null, guest: null, invite: null, inbox: [], nudges: [], connecting: false, error: null })
    // A guest who never joined may still have a saved local game: keep it.
    const { configs, abort } = useGameStore.getState()
    if (host || configs === null) abort()
  },

  nudge: (from, nudge) => {
    const { role, guest } = get()
    const game = useGameStore.getState().game
    if (!game) return
    if (role === 'guest') guest?.sendNudge(game.actionSeq, nudge)
    else if (role === 'host') hostNudge(from, game.actionSeq, nudge)
  },

  shiftInbox: () => {
    const [first, ...rest] = get().inbox
    if (first) set({ inbox: rest })
    return first
  },

  clearInbox: () => set({ inbox: [] }),
}))

/**
 * Host: checks a nudge against the current position and shares the team's
 * updated suggestions with that team only. Anything invalid is dropped.
 */
function hostNudge(from: Color, seq: number, nudge: Nudge): void {
  const { host, nudges } = useOnlineStore.getState()
  const game = useGameStore.getState().game
  if (!host || !game) return
  const next = acceptNudge(game, seq, nudges, from, nudge)
  if (!next) return
  useOnlineStore.setState({ nudges: next })
  host.shareNudges(teamColors(game), next)
}

// Host: every new game (first start or "New game") and every pause change goes
// to the guests. Watching the store keeps this out of the UI components.
useGameStore.subscribe((state, prev) => {
  const { role, host } = useOnlineStore.getState()
  if (role !== 'host' || !host) return
  if (state.initial && state.initial !== prev.initial) host.startGame(state.initial, state.paused)
  else if (state.paused !== prev.paused) host.setPaused(state.paused)
})
