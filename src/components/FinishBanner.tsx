import type { Color } from '../game/types'
import { COLOR_HEX } from './colors'
import { unit } from './random'

const RANK_WORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

/** Fixed confetti layout for the banner. */
const BURST = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: unit(i + 7) * 100,
  delay: unit(i + 77) * 0.5,
  drift: (unit(i + 177) - 0.5) * 80,
}))

/** Banner over the board when a player gets all four marbles home. */
export function FinishBanner({ name, color, rank }: { name: string; color: Color; rank: number }) {
  const who = name === 'You' ? 'You finished' : `${name} finished`
  return (
    <div className="finish-banner" style={{ ['--arm' as string]: COLOR_HEX[color] }} role="status">
      <div className="confetti" aria-hidden="true">
        {BURST.map((p) => (
          <span
            key={p.id}
            className="confetti-piece confetti-burst"
            style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, ['--drift' as string]: `${p.drift}px` }}
          />
        ))}
      </div>
      <p className="finish-text">
        <span className="finish-rank">{RANK_WORD[rank] ?? `#${rank}`}</span>
        {who}!
      </p>
    </div>
  )
}
