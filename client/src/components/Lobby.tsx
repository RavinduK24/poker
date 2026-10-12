import { useState } from 'react';
import { socket } from '../socket';

interface Props {
  onJoin: (roomCode: string, playerId: string) => void;
}

export default function Lobby({ onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('poker-name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [startingChips, setStartingChips] = useState(1000);
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function persistName(n: string) {
    setName(n);
    localStorage.setItem('poker-name', n);
  }

  function createTable() {
    setBusy(true);
    setError('');
    persistName(name);
    socket.emit(
      'table:create',
      { name, startingChips, sbAmount: sb, bbAmount: bb },
      (res: { ok?: boolean; error?: string; roomCode?: string; playerId?: string }) => {
        setBusy(false);
        if (res?.ok && res.roomCode && res.playerId) onJoin(res.roomCode, res.playerId);
        else setError(res?.error || 'Could not create table');
      }
    );
  }

  function joinTable() {
    setBusy(true);
    setError('');
    persistName(name);
    socket.emit(
      'table:join',
      { roomCode: joinCode, name },
      (res: { ok?: boolean; error?: string; playerId?: string }) => {
        setBusy(false);
        if (res?.ok && res.playerId) onJoin(joinCode.trim().toUpperCase(), res.playerId);
        else setError(res?.error || 'Could not join table');
      }
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>🃏 Poker Club</h1>
        <p className="tagline">Texas Hold'em · play chips · no real money</p>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={16}
            placeholder="e.g. Alex"
            onChange={(e) => persistName(e.target.value)}
          />
        </label>

        <div className="lobby-split">
          <section className="panel-box">
            <h2>Host a game</h2>
            <label className="field">
              <span>Starting chips</span>
              <input
                type="number"
                min={1}
                value={startingChips}
                onChange={(e) => setStartingChips(Number(e.target.value))}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Small blind</span>
                <input type="number" min={1} value={sb} onChange={(e) => setSb(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Big blind</span>
                <input type="number" min={1} value={bb} onChange={(e) => setBb(Number(e.target.value))} />
              </label>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy || !name.trim()} onClick={createTable}>
              Create table
            </button>
          </section>

          <section className="panel-box">
            <h2>Join a game</h2>
            <label className="field">
              <span>Room code</span>
              <input
                value={joinCode}
                maxLength={6}
                placeholder="ABC123"
                style={{ textTransform: 'uppercase' }}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </label>
            <button className="btn btn-secondary btn-block" disabled={busy || !name.trim() || joinCode.trim().length < 4} onClick={joinTable}>
              Join table
            </button>
          </section>
        </div>

        {error && <div className="banner banner-error">{error}</div>}
      </div>
    </div>
  );
}
