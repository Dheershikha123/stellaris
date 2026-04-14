# ChainBet

Trustless peer-to-peer betting on the Stellar blockchain. Lock XLM into a Soroban smart contract. A named oracle resolves the outcome. Winner collects the entire pot. No middleman.

## Live Links

| | |
|---|---|
| **Frontend** | `https://chainbet-app.vercel.app` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CAZ5TNL5W24OODBFG3V4KVFPTGMHMFWHTAGLNZBBU27CUEEYJNN7BYNY` |

## How It Works

1. **Creator** posts a bet — describes the event, sets both stakes, names an oracle address
2. **Taker** accepts by locking in the counterparty stake
3. **Oracle** calls `resolve_bet` and names the winner — funds transfer instantly
4. Creator can **cancel** any open bet before it's accepted for a full refund

## Why This Project Matters

This project turns a familiar real-world workflow into a verifiable on-chain primitive on Stellar: transparent state transitions, user-authenticated actions, and deterministic outcomes.

## Architecture

- **Smart Contract Layer**: Soroban contract enforces business rules, authorization, and state transitions.
- **Client Layer**: React + Vite frontend handles wallet UX, transaction composition, and real-time status views.
- **Wallet/Auth Layer**: Freighter signs every state-changing action so operations are attributable and non-repudiable.
- **Infra Layer**: Stellar Testnet + Soroban RPC for execution; Vercel for frontend hosting.
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



