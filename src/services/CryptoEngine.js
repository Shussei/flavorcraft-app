// Client-Side WebCrypto AES-GCM 256-Bit Encryption Engine

class CryptoEngine {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  // Derive AES-GCM Key from passphrase using PBKDF2
  async deriveKey(passphrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt text string into encrypted JSON payload
  async encrypt(text, passphrase = 'vault-secret-key-1314') {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await this.deriveKey(passphrase, salt);

      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        this.encoder.encode(text)
      );

      const payload = {
        s: this.bufferToBase64(salt),
        i: this.bufferToBase64(iv),
        d: this.bufferToBase64(new Uint8Array(encryptedBuffer))
      };

      return JSON.stringify(payload);
    } catch (err) {
      console.error('Encryption error:', err);
      return text;
    }
  }

  // Decrypt encrypted payload back to string
  async decrypt(encryptedJson, passphrase = 'vault-secret-key-1314') {
    try {
      if (!encryptedJson.startsWith('{')) return encryptedJson; // Plain text fallback
      const payload = JSON.parse(encryptedJson);
      if (!payload.s || !payload.i || !payload.d) return encryptedJson;

      const salt = this.base64ToBuffer(payload.s);
      const iv = this.base64ToBuffer(payload.i);
      const data = this.base64ToBuffer(payload.d);

      const key = await this.deriveKey(passphrase, salt);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      return this.decoder.decode(decryptedBuffer);
    } catch (err) {
      // Return original or masked text if passphrase fails
      return encryptedJson;
    }
  }

  bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const cryptoEngine = new CryptoEngine();
