import { describe, expect, it } from 'vitest';
import {
  decryptBuffer,
  demoCidFromHash,
  encryptBuffer,
  isEncryptedBuffer,
} from './file-crypto.js';

describe('file-crypto', () => {
  const secret = 'test-secret-key';

  it('encrypts and decrypts round-trip', () => {
    const plain = Buffer.from('dossier médical confidentiel');
    const enc = encryptBuffer(plain, secret);
    expect(isEncryptedBuffer(enc)).toBe(true);
    expect(decryptBuffer(enc, secret).toString()).toBe(plain.toString());
  });

  it('passes through legacy plaintext', () => {
    const plain = Buffer.from('legacy');
    expect(decryptBuffer(plain, secret).equals(plain)).toBe(true);
  });

  it('builds demo cid from hash', () => {
    const cid = demoCidFromHash('0x' + 'ab'.repeat(32));
    expect(cid.startsWith('ipfs://bafy')).toBe(true);
  });
});
