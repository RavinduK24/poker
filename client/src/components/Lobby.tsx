import { useRef, useState } from 'react';
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
  const [blindsCustom, setBlindsCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Keep blinds proportional to the starting stack (~100 big blinds) so bet and
  // raise sizes scale with the host's chosen stack. Editing blinds by hand opts out.
  function onStartingChips(v: number) {
    setStartingChips(v);
    if (!blindsCustom) {
      const chips = Math.max(1, v);
      setBb(Math.max(2, Math.round(chips / 100)));
      setSb(Math.max(1, Math.round(chips / 200)));
    }
  }

  function persistName(n: string) {
    setName(n);
    localStorage.setItem('poker-name', n);
    if (error) setError('');
  }

  // Returns true when it is safe to continue, otherwise explains why not.
  function needsName(): boolean {
    if (!name.trim()) {
      setError('Please enter your name in the "Your name" box above.');
      nameRef.current?.focus();
      return true;
    }
    return false;
  }

  function offline(): boolean {
    if (!socket.connected) {
      setError('Still connecting to the game server — please wait a second and tap again.');
      return true;
    }
    return false;
  }

  function createTable() {
    setError('');
    if (needsName() || offline()) return;
    setBusy(true);
    socket.emit(
      'table:create',
      { name: name.trim(), startingChips, sbAmount: sb, bbAmount: bb },
      (res: { ok?: boolean; error?: string; roomCode?: string; playerId?: string }) => {
        setBusy(false);
        if (res?.ok && res.roomCode && res.playerId) onJoin(res.roomCode, res.playerId);
        else setError(res?.error || 'Could not create the table. Please try again.');
      }
    );
  }

  function joinTable() {
    setError('');
    if (needsName() || offline()) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError('Please enter the room code the host shared with you.');
      return;
    }
    setBusy(true);
    socket.emit(
      'table:join',
      { roomCode: code, name: name.trim() },
      (res: { ok?: boolean; error?: string; playerId?: string }) => {
        setBusy(false);
        if (res?.ok && res.playerId) onJoin(code, res.playerId);
        else setError(res?.error || 'Could not join the table. Please try again.');
      }
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>🃏 Poker Club</h1>
        <p className="tagline">Texas Hold'em · play chips · no real money</p>

        <label className="field">
          <span>
            Your name <em className="field-hint">(required)</em>
          </span>
          <input
            ref={nameRef}
            value={name}
            maxLength={16}
            placeholder="e.g. Alex"
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
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
                onChange={(e) => onStartingChips(Number(e.target.value))}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Small blind</span>
                <input type="number" min={1} value={sb} onChange={(e) => { setSb(Number(e.target.value)); setBlindsCustom(true); }} />
              </label>
              <label className="field">
                <span>Big blind</span>
                <input type="number" min={1} value={bb} onChange={(e) => { setBb(Number(e.target.value)); setBlindsCustom(true); }} />
              </label>
            </div>
            <p className="field-note">
              {blindsCustom
                ? 'Blinds are set manually.'
                : 'Blinds auto-scale to about 100 big blinds of your stack.'}
            </p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={createTable}>
              {busy ? 'Working…' : 'Create table'}
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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  if (error) setError('');
                }}
              />
            </label>
            <button className="btn btn-secondary btn-block" disabled={busy} onClick={joinTable}>
              {busy ? 'Working…' : 'Join table'}
            </button>
          </section>
        </div>

        {error && <div className="banner banner-error">{error}</div>}
      </div>
    </div>
  );
}
