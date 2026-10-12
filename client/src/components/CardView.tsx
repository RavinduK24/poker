import type { Card } from '../types';
import { suitSymbol, rankLabel, isRed } from '../cards';

export default function CardView({ card, faceDown }: { card: Card | null; faceDown?: boolean }) {
  if (faceDown) {
    return <div className="card card-facedown" aria-label="face-down card" />;
  }
  if (!card) {
    return <div className="card card-empty" />;
  }
  const red = isRed(card);
  return (
    <div className={'card ' + (red ? 'card-red' : 'card-black')}>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
    </div>
  );
}
