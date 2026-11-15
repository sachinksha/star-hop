import type { HouseRules } from '../game/types'

/** Names and one-line explanations of the house rules, shared by setup, Settings and the rules sheet. */
export const HOUSE_RULE_TEXT: Record<keyof HouseRules, { title: string; hint: string }> = {
  rollSixesFirst: {
    title: 'Roll all your sixes first',
    hint: 'After a 6, keep rolling until you roll something else, then use all the dice in any order you like.',
  },
  crossCentre: {
    title: 'Walk across the centre',
    hint: 'A marble starting on a star can step into the centre and out to any star as part of its move, not just with a 1.',
  },
  safeStarts: {
    title: 'Safe start holes',
    hint: 'Nobody can bump you off your own start hole. Others may land there and share it with you.',
  },
}
