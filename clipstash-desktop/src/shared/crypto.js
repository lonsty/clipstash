// ClipStash - Shared crypto utilities (gzip + AES-256-GCM)
// Used for v2 Gist data format: base64(encrypt(gzip(json)))

// ===== Gzip Compression =====

/**
 * gzipCompress compresses a UTF-8 string using gzip via CompressionStream API
 * @param {string} str - plain text to compress
 * @returns {Promise<Uint8Array>} compressed bytes
 */
export async function gzipCompress(str) {
  const encoder = new TextEncoder();
  const input = encoder.encode(str);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();

  const chunks = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

/**
 * gzipDecompress decompresses gzip bytes back to a UTF-8 string
 * @param {Uint8Array} compressed - gzip-compressed bytes
 * @returns {Promise<string>} decompressed plain text
 */
export async function gzipDecompress(compressed) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();

  const chunks = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }

  const decoder = new TextDecoder();
  return decoder.decode(result);
}

// ===== AES-256-GCM Encryption =====

/**
 * deriveKey derives an AES-256-GCM CryptoKey from a user passphrase using PBKDF2.
 * The salt is deterministic (derived from the passphrase itself via SHA-256)
 * so that the same passphrase always produces the same key across devices.
 * @param {string} passphrase - user's sync password
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Deterministic salt: SHA-256 of 'ClipStash-salt:' + passphrase
  const saltInput = encoder.encode(`ClipStash-salt:${passphrase}`);
  const saltHash = await crypto.subtle.digest('SHA-256', saltInput);
  const salt = new Uint8Array(saltHash).slice(0, 16);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * encrypt encrypts plaintext bytes using AES-256-GCM.
 * Output format: iv (12 bytes) || ciphertext+tag
 * @param {Uint8Array} data - plaintext bytes
 * @param {string} passphrase - user's sync password
 * @returns {Promise<Uint8Array>} encrypted bytes (iv + ciphertext)
 */
export async function encrypt(data, passphrase) {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result;
}

/**
 * decrypt decrypts AES-256-GCM encrypted bytes.
 * Input format: iv (12 bytes) || ciphertext+tag
 * @param {Uint8Array} data - encrypted bytes (iv + ciphertext)
 * @param {string} passphrase - user's sync password
 * @returns {Promise<Uint8Array>} decrypted plaintext bytes
 */
export async function decrypt(data, passphrase) {
  const key = await deriveKey(passphrase);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new Uint8Array(plaintext);
}

// ===== Base64 Utilities =====

/**
 * uint8ToBase64 converts a Uint8Array to a base64 string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * base64ToUint8 converts a base64 string to a Uint8Array
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ===== High-Level Pack/Unpack =====

/**
 * packSyncData compresses and encrypts sync JSON for upload.
 * Output: base64 string of encrypt(gzip(json))
 * @param {string} jsonStr - raw JSON string
 * @param {string} passphrase - user's sync password
 * @returns {Promise<string>} base64-encoded encrypted data
 */
export async function packSyncData(jsonStr, passphrase) {
  const compressed = await gzipCompress(jsonStr);
  const encrypted = await encrypt(compressed, passphrase);
  return uint8ToBase64(encrypted);
}

/**
 * unpackSyncData decrypts and decompresses sync data from Gist.
 * Input: base64 string of encrypt(gzip(json))
 * @param {string} b64 - base64-encoded encrypted data
 * @param {string} passphrase - user's sync password
 * @returns {Promise<string>} raw JSON string
 * @throws {Error} if decryption fails (wrong password) or data is corrupt
 */
export async function unpackSyncData(b64, passphrase) {
  const encrypted = base64ToUint8(b64);
  const compressed = await decrypt(encrypted, passphrase);
  return gzipDecompress(compressed);
}

// ===== Token Encryption =====

/**
 * encryptToken encrypts a short string (like a GitHub token) for storage.
 * Uses a fixed app-level key derived from a built-in secret + optional user passphrase.
 * @param {string} token - plaintext token
 * @param {string} [passphrase] - optional user sync password for extra security
 * @returns {Promise<string>} base64-encoded encrypted token
 */
export async function encryptToken(token, passphrase = '') {
  const key = passphrase || 'ClipStash-default-token-key';
  const encoder = new TextEncoder();
  const encrypted = await encrypt(encoder.encode(token), key);
  return uint8ToBase64(encrypted);
}

/**
 * decryptToken decrypts a stored encrypted token.
 * @param {string} encryptedB64 - base64-encoded encrypted token
 * @param {string} [passphrase] - optional user sync password
 * @returns {Promise<string>} plaintext token
 */
export async function decryptToken(encryptedB64, passphrase = '') {
  const key = passphrase || 'ClipStash-default-token-key';
  const encrypted = base64ToUint8(encryptedB64);
  const decrypted = await decrypt(encrypted, key);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
