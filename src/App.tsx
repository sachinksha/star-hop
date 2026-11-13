import { GameScreen } from './components/GameScreen'
import { SetupScreen } from './components/SetupScreen'
import { useStarHopGame } from './hooks/useStarHopGame'
import { useGameStore } from './store/gameStore'

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
    <main className="app">
      {game ? <GameSession key={session} /> : <SetupScreen onStart={(configs) => start(configs)} initial={lastConfigs} />}
    </main>
  )
}

function GameSession() {
  const hop = useStarHopGame()
  return <GameScreen hop={hop} />
}
