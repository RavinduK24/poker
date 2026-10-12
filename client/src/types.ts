export interface Card {
  rank: number;
  suit: string;
}

export type Stage = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'handover';

export interface Winner {
  id: string;
  name: string;
  amount: number;
  hand: string | null;
}

export interface Result {
  type: 'fold' | 'showdown';
  winners: Winner[];
  board?: Card[];
}

export interface PlayerState {
  id: string;
  name: string;
  stack: number;
  isHost: boolean;
  connected: boolean;
  out: boolean;
  left: boolean;
  folded: boolean;
  allIn: boolean;
  betThisRound: number;
  committed: number;
  wonLast: number;
  holeCards: Card[];
}

export interface YourActions {
  fold: boolean;
  check?: boolean;
  call?: boolean;
  callAmount?: number;
  raise?: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
  allin?: boolean;
}

export interface RankingEntry {
  id: string;
  name: string;
  stack: number;
}

export interface TableState {
  roomCode: string;
  stage: Stage;
  handNumber: number;
  started: boolean;
  gameOver: boolean;
  finalRanking: RankingEntry[] | null;
  community: Card[];
  pot: number;
  currentBet: number;
  minRaiseTo: number;
  sbAmount: number;
  bbAmount: number;
  startingChips: number;
  dealerIndex: number;
  sbIndex: number;
  bbIndex: number;
  currentActorId: string | null;
  turnDeadline: number | null;
  result: Result | null;
  players: PlayerState[];
  you: YourActions | null;
}
