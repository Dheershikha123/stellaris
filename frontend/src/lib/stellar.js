import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, requestAccess, getAddress, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID || '').trim()
const XLM_TOKEN   = (import.meta.env.VITE_XLM_TOKEN || '').trim()
const NET         = (import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015').trim()
const RPC_URL     = (import.meta.env.VITE_SOROBAN_RPC_URL    || 'https://soroban-testnet.stellar.org').trim()
const DUMMY_ADDR  = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

// ── Wallet ─────────────────────────────────────────────────────────────────
export async function connectWallet() {
  const { isConnected: connected } = await isConnected()
  if (!connected) throw new Error('Freighter not installed.')
  const { address, error } = await requestAccess()
  if (error) throw new Error(error)
  return address
}

// ── TX helpers ─────────────────────────────────────────────────────────────
async function buildAndSend(publicKey, operations) {
  const account = await rpc.getAccount(publicKey)
  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NET,
  })
  operations.forEach(op => builder.addOperation(op))
  const tx = builder.setTimeout(60).build()

  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)

  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const result = await signTransaction(prepared.toXDR(), { networkPassphrase: NET })
  if (result.error) throw new Error(result.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(result.signedTxXdr, NET)

  const sent = await rpc.sendTransaction(signed)
  return await pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error('Transaction timed out after 60s')
}

// ── approve XLM spend ──────────────────────────────────────────────────────
async function approveXlm(publicKey, amountXlm) {
  const stroops = BigInt(Math.ceil(amountXlm * 10_000_000))
  const xlm = new StellarSdk.Contract(XLM_TOKEN)
  return buildAndSend(publicKey, [
    xlm.call(
      'approve',
      StellarSdk.Address.fromString(publicKey).toScVal(),
      StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
      new StellarSdk.XdrLargeInt('i128', stroops).toI128(),
      StellarSdk.xdr.ScVal.scvU32(3_110_400),
    )
  ])
}

// ── create_bet ─────────────────────────────────────────────────────────────
export async function createBet(creator, oracle, description, creatorXlm, counterpartyXlm) {
  const cStake = BigInt(Math.ceil(creatorXlm * 10_000_000))
  const cpStake = BigInt(Math.ceil(counterpartyXlm * 10_000_000))
  await approveXlm(creator, creatorXlm)

  const account = await rpc.getAccount(creator)
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const tx = new StellarSdk.TransactionBuilder(account, { fee: StellarSdk.BASE_FEE, networkPassphrase: NET })
    .addOperation(tc.call('create_bet',
      StellarSdk.Address.fromString(creator).toScVal(),
      StellarSdk.Address.fromString(oracle).toScVal(),
      StellarSdk.xdr.ScVal.scvString(description),
      new StellarSdk.XdrLargeInt('i128', cStake).toI128(),
      new StellarSdk.XdrLargeInt('i128', cpStake).toI128(),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    ))
    .setTimeout(60).build()

  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const txSign = await signTransaction(prepared.toXDR(), { networkPassphrase: NET })
  if (txSign.error) throw new Error(txSign.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(txSign.signedTxXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  const finalHash = await pollTx(sent.hash)

  // Extract returned bet ID from result
  const txResult = await rpc.getTransaction(finalHash)
  let betId = null
  if (txResult.resultMetaXdr) {
    try {
      const meta = StellarSdk.xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, 'base64')
      const retVal = meta.v3().sorobanMeta().returnValue()
      betId = StellarSdk.scValToNative(retVal)
    } catch {}
  }
  return { txHash: finalHash, betId: betId ? betId.toString() : null }
}

// ── accept_bet ─────────────────────────────────────────────────────────────
export async function acceptBet(counterparty, betId, counterpartyXlm) {
  await approveXlm(counterparty, counterpartyXlm)
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const hash = await buildAndSend(counterparty, [
    tc.call('accept_bet',
      StellarSdk.Address.fromString(counterparty).toScVal(),
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(betId))),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  return hash
}

// ── resolve_bet ────────────────────────────────────────────────────────────
export async function resolveBet(oracle, betId, winnerAddress) {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const hash = await buildAndSend(oracle, [
    tc.call('resolve_bet',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(betId))),
      StellarSdk.Address.fromString(winnerAddress).toScVal(),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  return hash
}

// ── cancel_bet ─────────────────────────────────────────────────────────────
export async function cancelBet(creator, betId) {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const hash = await buildAndSend(creator, [
    tc.call('cancel_bet',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(betId))),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  return hash
}

// ── get_bet ────────────────────────────────────────────────────────────────
export async function getBet(betId) {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const dummy = new StellarSdk.Account(DUMMY_ADDR, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, { fee: StellarSdk.BASE_FEE, networkPassphrase: NET })
    .addOperation(tc.call('get_bet',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(betId)))
    ))
    .setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

export async function getBetCount() {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const dummy = new StellarSdk.Account(DUMMY_ADDR, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, { fee: StellarSdk.BASE_FEE, networkPassphrase: NET })
    .addOperation(tc.call('count'))
    .setTimeout(30).build()
  try {
    const sim = await rpc.simulateTransaction(tx)
    return Number(StellarSdk.scValToNative(sim.result.retval))
  } catch { return 0 }
}

export { CONTRACT_ID, XLM_TOKEN }

