import { supabase } from './SupabaseClient';
import { cryptoEngine } from './CryptoEngine';

const BUCKET = 'vault-media';

const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/mpeg': '.mp3'
};

function extensionFor(mimeType) {
  return EXTENSIONS[mimeType] || '.bin';
}

export async function uploadEncryptedMedia({ roomId, clientMessageId, blob }) {
  const mimeType = blob.type || 'application/octet-stream';
  const path = `${roomId}/${clientMessageId}${extensionFor(mimeType)}`;

  const bytes = await blob.arrayBuffer();
  const encrypted = await cryptoEngine.encryptBytes(bytes);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, encrypted.data, {
      contentType: 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false
    });

  if (error) {
    throw new Error(error.message || 'Media upload failed');
  }

  return {
    path,
    mimeType,
    size: blob.size,
    iv: encrypted.iv
  };
}

export async function downloadEncryptedMedia({ mediaPath, mediaIv }) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(mediaPath);

  if (error) {
    throw new Error(error.message || 'Media download failed');
  }

  const bytes = await data.arrayBuffer();
  const decrypted = await cryptoEngine.decryptBytes(bytes, mediaIv);
  return decrypted;
}

export async function resolveMediaObjectURL({ mediaPath, mediaIv, mimeType }) {
  const decrypted = await downloadEncryptedMedia({ mediaPath, mediaIv });
  const blob = new Blob([decrypted], { type: mimeType });
  return URL.createObjectURL(blob);
}