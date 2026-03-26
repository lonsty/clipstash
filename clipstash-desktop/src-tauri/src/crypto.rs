// ClipStash Desktop - Crypto utilities (gzip + AES-256-GCM)
// Mirrors shared/crypto.js — sync data format: base64(encrypt(gzip(json)))

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use std::io::{Read, Write};

/// Gzip-compress a byte slice.
pub fn gzip_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("gzip compress write error: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("gzip compress finish error: {}", e))
}

/// Gzip-decompress a byte slice back to the original data.
pub fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("gzip decompress error: {}", e))?;
    Ok(out)
}

/// Derive an AES-256 key from a passphrase using PBKDF2-HMAC-SHA256.
/// Uses a deterministic salt derived from the passphrase itself (SHA-256 of
/// "ClipStash-salt:{passphrase}" truncated to 16 bytes) so the same passphrase
/// always produces the same key across devices.
/// This matches the JS implementation in shared/crypto.js.
fn derive_key(passphrase: &str) -> [u8; 32] {
    // Deterministic salt: SHA-256("ClipStash-salt:" + passphrase)[0..16]
    use sha2::Digest;
    let salt_input = format!("ClipStash-salt:{}", passphrase);
    let salt_hash = Sha256::digest(salt_input.as_bytes());
    let salt = &salt_hash[..16];

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, 100_000, &mut key);
    key
}

/// Encrypt data using AES-256-GCM.
/// Output format: iv (12 bytes) || ciphertext+tag
/// Compatible with shared/crypto.js encrypt().
pub fn encrypt(data: &[u8], passphrase: &str) -> Result<Vec<u8>, String> {
    let key = derive_key(passphrase);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init error: {}", e))?;

    // Random 12-byte IV
    let iv_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&iv_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| format!("AES encrypt error: {}", e))?;

    // Prepend IV to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&iv_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt AES-256-GCM encrypted data.
/// Input format: iv (12 bytes) || ciphertext+tag
/// Compatible with shared/crypto.js decrypt().
pub fn decrypt(data: &[u8], passphrase: &str) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("Encrypted data too short (missing IV)".to_string());
    }

    let key = derive_key(passphrase);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key init error: {}", e))?;

    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("AES decrypt error: {}", e))
}

/// Pack sync data: gzip → encrypt → base64.
/// Output is a base64 string suitable for storing in a Gist file.
pub fn pack_sync_data(json_str: &str, passphrase: &str) -> Result<String, String> {
    let compressed = gzip_compress(json_str.as_bytes())?;
    let encrypted = encrypt(&compressed, passphrase)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
}

/// Unpack sync data: base64 → decrypt → gunzip.
/// Input is a base64 string from a Gist file.
pub fn unpack_sync_data(b64: &str, passphrase: &str) -> Result<String, String> {
    let encrypted = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64 decode error: {}", e))?;
    let compressed = decrypt(&encrypted, passphrase)?;
    let decompressed = gzip_decompress(&compressed)?;
    String::from_utf8(decompressed).map_err(|e| format!("UTF-8 decode error: {}", e))
}

/// Encrypt a token for storage.
/// Uses a fixed app-level key derived from a built-in secret + optional user passphrase.
pub fn encrypt_token(token: &str, passphrase: &str) -> Result<String, String> {
    let key = if passphrase.is_empty() {
        "ClipStash-default-token-key"
    } else {
        passphrase
    };
    let encrypted = encrypt(token.as_bytes(), key)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
}

/// Decrypt a stored encrypted token.
pub fn decrypt_token(encrypted_b64: &str, passphrase: &str) -> Result<String, String> {
    let key = if passphrase.is_empty() {
        "ClipStash-default-token-key"
    } else {
        passphrase
    };
    let encrypted = base64::engine::general_purpose::STANDARD
        .decode(encrypted_b64)
        .map_err(|e| format!("base64 decode error: {}", e))?;
    let decrypted = decrypt(&encrypted, key)?;
    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 decode error: {}", e))
}
