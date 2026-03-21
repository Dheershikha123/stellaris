import { useState, useEffect } from 'react'
import {
  connectWallet, createBet, acceptBet,
  resolveBet, cancelBet, getBet, getBetCount,
  CONTRACT_ID,
} from './lib/stellar'

const XLM = (stroops) => (Number(stroops) / 10_000_000).toFixed(2)
const short = (a) => a ? `${a.toString().slice(0,5)}…${a.toString().slice(-4)}` : '—'
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS || ''

// ── Status chip ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  Open: { label: 'OPEN', cls: 'chip-open' },
  Matched: { label: 'LIVE', cls: 'chip-live' },
  Resolved: { label: 'SETTLED', cls: 'chip-settled' },
  Cancelled: { label: 'VOID', cls: 'chip-void' },
}

function StatusChip({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: '' }
  return <span className={`chip ${s.cls}`}>{s.label}</span>
}

// ── Odds display ───────────────────────────────────────────────────────────
function OddsBar({ cStake, cpStake }) {
  const total = Number(cStake) + Number(cpStake)
  if (total === 0) return null
  const cPct = Math.round((Number(cStake) / total) * 100)
  return (
    <div className="odds-wrap">
      <div className="odds-bar">
        <div className="odds-fill" style={{ width: `${cPct}%` }} />
      </div>
      <div className="odds-labels">
        <span className="odds-a">{XLM(cStake)} XLM · CREATOR</span>
        <span className="odds-b">TAKER · {XLM(cpStake)} XLM</span>
      </div>
    </div>
  )
}

// ── Single bet card ────────────────────────────────────────────────────────
function BetCard({ bet, wallet, onAction }) {
  const [busy, setBusy] = useState(false)
  const isCreator = wallet && bet.creator?.toString() === wallet
  const isOracle  = wallet && bet.oracle?.toString() === wallet
  const isMatched = bet.status === 'Matched'
  const isOpen    = bet.status === 'Open'

  const pot = Number(bet.creator_stake) + Number(bet.counterparty_stake)

  const handle = async (fn, label) => {
    setBusy(true)
    try { await fn(); onAction({ type: 'ok', msg: `${label} confirmed ✓` }) }
    catch (e) { onAction({ type: 'err', msg: e.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className={`bet-card ${bet.status === 'Resolved' ? 'bet-settled' : ''}`}>
      <div className="bet-card-top">
        <span className="bet-id">BET #{bet.id?.toString()}</span>
        <StatusChip status={bet.status} />
        <span className="bet-pot">{XLM(pot)} XLM POT</span>
      </div>

      <p className="bet-desc">"{bet.description}"</p>

      <OddsBar cStake={bet.creator_stake} cpStake={bet.counterparty_stake} />

      <div className="bet-meta-grid">
        <div className="meta-item">
          <span className="meta-lbl">CREATOR</span>
          <span className="meta-val">{short(bet.creator)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-lbl">TAKER</span>
          <span className="meta-val">{bet.counterparty ? short(bet.counterparty) : '—'}</span>
        </div>
        <div className="meta-item">
          <span className="meta-lbl">ORACLE</span>
          <span className="meta-val">{short(bet.oracle)}</span>
        </div>
        {bet.winner && (
          <div className="meta-item meta-winner">
            <span className="meta-lbl">WINNER</span>
            <span className="meta-val winner-val">{short(bet.winner)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {wallet && (
        <div className="bet-actions">
          {isOpen && !isCreator && (
            <button
              className="btn-accept"
              disabled={busy}
              onClick={() => handle(
                () => acceptBet(wallet, bet.id, bet.counterparty_stake),
                'Bet accepted'
              )}
            >
              {busy ? 'SIGNING…' : `TAKE THIS BET · ${XLM(bet.counterparty_stake)} XLM`}
            </button>
          )}
          {isOpen && isCreator && (
            <button
              className="btn-cancel"
              disabled={busy}
              onClick={() => handle(() => cancelBet(wallet, bet.id), 'Bet cancelled')}
            >
              {busy ? 'SIGNING…' : 'CANCEL BET'}
            </button>
          )}
          {isMatched && isOracle && (
            <div className="resolve-row">
              <span className="resolve-label">ORACLE RESOLVE:</span>
              <button
                className="btn-resolve-creator"
                disabled={busy}
                onClick={() => handle(
                  () => resolveBet(wallet, bet.id, bet.creator.toString()),
                  'Resolved — creator wins'
                )}
              >{busy ? '…' : `CREATOR WINS`}</button>
              <button
                className="btn-resolve-taker"
                disabled={busy}
                onClick={() => handle(
                  () => resolveBet(wallet, bet.id, bet.counterparty.toString()),
                  'Resolved — taker wins'
                )}
              >{busy ? '…' : `TAKER WINS`}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Create bet form ────────────────────────────────────────────────────────
function CreateForm({ wallet, onCreated }) {
  const [desc, setDesc] = useState('')
  const [oracle, setOracle] = useState(ORACLE_ADDRESS)
  const [myStake, setMyStake] = useState('1')
  const [theirStake, setTheirStake] = useState('1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const { txHash, betId } = await createBet(
        wallet, oracle, desc,
        parseFloat(myStake), parseFloat(theirStake)
      )
      onCreated({ txHash, betId })
      setDesc(''); setMyStake('1'); setTheirStake('1')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <div className="form-header">NEW BET SLIP</div>

      <div className="slip-body">
        <div className="field">
          <label>WHAT ARE YOU BETTING ON?</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="e.g. Manchester City wins the next Champions League"
            maxLength={200}
            rows={3}
            required
            disabled={!wallet || busy}
          />
          <span className="char-count">{desc.length}/200</span>
        </div>

        <div className="field">
          <label>ORACLE ADDRESS</label>
          <input
            value={oracle}
            onChange={e => setOracle(e.target.value)}
            placeholder="G… — the wallet that will declare the winner"
            required
            disabled={!wallet || busy}
          />
          <p className="field-hint">Oracle must sign a resolve_bet transaction to pay out the winner.</p>
        </div>

        <div className="stake-row">
          <div className="field field-half">
            <label>YOUR STAKE (XLM)</label>
            <input
              type="number" min="0.1" step="0.1"
              value={myStake}
              onChange={e => setMyStake(e.target.value)}
              required disabled={!wallet || busy}
            />
          </div>
          <div className="vs-divider">VS</div>
          <div className="field field-half">
            <label>TAKER MUST STAKE (XLM)</label>
            <input
              type="number" min="0.1" step="0.1"
              value={theirStake}
              onChange={e => setTheirStake(e.target.value)}
              required disabled={!wallet || busy}
            />
          </div>
        </div>

        <div className="slip-total">
          <span>TOTAL POT</span>
          <span className="slip-total-val">
            {(parseFloat(myStake || 0) + parseFloat(theirStake || 0)).toFixed(2)} XLM
          </span>
        </div>

        {err && <p className="form-err">{err}</p>}

        <button className="btn-post-bet" type="submit" disabled={!wallet || busy || !desc}>
          {!wallet ? 'CONNECT WALLET TO BET' : busy ? 'SUBMITTING TO CHAIN…' : 'LOCK IN BET'}
        </button>
      </div>
    </form>
  )
}

// ── Look up bet ────────────────────────────────────────────────────────────
function LookupPanel({ wallet, onAction }) {
  const [id, setId] = useState('')
  const [bet, setBet] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = async (e) => {
    e.preventDefault()
    setLoading(true); setBet(null)
    try { setBet(await getBet(parseInt(id))) }
    catch { onAction({ type: 'err', msg: 'Bet not found' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="lookup-panel">
      <form onSubmit={fetch} className="lookup-form">
        <input
          type="number" min="1"
          value={id}
          onChange={e => setId(e.target.value)}
          placeholder="Bet ID"
          className="lookup-input"
          required
        />
        <button type="submit" className="btn-lookup" disabled={loading}>
          {loading ? '…' : 'PULL'}
        </button>
      </form>
      {bet && (
        <BetCard bet={bet} wallet={wallet} onAction={onAction} />
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet, setWallet] = useState(null)
  const [tab, setTab] = useState('create')
  const [toast, setToast] = useState(null)
  const [betCount, setBetCount] = useState(0)
  const [recentBets, setRecentBets] = useState([])
  const [loadingFeed, setLoadingFeed] = useState(false)

  useEffect(() => {
    getBetCount().then(c => {
      setBetCount(c)
      if (c > 0) loadRecent(c)
    })
  }, [])

  const loadRecent = async (count) => {
    setLoadingFeed(true)
    const ids = []
    for (let i = count; i >= Math.max(1, count - 4); i--) ids.push(i)
    const results = await Promise.allSettled(ids.map(id => getBet(id)))
    setRecentBets(results.filter(r => r.status === 'fulfilled').map(r => r.value))
    setLoadingFeed(false)
  }

  const showToast = (t) => {
    setToast(t)
    setTimeout(() => setToast(null), 5000)
  }

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast({ type: 'err', msg: e.message }) }
  }

  const handleAction = (t) => {
    showToast(t)
    getBetCount().then(c => { setBetCount(c); if (c > 0) loadRecent(c) })
  }

  const handleCreated = ({ txHash, betId }) => {
    showToast({ type: 'ok', msg: `Bet #${betId} created!`, hash: txHash })
    getBetCount().then(c => { setBetCount(c); loadRecent(c) })
    setTab('feed')
  }

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">⬡</div>
          <div>
            <div className="brand-name">ChainBet</div>
            <div className="brand-sub">STELLAR TESTNET</div>
          </div>
        </div>

        <nav className="nav">
          {[
            { id: 'create', label: 'NEW BET', icon: '+' },
            { id: 'feed',   label: 'OPEN BETS', icon: '◎' },
            { id: 'lookup', label: 'LOOK UP BET', icon: '⌕' },
          ].map(t => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'nav-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-stats">
          <div className="sstat">
            <span className="sstat-n">{betCount}</span>
            <span className="sstat-l">TOTAL BETS</span>
          </div>
          <div className="sstat">
            <span className="sstat-n">{recentBets.filter(b => b.status === 'Open').length}</span>
            <span className="sstat-l">OPEN NOW</span>
          </div>
        </div>

        <div className="sidebar-footer">
          {wallet
            ? <div className="wallet-connected">
                <span className="wdot" />
                <span>{short(wallet)}</span>
              </div>
            : <button className="btn-connect" onClick={handleConnect}>CONNECT WALLET</button>
          }
          <a
            className="contract-link"
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank" rel="noreferrer"
          >CONTRACT ↗</a>
        </div>
      </aside>

      {/* ── Main panel ── */}
      <main className="main">
        {/* Toast */}
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.msg}</span>
            {toast.hash && (
              <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
                target="_blank" rel="noreferrer" className="toast-link">
                VIEW TX ↗
              </a>
            )}
          </div>
        )}

        {/* Create */}
        {tab === 'create' && (
          <div className="panel-wrap">
            <div className="panel-title">PLACE A BET</div>
            <CreateForm wallet={wallet} onCreated={handleCreated} />
          </div>
        )}

        {/* Feed */}
        {tab === 'feed' && (
          <div className="panel-wrap">
            <div className="panel-title-row">
              <div className="panel-title">OPEN BETS</div>
              <button className="btn-refresh" onClick={() => getBetCount().then(c => { setBetCount(c); loadRecent(c) })}>
                ↻ REFRESH
              </button>
            </div>
            {loadingFeed
              ? <div className="skeleton-list">{[1,2,3].map(i => <div key={i} className="skeleton-card" />)}</div>
              : recentBets.length === 0
                ? <div className="empty">No bets yet. Be the first to post one.</div>
                : recentBets.map(b => (
                    <BetCard key={b.id?.toString()} bet={b} wallet={wallet} onAction={handleAction} />
                  ))
            }
          </div>
        )}

        {/* Lookup */}
        {tab === 'lookup' && (
          <div className="panel-wrap">
            <div className="panel-title">LOOK UP BET BY ID</div>
            <LookupPanel wallet={wallet} onAction={handleAction} />
          </div>
        )}
      </main>
    </div>
  )
}
