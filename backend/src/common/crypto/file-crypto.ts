import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const MAGIC = Buffer.from('MCENC1'); // MediChain encrypted v1

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'medichain-file-v1', 32);
}

/** Chiffre un buffer (AES-256-GCM). Format: MAGIC | iv | tag | ciphertext */
export function encryptBuffer(plain: Buffer, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

export function isEncryptedBuffer(data: Buffer): boolean {
  return data.length > MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Déchiffre si format MCENC1, sinon renvoie tel quel (fichiers legacy). */
export function decryptBuffer(data: Buffer, secret: string): Buffer {
  if (!isEncryptedBuffer(data)) return data;
  const key = deriveKey(secret);
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = data.subarray(
    MAGIC.length + IV_LEN,
    MAGIC.length + IV_LEN + TAG_LEN,
  );
  const ciphertext = data.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** CID démo (content-addressing) dérivé du hash keccak — pas un vrai IPFS pin. */
export function demoCidFromHash(contentHash: string): string {
  const h = contentHash.replace(/^0x/i, '').toLowerCase();
  return `ipfs://bafy${h.slice(0, 44)}`;
}
