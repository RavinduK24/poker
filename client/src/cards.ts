import type { Card } from './types';

const SUITS: Record<string, string> = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
const RANKS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const suitSymbol = (s: string) => SUITS[s] ?? s;
export const rankLabel = (r: number) => RANKS[r] ?? String(r);
export const isRed = (c: Card) => c.suit === 'h' || c.suit === 'd';
export const cardLabel = (c: Card) => rankLabel(c.rank) + suitSymbol(c.suit);
