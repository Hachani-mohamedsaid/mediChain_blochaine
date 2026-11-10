import { BrowserProvider, Contract, type Eip1193Provider } from 'ethers'
import mediChainAbi from '../abi/MediChain.abi.json'
import doctorAbi from '../abi/MediChainDoctor.abi.json'
import nftAbi from '../abi/MedicalRecordNFT.abi.json'
import accessNftAbi from '../abi/AccessGrantNFT.abi.json'
import payAbi from '../abi/MediChainPay.abi.json'
import identityAbi from '../abi/MediChainIdentity.abi.json'
import licenseAbi from '../abi/DoctorLicenseNFT.abi.json'
import pharmacyAbi from '../abi/MediChainPharmacy.abi.json'
import tokenAbi from '../abi/MediChainToken.abi.json'
import supplyAbi from '../abi/MediChainSupply.abi.json'
import addresses from '../abi/addresses.json'

export const HARDHAT_CHAIN_ID = 31337
export const HARDHAT_CHAIN_ID_HEX = '0x7a69'

type AddrJson = typeof addresses & {
  MediChainPay?: string
  MediChainIdentity?: string
  DoctorLicenseNFT?: string
  AccessGrantNFT?: string
  MediChainPharmacy?: string
  MediChainToken?: string
  MediChainSupply?: string
}

export const CHAIN = {
  MediChain: addresses.MediChain as string,
  MediChainDoctor: (addresses as AddrJson).MediChainDoctor as string,
  MedicalRecordNFT: addresses.MedicalRecordNFT as string,
  AccessGrantNFT: (addresses as AddrJson).AccessGrantNFT as string | undefined,
  MediChainPay: (addresses as AddrJson).MediChainPay as string | undefined,
  MediChainIdentity: (addresses as AddrJson).MediChainIdentity as
    | string
    | undefined,
  DoctorLicenseNFT: (addresses as AddrJson).DoctorLicenseNFT as
    | string
    | undefined,
  MediChainPharmacy: (addresses as AddrJson).MediChainPharmacy as
    | string
    | undefined,
  MediChainToken: (addresses as AddrJson).MediChainToken as string | undefined,
  /** Dernier déploiement supply — gas + adresse à jour (évite cache Vite JSON) */
  MediChainSupply:
    ((addresses as AddrJson).MediChainSupply as string | undefined) ||
    '0x09635F643e140090A9A8Dcd712eD6285858ceBef',
  chainId: Number(addresses.chainId),
}

/** Gas large : MetaMask + Hardhat marque « échouée » si gasUsed === gasLimit */
export const LOCAL_TX_GAS_LIMIT = 500_000n
/** Mint NFT (écriture URI + ERC721) — plus gourmand */
export const NFT_MINT_GAS_LIMIT = 2_500_000n

/** Legacy gasPrice — MetaMask sur Hardhat affiche parfois « échouée » sur les tx EIP-1559 (type 2) même si status=1 */
export const HARDHAT_GAS_PRICE = 1_000_000_000n // 1 gwei

export type LocalTxOverrides = {
  gasLimit: bigint
  gasPrice: bigint
  type: 0
}

/** Overrides tx locales Hardhat (Commander / Livrer / payer MCT·ETH) */
export function localTxOverrides(
  gasLimit: bigint = LOCAL_TX_GAS_LIMIT,
): LocalTxOverrides {
  return {
    gasLimit,
    gasPrice: HARDHAT_GAS_PRICE,
    type: 0,
  }
}

/** @deprecated use localTxOverrides */
export function supplyTxOverrides(): LocalTxOverrides {
  return localTxOverrides()
}

export function getEthereum(): Eip1193Provider | undefined {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum
  return eth
}

export async function ensureHardhatNetwork(ethereum: Eip1193Provider) {
  const current = await ethereum.request({ method: 'eth_chainId' })
  if (current === HARDHAT_CHAIN_ID_HEX) return
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
    })
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code
    if (code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: HARDHAT_CHAIN_ID_HEX,
            chainName: 'Hardhat Local',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['http://127.0.0.1:8545'],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

export async function getBrowserProvider() {
  const ethereum = getEthereum()
  if (!ethereum) throw new Error('Wallet introuvable')
  await ensureHardhatNetwork(ethereum)
  return new BrowserProvider(ethereum)
}

export async function getContracts() {
  const provider = await getBrowserProvider()
  const signer = await provider.getSigner()
  const mediChain = new Contract(CHAIN.MediChain, mediChainAbi, signer)
  const doctor = new Contract(CHAIN.MediChainDoctor, doctorAbi, signer)
  const nft = new Contract(CHAIN.MedicalRecordNFT, nftAbi, signer)
  const accessNft = CHAIN.AccessGrantNFT
    ? new Contract(CHAIN.AccessGrantNFT, accessNftAbi, signer)
    : null
  const pay = CHAIN.MediChainPay
    ? new Contract(CHAIN.MediChainPay, payAbi, signer)
    : null
  const identity = CHAIN.MediChainIdentity
    ? new Contract(CHAIN.MediChainIdentity, identityAbi, signer)
    : null
  const license = CHAIN.DoctorLicenseNFT
    ? new Contract(CHAIN.DoctorLicenseNFT, licenseAbi, signer)
    : null
  const pharmacy = CHAIN.MediChainPharmacy
    ? new Contract(CHAIN.MediChainPharmacy, pharmacyAbi, signer)
    : null
  const token = CHAIN.MediChainToken
    ? new Contract(CHAIN.MediChainToken, tokenAbi, signer)
    : null
  const supply = CHAIN.MediChainSupply
    ? new Contract(CHAIN.MediChainSupply, supplyAbi, signer)
    : null
  return {
    provider,
    signer,
    mediChain,
    doctor,
    nft,
    accessNft,
    pay,
    identity,
    license,
    pharmacy,
    token,
    supply,
    address: await signer.getAddress(),
  }
}

export function accessNftMetadataUri(input: {
  title: string
  contentHash: string
  recordId: string
}) {
  return nftMetadataUri({
    ...input,
    title: input.title.startsWith('Accès')
      ? input.title
      : `Accès · ${input.title}`,
  })
}

export function nftMetadataUri(input: {
  title: string
  contentHash: string
  recordId: string
}) {
  // URI courte : stockée on-chain dans mintForPatient — un gros SVG fait out-of-gas
  const name = `MediChain · ${(input.title || 'Document').slice(0, 48)}`
  const json = JSON.stringify({
    name,
    description: 'Certificat soulbound MediChain',
    contentHash: input.contentHash.slice(0, 66),
    recordId: input.recordId.slice(0, 36),
  })
  return `data:application/json,${encodeURIComponent(json)}`
}
