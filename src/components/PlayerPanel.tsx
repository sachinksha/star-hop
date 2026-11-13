import { PERSONA_LABEL } from '../game/bot'
import type { Player } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'

interface PlayerPanelProps {
  player: Player
  /** This seat plays next. */
  active: boolean
}

/** One seat: name, bot style, last roll and how many marbles are home. */
export function PlayerPanel({ player, active }: PlayerPanelProps) {
  const home = player.marbles.filter((m) => m.spot.kind === 'home').length
  const finished = player.finishRank !== null
  const classes = ['panel', active ? 'panel-active' : '', finished ? 'panel-finished' : ''].filter(Boolean).join(' ')
  return (
    <li
      className={classes}
      style={{ ['--arm' as string]: COLOR_HEX[player.color] }}
      aria-current={active ? 'true' : undefined}
      aria-label={`${player.name}, ${COLOR_NAME[player.color]}${active ? ', playing now' : ''}`}
    >
      <span className="panel-dot" aria-hidden="true" />
      <span className="panel-main">
        <span className="panel-name" title={player.name}>
          {player.name}
        </span>
        <span className="panel-sub">
          {player.bot ? PERSONA_LABEL[player.bot.persona] : COLOR_NAME[player.color]}
          {player.lastRoll !== null && <> · rolled {player.lastRoll}</>}
        </span>
      </span>
      <span className="panel-home" title={`${home} of 4 marbles home`}>
        {finished ? `#${player.finishRank}` : `${home}/4`}
      </span>
    </li>
  )
}
