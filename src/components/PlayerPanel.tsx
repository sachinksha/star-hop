import { PERSONA_LABEL } from '../game/bot'
import { teamLabel } from '../game/teams'
import type { Player } from '../game/types'
import { COLOR_HEX, COLOR_NAME } from './colors'

interface PlayerPanelProps {
  player: Player
  /** This seat plays next. */
  active: boolean
  /** Team play: the teammate this finished player is rolling for right now. */
  playingFor?: string | null
}

/** One seat: name, bot style, last roll and how many marbles are home. */
export function PlayerPanel({ player, active, playingFor = null }: PlayerPanelProps) {
  const home = player.marbles.filter((m) => m.spot.kind === 'home').length
  const finished = player.finishRank !== null
  const classes = ['panel', active ? 'panel-active' : '', finished ? 'panel-finished' : ''].filter(Boolean).join(' ')
  return (
    <li
      className={classes}
      style={{ ['--arm' as string]: COLOR_HEX[player.color] }}
      aria-current={active ? 'true' : undefined}
      aria-label={`${player.name}, ${COLOR_NAME[player.color]}${player.team !== null ? `, ${teamLabel(player.team)}` : ''}${active ? ', playing now' : ''}`}
    >
      <span className="panel-dot" aria-hidden="true" />
      <span className="panel-main">
        <span className="panel-name" title={player.name}>
          {player.name}
          {player.team !== null && (
            <span className={`team-chip team-${player.team}`} aria-hidden="true">
              {teamLabel(player.team).slice(-1)}
            </span>
          )}
        </span>
        <span className="panel-sub">
          {playingFor ? (
            <>Rolling for {playingFor}</>
          ) : finished && player.team !== null ? (
            <>Helping the team</>
          ) : (
            <>
              {player.bot ? PERSONA_LABEL[player.bot.persona] : COLOR_NAME[player.color]}
              {player.lastRoll !== null && <> · rolled {player.lastRoll}</>}
            </>
          )}
        </span>
      </span>
      <span className="panel-home" title={`${home} of 4 marbles home`}>
        {finished ? `#${player.finishRank}` : `${home}/4`}
      </span>
    </li>
  )
}
