import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, RefreshCw } from 'lucide-react';
import { cryptoEngine } from '../services/CryptoEngine';
import { resolveMediaObjectURL } from '../services/MediaService';

function computeStatus(msg) {
  if (msg.status === 'failed') return 'failed';
  if (msg.readAt) return 'read';
  if (msg.deliveredAt) return 'delivered';
  if (msg.databaseId || msg.status === 'sent') return 'sent';
  return 'sending';
}

const STATUS_LABELS = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send'
};

export default function MessageBubble({ msg, isMe, onRetry }) {
  const {
    id,
    type,
    text,
    encryptedPayload,
    media
  } = msg;

  const mediaPath = media?.path;
  const mediaIv = media?.iv;
  const mediaMimeType = media?.mimeType;

  const [decryptedText, setDecryptedText] = useState(null);
  const [mediaUrl, setMediaUrl] = useState(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (type === 'text') {
          if (!text && encryptedPayload) {
            const decrypted = await cryptoEngine.decryptText(encryptedPayload);
            if (!cancelled) {
              setDecryptedText(decrypted);
            }
          }
          return;
        }

        let payload = null;

        if (encryptedPayload) {
          payload = JSON.parse(await cryptoEngine.decryptText(encryptedPayload));
        }

        const path = payload?.mediaPath || mediaPath;
        const iv = payload?.mediaIv || mediaIv;
        const mimeType =
          payload?.mimeType || mediaMimeType || 'application/octet-stream';

        if (path && iv) {
          const url = await resolveMediaObjectURL({
            mediaPath: path,
            mediaIv: iv,
            mimeType
          });

          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }

          objectUrlRef.current = url;

          if (!cancelled) {
            setMediaUrl(url);
          }
        }
      } catch {
        if (!cancelled) {
          setMediaFailed(true);
        }
      }
    }

    load();

    return () => {
      cancelled = true;

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [id, type, text, encryptedPayload, mediaPath, mediaIv, mediaMimeType]);

  const displayText = text || decryptedText || '';
  const status = isMe ? computeStatus(msg) : null;
  const hasTimer = Boolean(msg.ttl && msg.ttl > 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        alignSelf: isMe ? 'flex-end' : 'flex-start'
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
          background: isMe
            ? 'linear-gradient(135deg,#ea580c,#c2410c)'
            : 'rgba(30,34,48,0.85)',
          border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: '0.925rem',
          lineHeight: 1.4,
          maxWidth: '100%'
        }}
      >
        {type === 'text' && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {displayText}
          </div>
        )}

        {type === 'image' && (
          <div>
            {mediaUrl ? (
              <img
                src={mediaUrl}
                alt="attachment"
                style={{
                  maxWidth: '260px',
                  maxHeight: '320px',
                  borderRadius: '12px',
                  display: 'block'
                }}
              />
            ) : mediaFailed ? (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                Unable to load image
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Loading image...
              </span>
            )}
          </div>
        )}

        {type === 'video' && (
          <div>
            {mediaUrl ? (
              <video
                controls
                preload="metadata"
                src={mediaUrl}
                style={{
                  maxWidth: '280px',
                  maxHeight: '340px',
                  borderRadius: '12px',
                  display: 'block'
                }}
              />
            ) : mediaFailed ? (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                Unable to load video
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Loading video...
              </span>
            )}
          </div>
        )}

        {type === 'voice' && (
          <div>
            {mediaUrl ? (
              <audio
                controls
                src={mediaUrl}
                style={{
                  width: '220px',
                  height: '36px',
                  display: 'block'
                }}
              />
            ) : mediaFailed ? (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                Unable to load voice note
              </span>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                Loading voice note...
              </span>
            )}
          </div>
        )}

        {hasTimer && (
          <div
            style={{
              fontSize: '0.65rem',
              color: isMe ? 'rgba(255,255,255,0.7)' : '#f97316',
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Clock size={10} />
            Disappears in {msg.ttl}s
          </div>
        )}
      </div>

      <span
        style={{
          fontSize: '0.7rem',
          color: '#64748b',
          marginTop: '4px',
          padding: '0 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        {msg.timestampLabel}

        {status && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontWeight: 600,
              color:
                status === 'read'
                  ? '#34d399'
                  : status === 'failed'
                    ? '#f87171'
                    : '#94a3b8'
            }}
            title={STATUS_LABELS[status]}
          >
            {status === 'sending' && <Clock size={11} />}
            {status === 'sent' && <Check size={11} />}
            {status === 'delivered' && <CheckCheck size={11} />}
            {status === 'read' && <CheckCheck size={11} />}

            {status === 'failed' ? (
              <button
                onClick={() => onRetry?.(msg)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: 'none',
                  border: 'none',
                  color: '#f87171',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={10} />
                Retry
              </button>
            ) : (
              STATUS_LABELS[status]
            )}
          </span>
        )}
      </span>
    </div>
  );
}