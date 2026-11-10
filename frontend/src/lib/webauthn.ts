import { keccak256, toUtf8Bytes, hexlify } from 'ethers'

const LS_CRED = 'medichain_webauthn_cred'

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBuffer(s: string): ArrayBuffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function'
  )
}

export function loadStoredCredentialId(): string | null {
  try {
    return localStorage.getItem(LS_CRED)
  } catch {
    return null
  }
}

function saveCredentialId(id: string) {
  localStorage.setItem(LS_CRED, id)
}

export function clearStoredCredentialId() {
  localStorage.removeItem(LS_CRED)
}

/** keccak256 du credentialId WebAuthn → commitment on-chain */
export function credentialCommitment(credentialIdBase64Url: string): string {
  return keccak256(toUtf8Bytes(credentialIdBase64Url))
}

/**
 * Enregistre une empreinte / Face ID / Windows Hello (WebAuthn).
 * Retourne le commitment bytes32 à ancrer dans MediChainIdentity.
 */
export async function registerBiometric(userId: string, displayName: string) {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn indisponible sur ce navigateur / appareil.')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userIdBytes = new TextEncoder().encode(userId.slice(0, 64))

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'MediChain', id: window.location.hostname },
      user: {
        id: userIdBytes,
        name: displayName,
        displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null

  if (!cred) throw new Error('Empreinte annulée.')

  const credentialId = bufferToBase64Url(cred.rawId)
  saveCredentialId(credentialId)
  const commitment = credentialCommitment(credentialId)

  return {
    credentialId,
    commitment,
    rawIdHex: hexlify(new Uint8Array(cred.rawId)),
  }
}

/** Prouve la possession de l’empreinte déjà enregistrée. */
export async function verifyBiometric() {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn indisponible sur ce navigateur / appareil.')
  }
  const stored = loadStoredCredentialId()
  if (!stored) {
    throw new Error('Aucune empreinte locale — lie d’abord ton empreinte.')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      timeout: 60_000,
      userVerification: 'required',
      allowCredentials: [
        {
          type: 'public-key',
          id: base64UrlToBuffer(stored),
          transports: ['internal'],
        },
      ],
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw new Error('Vérification annulée.')
  return {
    credentialId: stored,
    commitment: credentialCommitment(stored),
  }
}
