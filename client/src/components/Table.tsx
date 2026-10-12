import { useEffect, useState } from 'react';
import type { TableState, PlayerState, YourActions } from '../types';
import CardView from './CardView';

interface Props {
  state: TableState;
  playerId: string;
  onAction: (a: { type: string; amount?: number }) => void;
  onStart: () => void;
  onNextHand: () => void;
  onLeave: () => void;
}

const BETTING = ['preflop', 'flop', 'turn', 'river'];

export default function Table({ state, playerId, onAction, onStart, onNextHand, onLeave }: Props) {
  const me = state.players.find((p) => p.id === playerId);
  const opponents = state.players.filter((p) => p.id !== playerId);
  const isHost = !!me?.isHost;
  const betting = BETTING.includes(state.stage);
  const activeSeats = state.players.filter((p) => !p.left).length;

  const [now, setNow] = useState(() => Date.now());
  const [raiseTo, setRaiseTo] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const you: YourActions | null = state.you;
  useEffect(() => {
    if (you?.raise) {
      const min = you.minRaiseTo ?? 0;
      const max = you.maxRaiseTo ?? 0;
      setRaiseTo((v) => (v < min || v > max ? min : v));
    }
  }, [you?.minRaiseTo, you?.maxRaiseTo]);

  const secondsLeft = state.turnDeadline ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null;

  const badges = (p: PlayerState) => {
    const idx = state.players.indexOf(p);
    const b: string[] = [];
    if (idx === state.dealerIndex) b.push('D');
    if (idx === state.sbIndex) b.push('SB');
    if (idx === state.bbIndex) b.push('BB');
    return b;
  };

  const copyCode = () => {
    try {
      navigator.clipboard.writeText(state.roomCode);
    } catch {
      /* ignore */
    }
  };

  function renderSeat(p: PlayerState, isMe: boolean) {
    const active = state.currentActorId === p.id;
    const faceDown = !isMe && state.stage !== 'handover';
    const cards = p.holeCards.length ? p.holeCards : [null, null];
    return (
      <div
        key={p.id}
        className={'seat' + (active ? ' seat-active' : '') + (p.out ? ' seat-busted' : '') + (!p.connected ? ' seat-offline' : '')}
      >
        <div className="seat-top">
          <span className="seat-name">{p.name}{isMe ? ' (you)' : ''}</span>
          <span className="seat-badges">
            {badges(p).map((b) => (
              <span key={b} className={'badge badge-' + b.toLowerCase()}>{b}</span>
            ))}
          </span>
        </div>
        <div className="seat-cards">
          {cards.map((c, i) => (
            <CardView key={i} card={c} faceDown={faceDown} />
          ))}
        </div>
        <div className="seat-meta">
          <span className="seat-stack">{p.stack}</span>
          {p.allIn && <span className="tag tag-allin">All-in</span>}
          {p.folded && <span className="tag tag-fold">Folded</span>}
          {p.out && <span className="tag tag-out">Out</span>}
          {p.wonLast > 0 && state.stage === 'handover' && <span className="tag tag-win">+{p.wonLast}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <header className="table-bar">
        <div className="room">
          Room <b>{state.roomCode}</b>
          <button className="btn btn-ghost" onClick={copyCode}>Copy</button>
        </div>
        <div className="table-info">
          Blinds {state.sbAmount}/{state.bbAmount} · Start {state.startingChips}
        </div>
        <button className="btn btn-ghost" onClick={onLeave}>Leave</button>
      </header>

      {state.gameOver && (
        <div className="overlay">
          <div className="panel">
            <h2>Game over</h2>
            <ol className="ranking">
              {(state.finalRanking || []).map((r, i) => (
                <li key={r.id}>
                  <span className="rank-num">{i + 1}.</span> {r.name} — {r.stack} chips
                </li>
              ))}
            </ol>
            <button className="btn btn-primary" onClick={onLeave}>Leave table</button>
          </div>
        </div>
      )}

      <div className="opponents">{opponents.map((p) => renderSeat(p, false))}</div>

      <div className="felt">
        <div className="pot-label">Pot {state.pot}</div>
        <div className="community">
          {[0, 1, 2, 3, 4].map((i) => (
            <CardView key={i} card={state.community[i] ?? null} />
          ))}
        </div>

        {state.stage === 'handover' && state.result && (
          <div className="result">
            {state.result.winners.map((w) => (
              <div key={w.id} className="winner-line">
                <span className="winner-name">{w.name}</span> wins <b>{w.amount}</b>
                {w.hand ? <span className="winner-hand"> · {w.hand}</span> : null}
              </div>
            ))}
            {isHost && (
              <button className="btn btn-primary" onClick={onNextHand}>Next hand</button>
            )}
          </div>
        )}

        {state.stage === 'waiting' && !state.started && (
          <div className="waiting">
            {isHost ? (
              <button className="btn btn-primary" disabled={activeSeats < 2} onClick={onStart}>
                Start game ({activeSeats} player{activeSeats === 1 ? '' : 's'})
              </button>
            ) : (
              <p>Waiting for the host to start…</p>
            )}
          </div>
        )}
      </div>

      {me && (
        <div className="my-area">
          <div className="my-seat">{renderSeat(me, true)}</div>
          {betting && you && (
            <ActionBar
              you={you}
              state={state}
              playerId={playerId}
              secondsLeft={secondsLeft}
              raiseTo={raiseTo}
              setRaiseTo={setRaiseTo}
              onAction={onAction}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBar({
  you,
  state,
  playerId,
  secondsLeft,
  raiseTo,
  setRaiseTo,
  onAction,
}: {
  you: YourActions;
  state: TableState;
  playerId: string;
  secondsLeft: number | null;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  onAction: (a: { type: string; amount?: number }) => void;
}) {
  const me = state.players.find((p) => p.id === playerId);
  const myTurn = state.currentActorId === playerId;
  const actor = state.players.find((p) => p.id === state.currentActorId);

  return (
    <div className="actions">
      {!myTurn && <div className="turn-note">Waiting for {actor?.name ?? '…'}</div>}

      {myTurn && (
        <>
          {secondsLeft !== null && <div className="timer">{secondsLeft}s</div>}
          <button className="btn btn-danger" disabled={!you.fold} onClick={() => onAction({ type: 'fold' })}>
            Fold
          </button>
          {you.check ? (
            <button className="btn" onClick={() => onAction({ type: 'check' })}>Check</button>
          ) : you.call ? (
            <button className="btn" onClick={() => onAction({ type: 'call' })}>Call {you.callAmount}</button>
          ) : null}
          {you.raise && (
            <div className="raise-ctrl">
              <div className="raise-row">
                <input
                  type="range"
                  min={you.minRaiseTo}
                  max={you.maxRaiseTo}
                  step={1}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
                <span className="raise-value">{raiseTo}</span>
              </div>
              <div className="raise-presets">
                <button className="btn btn-ghost" onClick={() => setRaiseTo(you.minRaiseTo!)}>Min</button>
                <button className="btn btn-ghost" onClick={() => setRaiseTo(Math.min(you.maxRaiseTo!, Math.floor(state.pot / 2) + state.currentBet))}>
                  ½ Pot
                </button>
                <button className="btn btn-ghost" onClick={() => setRaiseTo(Math.min(you.maxRaiseTo!, state.pot + state.currentBet))}>
                  Pot
                </button>
                <button className="btn btn-ghost" onClick={() => setRaiseTo(you.maxRaiseTo!)}>Max</button>
              </div>
              <button className="btn btn-primary" onClick={() => onAction({ type: 'raise', amount: raiseTo })}>
                Raise to {raiseTo}
              </button>
            </div>
          )}
          {you.allin && me && (
            <button className="btn btn-warn" onClick={() => onAction({ type: 'allin' })}>
              All-in {me.stack}
            </button>
          )}
        </>
      )}
    </div>
  );
}
