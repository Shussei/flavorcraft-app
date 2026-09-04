const PASSPHRASE = 'vault-secret-key-1314';
const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    typeof password === 'string' ? new TextEncoder().encode(password) : password,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/*
 * Modern payloads scope the key to the pair code (both devices know it),
 * so different rooms cannot decrypt each other. Legacy payloads from the
 * old project used a per-message salt and remain decryptable for
 * compatibility.
 */
class CryptoEngine {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.sessionKey = null;
    this.pairCode = null;
  }

  async setPairCode(pairCode) {
    this.pairCode = String(pairCode || '').trim();
    this.sessionKey = null;
  }

  async getSessionKey() {
    if (this.sessionKey) {
      return this.sessionKey;
    }

    const secret = `comms:${this.pairCode || 'default'}`;
    const salt = this.encoder.encode(secret);
    this.sessionKey = await deriveKey(`${PASSPHRASE}:${this.pairCode || 'default'}`, salt);
    return this.sessionKey;
  }

  async deriveLegacyKey(salt) {
    return deriveKey(PASSPHRASE, salt);
  }

  async encryptText(text) {
    try {
      const key = await this.getSessionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        this.encoder.encode(text)
      );

      return JSON.stringify({
        v: 2,
        i: bufferToBase64(iv),
        d: bufferToBase64(new Uint8Array(data))
      });
    } catch (error) {
      console.error('[CryptoEngine] Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  async decryptText(encryptedPayload) {
    if (typeof encryptedPayload !== 'string') {
      throw new Error('Invalid encrypted payload');
    }

    let payload;
    try {
      payload = JSON.parse(encryptedPayload);
    } catch {
      throw new Error('Invalid encrypted payload');
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid encrypted payload');
    }

    if (payload.v === 2 && payload.i && payload.d) {
      try {
        const key = await this.getSessionKey();
        const data = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64ToBuffer(payload.i) },
          key,
          base64ToBuffer(payload.d)
        );
        return this.decoder.decode(data);
      } catch {
        throw new Error('Unable to decrypt message');
      }
    }

    if (payload.s && payload.i && payload.d) {
      try {
        const key = await this.deriveLegacyKey(base64ToBuffer(payload.s));
        const data = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64ToBuffer(payload.i) },
          key,
          base64ToBuffer(payload.d)
        );
        return this.decoder.decode(data);
      } catch {
        throw new Error('Unable to decrypt message');
      }
    }

    throw new Error('Invalid encrypted payload');
  }

  async encryptBytes(bytes) {
    const key = await this.getSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { data, iv: bufferToBase64(iv) };
  }

  async decryptBytes(encrypted, ivBase64) {
    const key = await this.getSessionKey();
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(ivBase64) },
      key,
      encrypted
    );
  }
}

export const cryptoEngine = new CryptoEngine();