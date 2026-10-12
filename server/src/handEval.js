// Poker hand evaluator.
//
// A hand is represented as an array of numbers that sort lexicographically:
//   [category, tiebreak1, tiebreak2, ...]
// Categories (higher is better):
//   0 High Card, 1 One Pair, 2 Two Pair, 3 Three of a Kind, 4 Straight,
//   5 Flush, 6 Full House, 7 Four of a Kind, 8 Straight Flush

export const HAND_CATEGORIES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

// Evaluate an exact 5-card hand.
export function evaluate5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const uniq = [...new Set(ranks)];
  let isStraight = false;
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[4] - uniq[0] === 4) {
      isStraight = true;
      straightHigh = uniq[4];
    } else if (
      uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 4 && uniq[3] === 5 && uniq[4] === 14
    ) {
      // Wheel: A-2-3-4-5 (ace plays low).
      isStraight = true;
      straightHigh = 5;
    }
  }

  const desc = ranks.slice().sort((a, b) => b - a);
  let category;
  let tiebreak;

  if (isFlush && isStraight) {
    category = 8;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (isFlush) {
    category = 5;
    tiebreak = desc;
  } else if (isStraight) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    tiebreak = [
      groups[0].rank,
      ...groups.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a),
    ];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    tiebreak = [
      Math.max(groups[0].rank, groups[1].rank),
      Math.min(groups[0].rank, groups[1].rank),
      groups[2].rank,
    ];
  } else if (groups[0].count === 2) {
    category = 1;
    tiebreak = [
      groups[0].rank,
      ...groups.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a),
    ];
  } else {
    category = 0;
    tiebreak = desc;
  }

  return [category, ...tiebreak];
}

// Compare two hand arrays: positive if a beats b, 0 if equal, negative if b beats a.
export function compareHands(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function* combos(arr, k) {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combos(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// Evaluate the best 5-card hand from up to 7 cards.
export function evaluate7(cards) {
  let best = null;
  for (const c of combos(cards, 5)) {
    const r = evaluate5(c);
    if (best === null || compareHands(r, best) > 0) best = r;
  }
  return best;
}

export function handName(hand) {
  return HAND_CATEGORIES[hand[0]];
}
