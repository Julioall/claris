/**
 * Session data encryption/decryption using AES-GCM via Web Crypto API.
 * Provides obfuscation of sensitive tokens stored in sessionStorage.
 * Falls back to base64 encoding if Web Crypto is unavailable.
 */

const PASSPHRASE = 'guia-tutor-session-key';
const SALT = new Uint8Array([103, 116, 115, 101, 99, 114, 101, 116, 107, 101, 121, 49, 50, 51, 52, 53]);

function isCryptoAvailable(): boolean {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  } catch {
    return false;
  }
}

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSessionData(data: unknown): Promise<string> {
  if (!isCryptoAvailable()) {
    return btoa(encodeURIComponent(JSON.stringify(data)));
  }
  try {
    const key = await deriveKey();
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(data))
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return 'enc:' + btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.warn('Encryption failed, using fallback:', err);
    return btoa(encodeURIComponent(JSON.stringify(data)));
  }
}

export async function decryptSessionData<T = unknown>(encoded: string): Promise<T | null> {
  try {
    if (!encoded.startsWith('enc:')) {
      // Fallback format (base64)
      return JSON.parse(decodeURIComponent(atob(encoded))) as T;
    }
    if (!isCryptoAvailable()) {
      return null;
    }
    const key = await deriveKey();
    const raw = Uint8Array.from(atob(encoded.slice(4)), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted)) as T;
  } catch {
    console.warn('Failed to decrypt session data, clearing storage');
    return null;
  }
}
