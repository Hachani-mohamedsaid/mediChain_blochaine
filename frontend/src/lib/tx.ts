import type { ContractTransactionResponse, TransactionReceipt } from 'ethers'
import {
  localTxOverrides,
  type LocalTxOverrides,
} from './chain'

export function formatTxError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (
      e as { response?: { data?: { message?: string | string[] } } }
    ).response?.data
    const msg = data?.message
    if (Array.isArray(msg)) return msg.join(', ')
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  if (e && typeof e === 'object' && 'shortMessage' in e) {
    const s = String((e as { shortMessage?: string }).shortMessage ?? '')
    if (s) return s
  }
  if (e && typeof e === 'object' && 'reason' in e) {
    const r = (e as { reason?: string }).reason
    if (r) return String(r)
  }
  if (e instanceof Error && e.message) {
    // Ethers / MetaMask user reject
    if (/user rejected|ACTION_REJECTED|denied/i.test(e.message)) {
      return 'Transaction annulée dans MetaMask.'
    }
    return e.message
  }
  return fallback
}

export function okMessage(text: string): string {
  return text
}

type TxLike = {
  hash: string
  wait: () => Promise<TransactionReceipt | null>
}

/**
 * Envoie une tx avec gas legacy Hardhat, attend le receipt.
 * Si MetaMask « échoue » mais `verifyOk` dit vrai → succès quand même.
 */
export async function sendLocalTx(
  send: (overrides: LocalTxOverrides) => Promise<TxLike | ContractTransactionResponse>,
  opts?: {
    gasLimit?: bigint
    /** Retourne true si l’effet on-chain est déjà là (faux négatif MetaMask) */
    verifyOk?: () => Promise<boolean>
  },
): Promise<{ hash: string; status: number }> {
  const overrides = localTxOverrides(opts?.gasLimit)
  try {
    const tx = await send(overrides)
    const receipt = await tx.wait()
    if (receipt && receipt.status === 0) {
      throw new Error('Transaction rejetée on-chain')
    }
    return {
      hash: String(receipt?.hash ?? tx.hash),
      status: Number(receipt?.status ?? 1),
    }
  } catch (e) {
    if (opts?.verifyOk) {
      try {
        if (await opts.verifyOk()) {
          return { hash: 'on-chain-ok', status: 1 }
        }
      } catch {
        /* ignore verify errors */
      }
    }
    throw e
  }
}
