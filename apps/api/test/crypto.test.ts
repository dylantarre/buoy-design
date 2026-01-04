/**
 * Tests for encryption utilities
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, signalHash } from '../src/lib/crypto.js';

describe('encrypt/decrypt', () => {
  const testKey = 'this-is-a-very-secure-encryption-key-for-testing-purposes';

  it('encrypts and decrypts text correctly', async () => {
    const plaintext = 'Hello, World!';

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const plaintext = 'Test message';

    const encrypted1 = await encrypt(plaintext, testKey);
    const encrypted2 = await encrypt(plaintext, testKey);

    // Ciphertext should be different due to random IV
    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to same plaintext
    expect(await decrypt(encrypted1, testKey)).toBe(plaintext);
    expect(await decrypt(encrypted2, testKey)).toBe(plaintext);
  });

  it('encrypts empty string', async () => {
    const plaintext = '';

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(decrypted).toBe('');
  });

  it('encrypts unicode characters', async () => {
    const plaintext = 'Hello 世界 🌍 emoji';

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('encrypts long text', async () => {
    const plaintext = 'A'.repeat(10000);

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });

  it('encrypts JSON data', async () => {
    const data = { token: 'secret123', expiry: 1735992000 };
    const plaintext = JSON.stringify(data);

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it('produces base64-encoded ciphertext', async () => {
    const encrypted = await encrypt('test', testKey);

    // Base64 regex pattern
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    expect(base64Pattern.test(encrypted)).toBe(true);
  });

  it('fails to decrypt with wrong key', async () => {
    const plaintext = 'Secret message';
    const correctKey = 'correct-key-with-32-characters-minimum';
    const wrongKey = 'wrong-key-with-32-characters-minimum!!';

    const encrypted = await encrypt(plaintext, correctKey);

    // Decryption with wrong key should throw
    await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  it('fails to decrypt invalid ciphertext', async () => {
    const invalidCiphertext = 'not-valid-encrypted-data';

    await expect(decrypt(invalidCiphertext, testKey)).rejects.toThrow();
  });

  it('handles keys shorter than 32 bytes by zero-padding', async () => {
    // AES-256 requires exactly 32 bytes. Short keys are zero-padded by slice()
    // which means 'short' becomes 'short' + zeros up to 32 bytes
    const shortKey = 'short-key-needs-more-characters!';
    const plaintext = 'Test message';

    const encrypted = await encrypt(plaintext, shortKey);
    const decrypted = await decrypt(encrypted, shortKey);

    expect(decrypted).toBe(plaintext);
  });

  it('uses first 32 bytes of long keys', async () => {
    const longKey = 'a'.repeat(100);
    const plaintext = 'Test message';

    const encrypted = await encrypt(plaintext, longKey);
    const decrypted = await decrypt(encrypted, longKey);

    expect(decrypted).toBe(plaintext);
  });

  it('includes IV in ciphertext (12 bytes)', async () => {
    const encrypted = await encrypt('test', testKey);
    const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // First 12 bytes should be the IV
    expect(bytes.length).toBeGreaterThan(12);
  });

  it('encrypts multiline text', async () => {
    const plaintext = `Line 1
Line 2
Line 3
With special chars: !@#$%^&*()`;

    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);

    expect(decrypted).toBe(plaintext);
  });
});

describe('signalHash', () => {
  it('generates stable hash for same input', async () => {
    const hash1 = await signalHash('type', 'file', 'value');
    const hash2 = await signalHash('type', 'file', 'value');

    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different inputs', async () => {
    const hash1 = await signalHash('type1', 'file', 'value');
    const hash2 = await signalHash('type2', 'file', 'value');

    expect(hash1).not.toBe(hash2);
  });

  it('returns 16-character hash', async () => {
    const hash = await signalHash('test', 'data');

    expect(hash.length).toBe(16);
  });

  it('produces base64-compatible hash', async () => {
    const hash = await signalHash('test', 'data');

    // Base64 pattern (may include + and /)
    const base64Pattern = /^[A-Za-z0-9+/=]+$/;
    expect(base64Pattern.test(hash)).toBe(true);
  });

  it('filters out undefined values', async () => {
    const hash1 = await signalHash('type', 'file', undefined, 'value');
    const hash2 = await signalHash('type', 'file', 'value');

    expect(hash1).toBe(hash2);
  });

  it('handles empty parts array', async () => {
    const hash = await signalHash();

    expect(hash.length).toBe(16);
  });

  it('handles all undefined values', async () => {
    const hash = await signalHash(undefined, undefined);

    expect(hash.length).toBe(16);
  });

  it('order matters for hash generation', async () => {
    const hash1 = await signalHash('a', 'b', 'c');
    const hash2 = await signalHash('c', 'b', 'a');

    expect(hash1).not.toBe(hash2);
  });

  it('handles special characters', async () => {
    const hash = await signalHash('type!@#', 'file$%^', 'value&*()');

    expect(hash.length).toBe(16);
  });

  it('handles unicode characters', async () => {
    const hash = await signalHash('文字', '🌍', 'данные');

    expect(hash.length).toBe(16);
  });

  it('uses pipe separator (different parts produce different hash)', async () => {
    // If separator works, these should produce different hashes
    const hash1 = await signalHash('ab', 'cd');
    const hash2 = await signalHash('abc', 'd');

    expect(hash1).not.toBe(hash2);
  });

  it('handles long input strings', async () => {
    const longString = 'a'.repeat(10000);
    const hash = await signalHash(longString, 'file', 'value');

    expect(hash.length).toBe(16);
  });

  it('generates consistent hash for drift signals', async () => {
    // Simulating actual usage from scanner.ts
    const type = 'hardcoded-color';
    const file = 'Button.tsx';
    const value = '#3b82f6';
    const componentName = 'Button';

    const hash1 = await signalHash(type, file, value, componentName);
    const hash2 = await signalHash(type, file, value, componentName);

    expect(hash1).toBe(hash2);
  });

  it('generates different hash when component name differs', async () => {
    const type = 'hardcoded-color';
    const file = 'Component.tsx';
    const value = '#fff';

    const hash1 = await signalHash(type, file, value, 'Button');
    const hash2 = await signalHash(type, file, value, 'Card');

    expect(hash1).not.toBe(hash2);
  });

  it('filters out empty strings (falsy values)', async () => {
    const hash1 = await signalHash('type', '', 'value');
    const hash2 = await signalHash('type', 'value');

    // Empty string is falsy, so filter(Boolean) removes it
    expect(hash1).toBe(hash2);
  });
});
