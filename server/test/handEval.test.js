import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate5, evaluate7, compareHands, handName } from '../src/handEval.js';

const c = (rank, suit) => ({ rank, suit });

test('royal flush is the best 7-card hand', () => {
  const cards = [c(14, 'h'), c(13, 'h'), c(12, 'h'), c(11, 'h'), c(10, 'h'), c(2, 's'), c(3, 'd')];
  assert.deepEqual(evaluate7(cards), [8, 14]);
  assert.equal(handName(evaluate7(cards)), 'Straight Flush');
});

test('wheel straight A-2-3-4-5 beats a pair', () => {
  const cards = [c(14, 's'), c(2, 'h'), c(3, 'd'), c(4, 'c'), c(5, 'h'), c(9, 's'), c(9, 'd')];
  assert.deepEqual(evaluate7(cards), [4, 5]);
});

test('full house beats a flush', () => {
  const fh = [c(14, 'h'), c(14, 'd'), c(14, 'c'), c(13, 's'), c(13, 'h'), c(2, 'd'), c(3, 'c')];
  const flush = [c(14, 'h'), c(13, 'h'), c(9, 'h'), c(6, 'h'), c(2, 'h'), c(14, 's'), c(13, 'd')];
  assert.equal(handName(evaluate7(fh)), 'Full House');
  assert.equal(handName(evaluate7(flush)), 'Flush');
  assert.ok(compareHands(evaluate7(fh), evaluate7(flush)) > 0);
});

test('quads kicker', () => {
  const cards = [c(9, 's'), c(9, 'h'), c(9, 'd'), c(9, 'c'), c(2, 's'), c(3, 'h'), c(4, 'd')];
  assert.deepEqual(evaluate7(cards), [7, 9, 4]);
});

test('two pair ranks correctly with kicker', () => {
  const cards = [c(14, 's'), c(14, 'h'), c(13, 'd'), c(13, 'c'), c(2, 's'), c(3, 'h'), c(4, 'd')];
  assert.deepEqual(evaluate7(cards), [2, 14, 13, 4]);
});

test('straight over two pair', () => {
  const straight = [c(9, 's'), c(8, 'h'), c(7, 'd'), c(6, 'c'), c(5, 'h'), c(2, 'd'), c(3, 'c')];
  assert.equal(handName(evaluate7(straight)), 'Straight');
});

test('evaluate5 handles a non-straight five-card hand', () => {
  assert.equal(handName(evaluate5([c(14, 'h'), c(2, 's'), c(7, 'd'), c(7, 'c'), c(9, 'h')])), 'One Pair');
});
