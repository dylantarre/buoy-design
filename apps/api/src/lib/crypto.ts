/**
 * Encryption Utilities
 *
 * AES-256-GCM encryption for sensitive data (tokens, secrets)
 * Uses Web Crypto API (available in Cloudflare Workers)
 */

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - The string to encrypt
 * @param key - 32+ character encryption key (ENCRYPTION_KEY secret)
 * @returns Base64-encoded ciphertext (includes IV)
 */
export async function encrypt(plaintext: string, key: string): Promise<string> {
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Use first 32 bytes of key (256 bits)
  const keyBytes = new TextEncoder().encode(key).slice(0, 32);

  // Import key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['encrypt']
  );

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Base64 encode
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * @param encrypted - Base64-encoded ciphertext (from encrypt())
 * @param key - Same encryption key used for encryption
 * @returns Decrypted plaintext string
 */
export async function decrypt(encrypted: string, key: string): Promise<string> {
  // Base64 decode
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Use first 32 bytes of key (256 bits)
  const keyBytes = new TextEncoder().encode(key).slice(0, 32);

  // Import key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['decrypt']
  );

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Generate a stable hash for drift signal comparison
 *
 * @param parts - Array of strings to hash together
 * @returns 16-character base64 hash
 */
export async function signalHash(...parts: (string | undefined)[]): Promise<string> {
  const input = parts.filter(Boolean).join('|');
  const data = new TextEncoder().encode(input);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to base64 and take first 16 chars
  return btoa(String.fromCharCode(...hashArray)).slice(0, 16);
}
