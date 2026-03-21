#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, token,
};

// ── Types ──────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum BetStatus {
    Open,       // waiting for counterparty
    Matched,    // both sides locked in
    Resolved,   // oracle has called it
    Cancelled,  // creator cancelled before match
}

#[contracttype]
#[derive(Clone)]
pub struct Bet {
    pub id: u64,
    pub creator: Address,
    pub counterparty: Option<Address>,
    pub oracle: Address,
    pub description: String,
    pub creator_stake: i128,
    pub counterparty_stake: i128,
    pub winner: Option<Address>,
    pub status: BetStatus,
    pub created_at: u64,
    pub resolved_at: u64,
}

#[contracttype]
pub enum DataKey {
    Bet(u64),
    Count,
}

#[contract]
pub struct ChainBetContract;

#[contractimpl]
impl ChainBetContract {
    /// Creator posts a bet, stakes XLM, names an oracle and counterparty stake amount
    pub fn create_bet(
        env: Env,
        creator: Address,
        oracle: Address,
        description: String,
        creator_stake: i128,
        counterparty_stake: i128,
        xlm_token: Address,
    ) -> u64 {
        creator.require_auth();
        assert!(creator_stake > 0, "Stake must be > 0");
        assert!(counterparty_stake > 0, "Counterparty stake must be > 0");
        assert!(description.len() <= 200, "Description too long");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&creator, &env.current_contract_address(), &creator_stake);

        let count: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let id = count + 1;

        let bet = Bet {
            id,
            creator: creator.clone(),
            counterparty: None,
            oracle,
            description,
            creator_stake,
            counterparty_stake,
            winner: None,
            status: BetStatus::Open,
            created_at: env.ledger().timestamp(),
            resolved_at: 0,
        };

        env.storage().persistent().set(&DataKey::Bet(id), &bet);
        env.storage().instance().set(&DataKey::Count, &id);
        env.events().publish((symbol_short!("created"),), (id, creator, creator_stake));
        id
    }

    /// Anyone accepts an open bet by matching the required counterparty stake
    pub fn accept_bet(
        env: Env,
        counterparty: Address,
        bet_id: u64,
        xlm_token: Address,
    ) {
        counterparty.require_auth();

        let mut bet: Bet = env.storage().persistent()
            .get(&DataKey::Bet(bet_id)).expect("Bet not found");

        assert!(bet.status == BetStatus::Open, "Bet not open");
        assert!(bet.creator != counterparty, "Cannot bet against yourself");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(
            &counterparty,
            &env.current_contract_address(),
            &bet.counterparty_stake,
        );

        bet.counterparty = Some(counterparty.clone());
        bet.status = BetStatus::Matched;
        env.storage().persistent().set(&DataKey::Bet(bet_id), &bet);
        env.events().publish((symbol_short!("matched"),), (bet_id, counterparty));
    }

    /// Oracle resolves the bet — winner gets entire pot
    pub fn resolve_bet(
        env: Env,
        bet_id: u64,
        winner: Address,
        xlm_token: Address,
    ) {
        let mut bet: Bet = env.storage().persistent()
            .get(&DataKey::Bet(bet_id)).expect("Bet not found");

        assert!(bet.status == BetStatus::Matched, "Bet not matched yet");
        bet.oracle.require_auth();

        assert!(
            winner == bet.creator
                || winner == *bet.counterparty.as_ref().expect("No counterparty"),
            "Winner must be a participant"
        );

        let pot = bet.creator_stake + bet.counterparty_stake;
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&env.current_contract_address(), &winner, &pot);

        bet.winner = Some(winner.clone());
        bet.status = BetStatus::Resolved;
        bet.resolved_at = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Bet(bet_id), &bet);
        env.events().publish((symbol_short!("resolved"),), (bet_id, winner, pot));
    }

    /// Creator cancels before anyone accepts
    pub fn cancel_bet(env: Env, bet_id: u64, xlm_token: Address) {
        let mut bet: Bet = env.storage().persistent()
            .get(&DataKey::Bet(bet_id)).expect("Bet not found");

        bet.creator.require_auth();
        assert!(bet.status == BetStatus::Open, "Can only cancel open bets");

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(
            &env.current_contract_address(),
            &bet.creator,
            &bet.creator_stake,
        );

        bet.status = BetStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Bet(bet_id), &bet);
        env.events().publish((symbol_short!("canceld"),), (bet_id,));
    }

    pub fn get_bet(env: Env, bet_id: u64) -> Bet {
        env.storage().persistent().get(&DataKey::Bet(bet_id)).expect("Bet not found")
    }

    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
