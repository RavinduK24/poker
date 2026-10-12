// In-process verification runner (works where child-process spawning is blocked).
import assert from 'node:assert/strict';
import { evaluate5, evaluate7, compareHands, handName } from '../src/handEval.js';
import { Table } from '../src/table.js';

const card = (rank, suit) => ({ rank, suit });
let passed = 0;

function t(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (e) {
    console.error('  FAIL  ' + name);
    console.error(String(e && e.stack ? e.stack : e));
    process.exitCode = 1;
  }
}

function newTable() {
  return new Table({ roomCode: 'T', startingChips: 1000, sbAmount: 5, bbAmount: 10, turnSeconds: 0 });
}

function act(table, action) {
  const p = table.players[table.currentActor];
  return table.applyAction(p.id, action);
}

console.log('handEval:');
t('royal flush is best 7-card hand', () => {
  const cards = [card(14, 'h'), card(13, 'h'), card(12, 'h'), card(11, 'h'), card(10, 'h'), card(2, 's'), card(3, 'd')];
  assert.deepEqual(evaluate7(cards), [8, 14]);
  assert.equal(handName(evaluate7(cards)), 'Straight Flush');
});
t('wheel straight A-2-3-4-5 beats a pair', () => {
  const cards = [card(14, 's'), card(2, 'h'), card(3, 'd'), card(4, 'c'), card(5, 'h'), card(9, 's'), card(9, 'd')];
  assert.deepEqual(evaluate7(cards), [4, 5]);
});
t('full house beats a flush', () => {
  const fh = [card(14, 'h'), card(14, 'd'), card(14, 'c'), card(13, 's'), card(13, 'h'), card(2, 'd'), card(3, 'c')];
  const flush = [card(14, 'h'), card(13, 'h'), card(9, 'h'), card(6, 'h'), card(2, 'h'), card(14, 's'), card(13, 'd')];
  assert.equal(handName(evaluate7(fh)), 'Full House');
  assert.equal(handName(evaluate7(flush)), 'Flush');
  assert.ok(compareHands(evaluate7(fh), evaluate7(flush)) > 0);
});
t('quads kicker', () => {
  const cards = [card(9, 's'), card(9, 'h'), card(9, 'd'), card(9, 'c'), card(2, 's'), card(3, 'h'), card(4, 'd')];
  assert.deepEqual(evaluate7(cards), [7, 9, 4]);
});
t('two pair ranks correctly with kicker', () => {
  const cards = [card(14, 's'), card(14, 'h'), card(13, 'd'), card(13, 'c'), card(2, 's'), card(3, 'h'), card(4, 'd')];
  assert.deepEqual(evaluate7(cards), [2, 14, 13, 4]);
});
t('evaluate5 one pair', () => {
  assert.equal(handName(evaluate5([card(14, 'h'), card(2, 's'), card(7, 'd'), card(7, 'c'), card(9, 'h')])), 'One Pair');
});

console.log('table:');
t('heads-up all-in distributes the full pot', () => {
  const t = newTable();
  const a = t.addPlayer('sa', 'A', true);
  const b = t.addPlayer('sb', 'B', false);
  t.startGame();
  assert.equal(t.stage, 'preflop');
  assert.equal(t.players[t.currentActor].id, a.id);
  act(t, { type: 'allin' });
  act(t, { type: 'call' });
  assert.equal(t.stage, 'handover');
  assert.equal(t.players.reduce((s, p) => s + p.stack, 0), 2000);
  assert.ok(t.players.find((p) => p.stack === 2000));
  assert.equal(t.lastResult.type, 'showdown');
});
t('side pots: short all-in capped, excess returned', () => {
  const t = newTable();
  const pa = t.addPlayer('sa', 'A', true);
  const pb = t.addPlayer('sb', 'B', false);
  const pc = t.addPlayer('sc', 'C', false);
  pa.committed = 100; pb.committed = 200; pc.committed = 1000;
  pa.holeCards = [card(14, 's'), card(14, 'h')];
  pb.holeCards = [card(6, 's'), card(5, 's')];
  pc.holeCards = [card(13, 's'), card(13, 'h')];
  pa.stack = pb.stack = pc.stack = 0;
  const hands = { [pa.id]: [0, 14], [pb.id]: [8, 6], [pc.id]: [1, 13] };
  const results = t.awardPots(hands);
  assert.deepEqual(results.map((r) => r.amount), [300, 200, 800]);
  assert.equal(pb.stack, 500);
  assert.equal(pc.stack, 800);
  assert.equal(pa.stack, 0);
});
t('odd chips go to the first winners in a multi-way tie', () => {
  const t = newTable();
  const pa = t.addPlayer('sa', 'A', true);
  const pb = t.addPlayer('sb', 'B', false);
  const pc = t.addPlayer('sc', 'C', false);
  const pd = t.addPlayer('sd', 'D', false);
  pa.committed = 100; pb.committed = 100; pc.committed = 100; pd.committed = 50;
  pd.folded = true; // dead money
  pa.holeCards = [card(5, 's'), card(4, 's')];
  pb.holeCards = [card(5, 'h'), card(4, 'h')];
  pc.holeCards = [card(5, 'd'), card(4, 'd')];
  pd.holeCards = [card(2, 's'), card(3, 'h')];
  pa.stack = pb.stack = pc.stack = pd.stack = 0;
  const hands = { [pa.id]: [4, 5], [pb.id]: [4, 5], [pc.id]: [4, 5], [pd.id]: [0, 3] };
  t.awardPots(hands);
  assert.equal(pa.stack + pb.stack + pc.stack, 350); // 300 live + 50 dead money
  assert.equal(pd.stack, 0);
  assert.deepEqual([pa.stack, pb.stack, pc.stack].sort((x, y) => x - y), [116, 117, 117]);
});
t('folded players never win a pot', () => {
  const t = newTable();
  const pa = t.addPlayer('sa', 'A', true);
  const pb = t.addPlayer('sb', 'B', false);
  const pc = t.addPlayer('sc', 'C', false);
  pa.committed = pb.committed = pc.committed = 100;
  pa.folded = true;
  pa.holeCards = [card(14, 's'), card(14, 'h')];
  pb.holeCards = [card(2, 's'), card(3, 'h')];
  pc.holeCards = [card(4, 's'), card(5, 'h')];
  pa.stack = pb.stack = pc.stack = 0;
  const hands = { [pa.id]: [8, 14], [pb.id]: [0, 5], [pc.id]: [0, 4] };
  const results = t.awardPots(hands);
  assert.equal(results[0].winnerIds[0], pb.id);
  assert.equal(pb.stack, 300);
});
t('blinds rotate around the table each hand', () => {
  const t = newTable();
  t.addPlayer('sa', 'A', true);
  t.addPlayer('sb', 'B', false);
  t.addPlayer('sc', 'C', false);
  t.startGame();
  assert.equal(t.dealerIndex, 0);
  assert.equal(t.findSB(), 1);
  assert.equal(t.findBB(), 2);
  act(t, { type: 'fold' });
  act(t, { type: 'fold' });
  assert.equal(t.stage, 'handover');
  t.nextHand();
  assert.equal(t.dealerIndex, 1);
  assert.equal(t.findSB(), 2);
  assert.equal(t.findBB(), 0);
});
t('everyone folds to the big blind', () => {
  const t = newTable();
  t.addPlayer('sa', 'A', true);
  t.addPlayer('sb', 'B', false);
  t.addPlayer('sc', 'C', false);
  t.startGame();
  act(t, { type: 'fold' });
  act(t, { type: 'fold' });
  assert.equal(t.stage, 'handover');
  assert.equal(t.lastResult.type, 'fold');
  assert.equal(t.lastResult.winners[0].id, t.players[2].id);
});
t('bet, raise, and call advance through a full street', () => {
  const t = newTable();
  t.addPlayer('sa', 'A', true);
  t.addPlayer('sb', 'B', false);
  t.addPlayer('sc', 'C', false);
  t.startGame();
  act(t, { type: 'raise', amount: 30 });
  act(t, { type: 'call' });
  act(t, { type: 'call' });
  assert.equal(t.stage, 'flop');
  assert.equal(t.community.length, 3);
});

console.log('');
if (process.exitCode) {
  console.error('Some checks failed.');
} else {
  console.log(`All ${passed} checks passed.`);
}
