import { afterEach, describe, expect, it } from 'vitest'
import { isMuted, playSound, setMuted, type SoundName } from './sfx'

afterEach(() => setMuted(false))

const ALL: SoundName[] = ['roll', 'move', 'hop', 'bump', 'home', 'win', 'oops']

describe('sound effects', () => {
  it('tracks the mute setting', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
  })

  it('does not throw when Web Audio is unavailable (as in jsdom)', () => {
    for (const name of ALL) expect(() => playSound(name)).not.toThrow()
    setMuted(true)
    for (const name of ALL) expect(() => playSound(name)).not.toThrow()
  })
})
