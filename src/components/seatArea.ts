/**
 * Where each arm's seat card goes around the mini board, by the arm's place
 * clockwise from the bottom (0 = bottom, as on the game board). These are CSS
 * grid areas: a row of three above the board and a row of three below it, which
 * is how the six arms sit (one straight up and two either side, and the same
 * below).
 */
export const SEAT_AREA = ['b', 'bl', 'tl', 't', 'tr', 'br'] as const

/** The grid area for `color` when `bottom` is the arm drawn at the bottom. */
export function seatArea(armIndex: number, bottom: number): (typeof SEAT_AREA)[number] {
  return SEAT_AREA[(armIndex - bottom + 6) % 6]!
}
