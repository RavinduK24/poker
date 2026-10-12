// End-to-end check of the Socket.IO layer: create -> join -> start -> play a hand.
import { io as ioc } from 'socket.io-client';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(port) {
  return new Promise((resolve) => {
    const s = ioc(`http://localhost:${port}`, { transports: ['websocket', 'polling'] });
    s.on('connect', () => resolve(s));
  });
}

function emit(sock, ev, payload) {
  return new Promise((resolve) => sock.emit(ev, payload, (res) => resolve(res)));
}

const { server } = createApp();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const host = await connect(port);
const guest = await connect(port);

let hostState = null;
let guestState = null;
host.on('state', (s) => { hostState = s; });
guest.on('state', (s) => { guestState = s; });

try {
  const created = await emit(host, 'table:create', { name: 'Host', startingChips: 1000, sbAmount: 5, bbAmount: 10 });
  assert.ok(created.ok, 'create failed');
  const hostId = created.playerId;
  const code = created.roomCode;

  const joined = await emit(guest, 'table:join', { roomCode: code, name: 'Guest' });
  assert.ok(joined.ok, 'join failed');
  const guestId = joined.playerId;

  await sleep(150);
  assert.equal(hostState.players.length, 2, 'two seats');

  const start = await emit(host, 'table:start', {});
  assert.ok(start.ok, 'start failed');
  await sleep(150);
  assert.equal(hostState.stage, 'preflop');

  // Privacy: host cannot see guest's hole cards during the hand.
  assert.equal(hostState.players.find((p) => p.id === guestId).holeCards.length, 0);
  assert.equal(guestState.players.find((p) => p.id === guestId).holeCards.length, 2);

  // Heads-up: dealer (host) is the small blind and acts first.
  assert.equal(hostState.currentActorId, hostId, 'host acts first heads-up');

  // The actor's client gets an actions object; the other client gets none.
  assert.ok(hostState.you, 'host has actions');
  assert.equal(hostState.you.call, true, 'host can call');
  assert.equal(hostState.you.callAmount, 5, 'host call amount is 5 (SB already posted)');
  assert.equal(guestState.you, null, 'guest has no actions yet');

  await emit(host, 'game:action', { action: { type: 'allin' } });
  await sleep(150);
  assert.equal(hostState.currentActorId, guestId, 'guest to act after host all-in');
  await emit(guest, 'game:action', { action: { type: 'call' } });
  await sleep(250);
  assert.equal(hostState.stage, 'handover');

  const total = hostState.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(total, 2000, 'chips conserved');
  assert.equal(hostState.result.type, 'showdown');
  assert.equal(hostState.players.find((p) => p.id === guestId).holeCards.length, 2, 'showdown reveals cards');
  assert.equal(hostState.result.winners.length, 1, 'one winner');
  assert.ok(typeof hostState.result.winners[0].name === 'string' && hostState.result.winners[0].name.length > 0, 'winner has a name');
  assert.equal(hostState.result.winners[0].amount, 2000, 'winner takes the pot');

  console.log('E2E passed: create -> join -> start -> heads-up all-in -> showdown.');
} finally {
  host.close();
  guest.close();
  server.close();
}
