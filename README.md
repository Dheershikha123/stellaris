# ChainBet

Trustless peer-to-peer betting on the Stellar blockchain. Lock XLM into a Soroban smart contract. A named oracle resolves the outcome. Winner collects the entire pot. No middleman.

## Live Links

| | |
|---|---|
| **Frontend** | `https://chainbet.bice.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/chainbet` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CAVC3AOBBPLXE2LUXZBWAB3R3DYITFNB2LG7WHGX3HOCGQL3UETSHWWC` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

## How It Works

1. **Creator** posts a bet — describes the event, sets both stakes, names an oracle address
2. **Taker** accepts by locking in the counterparty stake
3. **Oracle** calls `resolve_bet` and names the winner — funds transfer instantly
4. Creator can **cancel** any open bet before it's accepted for a full refund

## Contract Functions

```rust
create_bet(creator, oracle, description, creator_stake, counterparty_stake, xlm_token) -> u64
accept_bet(counterparty, bet_id, xlm_token)
resolve_bet(bet_id, winner, xlm_token)   // oracle-only
cancel_bet(bet_id, xlm_token)            // creator-only, before match
get_bet(bet_id) -> Bet
count() -> u64
```

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter v1.7.1 |
| Hosting | Vercel |
