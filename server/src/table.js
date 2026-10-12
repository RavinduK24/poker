import { createDeck, shuffle } from './deck.js';
import { evaluate7, compareHands, handName } from './handEval.js';

const BETTING_STAGES = new Set(['preflop', 'flop', 'turn', 'river']);

let playerSeq = 0;

export class Table {
  constructor({ roomCode, startingChips, sbAmount, bbAmount, turnSeconds }) {
    this.roomCode = roomCode;
    this.maxSeats = 9;
    this.startingChips = startingChips;
    this.sbAmount = sbAmount;
    this.bbAmount = bbAmount;
    this.turnSeconds = turnSeconds ?? 45; // 0 disables the turn timer (tests)

    this.players = [];
    this.dealerIndex = -1;
    this.stage = 'waiting'; // waiting | preflop | flop | turn | river | handover
    this.community = [];
    this.deck = [];
    this.currentBet = 0;
    this.raiseInc = bbAmount;
    this.currentActor = -1;
    this.handNumber = 0;
    this.started = false;
    this.gameOver = false;
    this.finalRanking = null;
    this.hostId = null;
    this.lastResult = null;

    this.turnTimer = null;
    this.turnDeadline = null;

    this.emitState = () => {};
  }

  // ---------- seat helpers ----------

  inHand(p) {
    return p.holeCards.length > 0 && !p.folded && !p.out && !p.left;
  }

  canAct(p) {
    return this.inHand(p) && !p.allIn;
  }

  eligibleForHand() {
    return this.players.filter((p) => p.stack > 0 && !p.out && !p.left);
  }

  nextIndex(i) {
    return (i + 1) % this.players.length;
  }

  nextEligible(fromIndex) {
    if (this.players.length === 0) return -1;
    let i = this.nextIndex(fromIndex);
    for (let n = 0; n < this.players.length; n++) {
      const p = this.players[i];
      if (p.stack > 0 && !p.left) return i;
      i = this.nextIndex(i);
    }
    return -1;
  }

  nextCanAct(fromIndex) {
    if (this.players.length === 0) return -1;
    let i = this.nextIndex(fromIndex);
    for (let n = 0; n < this.players.length; n++) {
      if (this.canAct(this.players[i])) return i;
      i = this.nextIndex(i);
    }
    return -1;
  }

  totalCommitted() {
    return this.players.reduce((s, p) => s + p.committed + p.betThisRound, 0);
  }

  blindIndices() {
    const n = this.eligibleForHand().length;
    if (n < 2) return { sb: -1, bb: -1 };
    return { sb: this.findSB(), bb: this.findBB() };
  }

  // ---------- seating ----------

  addPlayer(socketId, name, isHost) {
    name = String(name || 'Player').trim().slice(0, 16) || 'Player';

    // Reconnect: re-link a disconnected seat with the same name.
    const ghost = this.players.find((p) => p.name === name && !p.connected && !p.left);
    if (ghost) {
      ghost.socketId = socketId;
      ghost.connected = true;
      if (isHost) {
        ghost.isHost = true;
        this.hostId = ghost.id;
      }
      return ghost;
    }

    // Reuse an abandoned seat (left or busted+disconnected) to keep indices stable.
    const reuse = this.players.find((p) => p.left || (p.out && !p.connected));
    let seat;
    if (reuse) {
      seat = reuse;
      seat.socketId = socketId;
      seat.name = name;
      seat.stack = this.startingChips;
      seat.holeCards = [];
      seat.committed = 0;
      seat.betThisRound = 0;
      seat.folded = false;
      seat.allIn = false;
      seat.acted = false;
      seat.connected = true;
      seat.out = false;
      seat.left = false;
      seat.wonLast = 0;
      seat.isHost = !!isHost;
    } else {
      if (this.players.length >= this.maxSeats) return null; // full
      seat = {
        id: 'p' + (++playerSeq),
        name,
        socketId,
        stack: this.startingChips,
        holeCards: [],
        committed: 0,
        betThisRound: 0,
        folded: false,
        allIn: false,
        acted: false,
        connected: true,
        out: false,
        left: false,
        wonLast: 0,
        isHost: !!isHost,
      };
      this.players.push(seat);
    }
    if (isHost) this.hostId = seat.id;
    return seat;
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const p = this.players[idx];
    p.connected = false;
    p.left = true;

    if (this.hostId === p.id) {
      const next = this.players.find((q) => q.id !== p.id && q.connected && !q.left);
      this.hostId = next ? next.id : null;
      if (next) next.isHost = true;
    }

    if (BETTING_STAGES.has(this.stage) && this.inHand(p)) {
      p.folded = true;
      const remaining = this.players.filter((q) => this.inHand(q));
      if (remaining.length === 1) {
        this.endHand(remaining[0]);
      } else if (this.currentActor === idx) {
        this.advanceTurn();
      }
    }
  }

  markDisconnected(playerId) {
    const p = this.players.find((q) => q.id === playerId);
    if (!p) return;
    p.connected = false;
    if (
      BETTING_STAGES.has(this.stage) &&
      this.currentActor >= 0 &&
      this.players[this.currentActor] === p &&
      this.canAct(p)
    ) {
      // Don't stall the table: auto-check when free, otherwise fold.
      if (p.betThisRound === this.currentBet) this.applyAction(p.id, { type: 'check' });
      else this.applyAction(p.id, { type: 'fold' });
    }
  }

  // ---------- game flow ----------

  startGame() {
    if (this.stage === 'preflop' || this.stage === 'flop' || this.stage === 'turn' || this.stage === 'river') {
      return { error: 'A hand is already in progress' };
    }
    if (this.eligibleForHand().length < 2) return { error: 'Need at least 2 players with chips' };
    this.started = true;
    this.startHand();
    return { ok: true };
  }

  nextHand() {
    if (this.stage !== 'handover') return { error: 'Hand is not over yet' };
    if (this.eligibleForHand().length < 2) {
      this.stage = 'waiting';
      this.started = false;
      this.gameOver = true;
      this.finalRanking = [...this.players]
        .filter((p) => !p.left)
        .sort((a, b) => b.stack - a.stack)
        .map((p) => ({ id: p.id, name: p.name, stack: p.stack }));
      this.emitState();
      return { ok: true, gameOver: true };
    }
    this.lastResult = null;
    this.startHand();
    return { ok: true };
  }

  startHand() {
    this.gameOver = false;
    this.finalRanking = null;
    const elig = this.eligibleForHand();
    if (elig.length < 2) {
      this.stage = 'waiting';
      this.started = false;
      return;
    }

    this.handNumber += 1;
    this.deck = shuffle(createDeck());
    this.community = [];
    this.currentBet = 0;
    this.raiseInc = this.bbAmount;
    this.lastResult = null;

    for (const p of this.players) {
      p.holeCards = [];
      p.betThisRound = 0;
      p.committed = 0;
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.wonLast = 0;
      if (p.stack > 0 && !p.left) p.out = false;
    }

    this.dealerIndex = this.nextDealer();
    const sbSeat = this.findSB();
    const bbSeat = this.findBB();

    const order = this.dealOrder();
    for (let round = 0; round < 2; round++) {
      for (const p of order) p.holeCards.push(this.deck.pop());
    }

    this.postBlind(sbSeat, this.sbAmount);
    this.postBlind(bbSeat, this.bbAmount);
    this.currentBet = this.players.reduce((m, p) => Math.max(m, p.betThisRound), 0);

    this.stage = 'preflop';
    this.currentActor = this.firstToAct('preflop');
    if (this.currentActor < 0) {
      this.advanceStage(); // everyone all-in -> run out the board
      return;
    }
    this.startTurnTimer();
    this.emitState();
  }

  nextDealer() {
    if (this.dealerIndex < 0) return 0;
    let i = this.nextIndex(this.dealerIndex);
    for (let n = 0; n < this.players.length; n++) {
      if (this.players[i].stack > 0 && !this.players[i].left) return i;
      i = this.nextIndex(i);
    }
    return this.dealerIndex;
  }

  findSB() {
    if (this.eligibleForHand().length === 2) return this.dealerIndex; // heads-up
    return this.nextEligible(this.dealerIndex);
  }

  findBB() {
    if (this.eligibleForHand().length === 2) return this.nextEligible(this.dealerIndex); // heads-up
    return this.nextEligible(this.findSB());
  }

  dealOrder() {
    const order = [];
    let i = this.nextIndex(this.dealerIndex);
    for (let n = 0; n < this.players.length; n++) {
      const p = this.players[i];
      if (p.stack > 0 && !p.left) order.push(p);
      i = this.nextIndex(i);
    }
    return order;
  }

  firstToAct(stage) {
    const from = stage === 'preflop' ? this.findBB() : this.dealerIndex;
    return this.nextCanAct(from);
  }

  postBlind(seat, amount) {
    const p = this.players[seat];
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    p.betThisRound += amt;
    if (p.stack === 0) p.allIn = true;
  }

  // ---------- actions ----------

  applyAction(playerId, action) {
    if (!BETTING_STAGES.has(this.stage)) return { error: 'No action needed right now' };
    if (this.currentActor < 0) return { error: 'No one is waiting to act' };
    const p = this.players[this.currentActor];
    if (!p || p.id !== playerId) return { error: 'It is not your turn' };
    this.clearTurnTimer();

    switch (action && action.type) {
      case 'fold':
        return this.doFold(p);
      case 'check':
        return this.doCheck(p);
      case 'call':
        return this.doCall(p);
      case 'raise':
        return this.doRaise(p, Number(action.amount));
      case 'allin':
        return this.doRaise(p, p.stack + p.betThisRound);
      default:
        return { error: 'Unknown action' };
    }
  }

  doFold(p) {
    p.folded = true;
    p.acted = true;
    const remaining = this.players.filter((q) => this.inHand(q));
    if (remaining.length === 1) {
      this.endHand(remaining[0]);
    } else {
      this.advanceTurn();
    }
    return { ok: true };
  }

  doCheck(p) {
    if (p.betThisRound !== this.currentBet) return { error: 'You cannot check' };
    p.acted = true;
    this.advanceTurn();
    return { ok: true };
  }

  doCall(p) {
    const need = this.currentBet - p.betThisRound;
    if (need <= 0) {
      p.acted = true;
      this.advanceTurn();
      return { ok: true };
    }
    const callAmt = Math.min(need, p.stack);
    p.stack -= callAmt;
    p.betThisRound += callAmt;
    if (p.stack === 0) p.allIn = true;
    p.acted = true;
    this.advanceTurn();
    return { ok: true };
  }

  doRaise(p, target) {
    target = Math.max(0, Math.floor(Number(target) || 0));
    const maxTarget = p.stack + p.betThisRound;
    if (target > maxTarget) target = maxTarget;
    const oldBet = this.currentBet;
    if (target <= oldBet) return { error: 'Raise must exceed the current bet' };

    const inc = target - oldBet;
    const isAllIn = target === maxTarget;
    if (!isAllIn && inc < this.raiseInc) return { error: 'Minimum raise is ' + this.raiseInc };

    const add = target - p.betThisRound;
    p.stack -= add;
    p.betThisRound = target;
    this.currentBet = target;
    if (inc >= this.raiseInc) this.raiseInc = inc;
    // Reopen action for everyone else who can still act.
    for (const q of this.players) {
      if (q !== p && this.canAct(q)) q.acted = false;
    }
    if (p.stack === 0) p.allIn = true;
    p.acted = true;
    this.advanceTurn();
    return { ok: true };
  }

  advanceTurn() {
    if (this.isRoundComplete()) {
      this.advanceStage();
      return;
    }
    this.currentActor = this.nextCanAct(this.currentActor);
    if (this.currentActor < 0) {
      this.advanceStage();
      return;
    }
    this.startTurnTimer();
    this.emitState();
  }

  isRoundComplete() {
    const active = this.players.filter((p) => this.canAct(p));
    if (active.length === 0) return true;
    return active.every((p) => p.acted && p.betThisRound === this.currentBet);
  }

  collectStreet() {
    for (const p of this.players) {
      p.committed += p.betThisRound;
      p.betThisRound = 0;
      p.acted = false;
    }
    this.currentBet = 0;
    this.raiseInc = this.bbAmount;
  }

  advanceStage() {
    this.collectStreet();
    if (this.stage === 'preflop') {
      this.community = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      this.stage = 'flop';
    } else if (this.stage === 'flop') {
      this.community.push(this.deck.pop());
      this.stage = 'turn';
    } else if (this.stage === 'turn') {
      this.community.push(this.deck.pop());
      this.stage = 'river';
    } else if (this.stage === 'river') {
      this.showdown();
      return;
    }

    this.currentActor = this.firstToAct(this.stage);
    if (this.currentActor < 0) {
      this.advanceStage(); // still everyone all-in -> keep running out
      return;
    }
    this.startTurnTimer();
    this.emitState();
  }

  // ---------- showdown & pots ----------

  showdown() {
    this.collectStreet();
    const contenders = this.players.filter((p) => p.holeCards.length && !p.folded);
    const hands = {};
    for (const c of contenders) hands[c.id] = evaluate7([...c.holeCards, ...this.community]);
    const pots = this.awardPots(hands);
    this.finishHand({ type: 'showdown', winners: this.aggregateWinners(pots), board: this.community.slice() });
  }

  aggregateWinners(pots) {
    const map = new Map();
    for (const pot of pots) {
      pot.winnerIds.forEach((id, i) => {
        const entry = map.get(id) || { id, name: pot.winnerNames[i], amount: 0, hand: pot.hand };
        entry.amount += pot.amount;
        map.set(id, entry);
      });
    }
    return [...map.values()];
  }

  awardPots(hands) {
    const participants = this.players.filter((p) => p.committed > 0);
    const levels = [...new Set(participants.map((p) => p.committed))].sort((a, b) => a - b);
    let prev = 0;
    const results = [];

    for (const level of levels) {
      const contributors = participants.filter((p) => p.committed >= level);
      const size = (level - prev) * contributors.length;
      const eligible = contributors.filter((p) => !p.folded && p.holeCards.length);

      if (eligible.length > 0 && size > 0) {
        let winners;
        if (eligible.length === 1) {
          winners = eligible;
        } else {
          let best = null;
          for (const e of eligible) {
            const h = hands[e.id];
            if (best === null || compareHands(h, best) > 0) best = h;
          }
          winners = eligible.filter((e) => compareHands(hands[e.id], best) === 0);
        }

        const share = Math.floor(size / winners.length);
        let rem = size - share * winners.length;
        for (const w of winners) {
          w.stack += share;
          w.wonLast = (w.wonLast || 0) + share;
          if (rem > 0) {
            w.stack += 1;
            w.wonLast += 1;
            rem -= 1;
          }
        }

        results.push({
          amount: size,
          winnerIds: winners.map((w) => w.id),
          winnerNames: winners.map((w) => w.name),
          hand: hands[winners[0].id] ? handName(hands[winners[0].id]) : null,
        });
      }
      prev = level;
    }

    for (const p of this.players) p.committed = 0;
    return results;
  }

  endHand(winner) {
    this.collectStreet();
    const total = this.players.reduce((s, p) => s + p.committed, 0);
    winner.stack += total;
    winner.wonLast = (winner.wonLast || 0) + total;
    for (const p of this.players) p.committed = 0;
    this.finishHand({
      type: 'fold',
      winners: [{ id: winner.id, name: winner.name, amount: total, hand: null }],
    });
  }

  finishHand(result) {
    this.stage = 'handover';
    this.lastResult = result;
    this.bustCheck();
    this.clearTurnTimer();
    this.emitState();
  }

  bustCheck() {
    for (const p of this.players) {
      if (p.stack <= 0) {
        p.out = true;
        p.allIn = false;
      }
    }
  }

  // ---------- turn timer ----------

  startTurnTimer() {
    this.clearTurnTimer();
    if (!this.turnSeconds) return;
    this.turnDeadline = Date.now() + this.turnSeconds * 1000;
    this.turnTimer = setTimeout(() => {
      if (!BETTING_STAGES.has(this.stage)) return;
      const p = this.players[this.currentActor];
      if (p && this.canAct(p)) {
        if (p.betThisRound === this.currentBet) this.applyAction(p.id, { type: 'check' });
        else this.applyAction(p.id, { type: 'fold' });
      }
    }, this.turnSeconds * 1000);
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  // ---------- state snapshot ----------

  visibleCards(p, viewerId, showDown) {
    if (p.id === viewerId) return p.holeCards.slice();
    if (showDown && !p.folded && p.holeCards.length) return p.holeCards.slice();
    return [];
  }

  availableActions(viewerId) {
    if (!this.started || !BETTING_STAGES.has(this.stage) || this.currentActor < 0) return null;
    const p = this.players[this.currentActor];
    if (!p || p.id !== viewerId) return null;

    const call = this.currentBet - p.betThisRound;
    const actions = { fold: true };
    if (call <= 0) {
      actions.check = true;
    } else {
      actions.call = true;
      actions.callAmount = Math.min(call, p.stack);
    }
    if (p.stack > 0) {
      const maxRaiseTo = p.stack + p.betThisRound;
      if (maxRaiseTo > this.currentBet) {
        actions.raise = true;
        actions.minRaiseTo = Math.min(this.currentBet + this.raiseInc, maxRaiseTo);
        actions.maxRaiseTo = maxRaiseTo;
      }
      actions.allin = true;
    }
    return actions;
  }

  snapshot(viewerId) {
    const showDown = this.stage === 'handover';
    const blinds = this.blindIndices();
    return {
      roomCode: this.roomCode,
      stage: this.stage,
      handNumber: this.handNumber,
      started: this.started,
      gameOver: this.gameOver,
      finalRanking: this.finalRanking,
      community: this.community,
      pot: this.totalCommitted(),
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet + this.raiseInc,
      sbAmount: this.sbAmount,
      bbAmount: this.bbAmount,
      startingChips: this.startingChips,
      dealerIndex: this.dealerIndex,
      sbIndex: blinds.sb,
      bbIndex: blinds.bb,
      currentActorId: this.currentActor >= 0 ? this.players[this.currentActor].id : null,
      turnDeadline: this.turnDeadline,
      result: this.lastResult,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        isHost: p.id === this.hostId,
        connected: p.connected,
        out: p.out,
        left: p.left,
        folded: p.folded,
        allIn: p.allIn,
        betThisRound: p.betThisRound,
        committed: p.committed,
        wonLast: p.wonLast,
        holeCards: this.visibleCards(p, viewerId, showDown),
      })),
      you: this.availableActions(viewerId),
    };
  }
}
