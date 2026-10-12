// Card representation: { rank: 2..14, suit: 's'|'h'|'d'|'c' }
// rank: 2..10, 11=J, 12=Q, 13=K, 14=A

export const SUITS = ['s', 'h', 'd', 'c'];

export const SUIT_SYMBOLS = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };

export const RANK_LABELS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// Fisher-Yates shuffle (returns a new array).
export function shuffle(deck) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardLabel(card) {
  return RANK_LABELS[card.rank] + SUIT_SYMBOLS[card.suit];
}
