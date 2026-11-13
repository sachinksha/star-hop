import { THEMES, useGameStore, type Theme, type ToggleSetting } from '../store/gameStore'
import { Icon, type IconName } from './Icons'

/** Toolbar button with an icon and a text label. */
export function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  shortcut,
  shortcutLabel,
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  shortcut?: string
  shortcutLabel?: string
}) {
  return (
    <button
      type="button"
      className="tool"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={shortcutLabel ? `${label} (${shortcutLabel})` : label}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  )
}

/** An on/off switch for a saved setting, styled like the toolbar buttons. */
export function SettingSwitch({ setting, icon, label, title }: { setting: ToggleSetting; icon: IconName; label: string; title?: string }) {
  const on = useGameStore((s) => s.settings[setting])
  const updateSettings = useGameStore((s) => s.updateSettings)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="tool tool-switch"
      title={title}
      onClick={() => updateSettings({ [setting]: !on })}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
      <span className={`switch-track${on ? ' switch-on' : ''}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  )
}

const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

/**
 * Cycles the colour theme: System (follows the device), Light, Dark. Saved
 * with the other settings.
 */
export function ThemeSwitch() {
  const theme = useGameStore((s) => s.settings.theme)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!
  return (
    <button
      type="button"
      className="tool"
      onClick={() => updateSettings({ theme: next })}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}`}
      title={`Theme: ${THEME_LABEL[theme]} (click for ${THEME_LABEL[next]})`}
    >
      <Icon name={THEME_ICON[theme]} />
      <span className="tool-label">{THEME_LABEL[theme]}</span>
    </button>
  )
}
