import { useEffect, useState } from 'react';
import { socket } from './socket';
import type { TableState } from './types';
import Lobby from './components/Lobby';
import Table from './components/Table';

type Screen = 'lobby' | 'table';

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [state, setState] = useState<TableState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (s: TableState) => setState(s);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
    };
  }, []);

  function enterTable(code: string, pid: string) {
    setRoomCode(code);
    setPlayerId(pid);
    setError('');
    setScreen('table');
  }

  function leave() {
    socket.emit('table:leave');
    setScreen('lobby');
    setState(null);
    setRoomCode('');
    setPlayerId('');
  }

  function handle(res?: { error?: string }) {
    if (res?.error) setError(res.error);
  }

  return (
    <div className="app">
      {!connected && <div className="banner banner-warn">Connecting to server…</div>}
      {error && (
        <div className="banner banner-error">
          {error}
          <button className="banner-close" onClick={() => setError('')}>×</button>
        </div>
      )}

      {screen === 'lobby' && <Lobby onJoin={enterTable} />}

      {screen === 'table' && state && (
        <Table
          state={state}
          playerId={playerId}
          onAction={(a) => socket.emit('game:action', { action: a }, handle)}
          onStart={() => socket.emit('table:start', {}, handle)}
          onNextHand={() => socket.emit('game:next', {}, handle)}
          onLeave={leave}
        />
      )}
      {screen === 'table' && !state && <div className="loading">Loading table…</div>}

      <div className="app-meta">Room {roomCode || '—'} · Play chips only · no real money</div>
    </div>
  );
}
