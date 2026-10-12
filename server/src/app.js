import http from 'node:http';
import { Server } from 'socket.io';
import { Table } from './table.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function clean(s) {
  return String(s || '').replace(/[<>]/g, '').trim();
}

function clampInt(v, fallback, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createApp() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Texas Hold'em server is running");
  });

  const io = new Server(server, {
    cors: { origin: true, credentials: false },
  });

  const tables = new Map();

  function broadcast(table) {
    for (const p of table.players) {
      if (p.socketId) io.to(p.socketId).emit('state', table.snapshot(p.id));
    }
  }

  function tableOf(socket) {
    return tables.get(socket.data.roomCode);
  }

  io.on('connection', (socket) => {
    socket.on('table:create', (payload, cb) => {
      try {
        const bbAmount = clampInt(payload?.bbAmount, 10, 1, 1_000_000);
        const sbAmount = clampInt(payload?.sbAmount, Math.ceil(bbAmount / 2), 1, bbAmount);
        const startingChips = clampInt(payload?.startingChips, 1000, 1, 1_000_000_000);
        const name = clean(payload?.name) || 'Host';

        let code = genCode();
        while (tables.has(code)) code = genCode();

        const table = new Table({ roomCode: code, startingChips, sbAmount, bbAmount, turnSeconds: 45 });
        const player = table.addPlayer(socket.id, name, true);
        if (!player) return cb?.({ ok: false, error: 'Could not create a seat' });

        tables.set(code, table);
        socket.join(code);
        socket.data.roomCode = code;
        socket.data.playerId = player.id;
        table.emitState = () => broadcast(table);

        cb?.({ ok: true, roomCode: code, playerId: player.id });
        broadcast(table);
      } catch (e) {
        cb?.({ ok: false, error: e.message });
      }
    });

    socket.on('table:join', (payload, cb) => {
      const roomCode = String(payload?.roomCode || '').trim().toUpperCase();
      const table = tables.get(roomCode);
      if (!table) return cb?.({ ok: false, error: 'Room not found' });

      const name = clean(payload?.name) || 'Player';
      const player = table.addPlayer(socket.id, name, false);
      if (!player) return cb?.({ ok: false, error: 'Table is full (max 9 players)' });

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.playerId = player.id;
      cb?.({ ok: true, playerId: player.id });
      broadcast(table);
    });

    socket.on('table:start', (payload, cb) => {
      const table = tableOf(socket);
      if (!table) return cb?.({ ok: false, error: 'Not in a room' });
      if (socket.data.playerId !== table.hostId) {
        return cb?.({ ok: false, error: 'Only the host can start the game' });
      }
      const res = table.startGame();
      cb?.(res);
      broadcast(table);
    });

    socket.on('game:action', (payload, cb) => {
      const table = tableOf(socket);
      if (!table) return cb?.({ ok: false, error: 'Not in a room' });
      const res = table.applyAction(socket.data.playerId, payload?.action);
      cb?.(res);
    });

    socket.on('game:next', (payload, cb) => {
      const table = tableOf(socket);
      if (!table) return cb?.({ ok: false, error: 'Not in a room' });
      if (socket.data.playerId !== table.hostId) {
        return cb?.({ ok: false, error: 'Only the host can advance' });
      }
      const res = table.nextHand();
      cb?.(res);
      broadcast(table);
    });

    socket.on('table:leave', () => {
      const table = tableOf(socket);
      if (!table) return;
      table.removePlayer(socket.data.playerId);
      socket.leave(table.roomCode);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      broadcast(table);
    });

    socket.on('disconnect', () => {
      const table = tableOf(socket);
      if (!table) return;
      table.markDisconnected(socket.data.playerId);
      broadcast(table);
    });
  });

  return { server, io, tables };
}
