import { GameScreen } from './components/GameScreen'
import { SetupScreen } from './components/SetupScreen'
import { useStarHopGame } from './hooks/useStarHopGame'
import { useGameStore } from './store/gameStore'

const PROFILE_URL = 'https://github.com/sachinksha'
const REPO_URL = `${PROFILE_URL}/aggravation-game`

/**
 * Chooses the screen from the store. A game in progress wins, keyed by session
 * so a new game remounts all timing state. Otherwise, setup.
 */
export default function App() {
  const game = useGameStore((s) => s.game)
  const session = useGameStore((s) => s.session)
  const start = useGameStore((s) => s.start)
  const lastConfigs = useGameStore((s) => s.lastConfigs)

  return (
    <>
      <main className="app">
        {game ? <GameSession key={session} /> : <SetupScreen onStart={(configs) => start(configs)} initial={lastConfigs} />}
      </main>
      <footer className="site-footer">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
        <span aria-hidden="true">·</span>
        <span>
          Made by{' '}
          <a href={PROFILE_URL} target="_blank" rel="noopener noreferrer">
            @sachinksha
          </a>
        </span>
        <span aria-hidden="true">·</span>
        <span>GPL-3.0</span>
      </footer>
    </>
  )
}

function GameSession() {
  const hop = useStarHopGame()
  return <GameScreen hop={hop} />
}
