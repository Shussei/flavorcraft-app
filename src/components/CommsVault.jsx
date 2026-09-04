import React, {
  useState,
  useEffect,
  useRef,
  useCallback
} from 'react';

import {
  Send,
  Phone,
  Video,
  Mic,
  Image as ImageIcon,
  Lock,
  Shield,
  Clock,
  Settings,
  Copy,
  Check,
  Trash2,
  X,
  Sparkles,
  Bell,
  BellOff,
  Volume2,
  VolumeX
} from 'lucide-react';

import MessageBubble from './MessageBubble';
import { cryptoEngine } from '../services/CryptoEngine';
import { callManager } from '../services/CallManager';
import { chatPersistence } from '../services/ChatPersistence';
import { notificationService } from '../services/NotificationService';
import { uploadEncryptedMedia } from '../services/MediaService';

const ONLINE_WINDOW_MS = 90000;
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const VIDEO_MAX_SIZE = 20 * 1024 * 1024;

export default function CommsVault({
  pairCode = 'PAIR-1314',
  setPairCode,
  onPanicLock,
  onStartVoiceCall,
  onStartVideoCall,
  secretPin,
  setSecretPin,
  decoyPin,
  setDecoyPin
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partnerName, setPartnerName] = useState('My Love');
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState(null);
  const [ephemeralTimer, setEphemeralTimer] = useState(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customPairInput, setCustomPairInput] = useState('');
  const [isResettingRoom, setIsResettingRoom] = useState(false);
  const [resetStatus, setResetStatus] = useState(null);

  const [notificationSettings, setNotificationSettings] = useState(
    () => notificationService.getSettings()
  );
  const [notificationPermission, setNotificationPermission] = useState(
    () => notificationService.getPermission()
  );
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);
  const messageIdsRef = useRef(new Set());
  const selfDestructTimersRef = useRef(new Map());
  const persistenceReadyRef = useRef(false);
  const ephemeralTimerRef = useRef(null);
  const notificationEnabledRef = useRef(notificationSettings.enabled);

  useEffect(() => {
    persistenceReadyRef.current = persistenceReady;
  }, [persistenceReady]);

  useEffect(() => {
    ephemeralTimerRef.current = ephemeralTimer;
  }, [ephemeralTimer]);

  useEffect(() => {
    notificationEnabledRef.current = notificationSettings.enabled;
  }, [notificationSettings.enabled]);

  const createClientMessageId = useCallback(() => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }, []);

  const formatTimestamp = useCallback((date = new Date()) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const calculateExpiry = useCallback((ttlSeconds) => {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return null;
    }

    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }, []);

  const storedToMessage = useCallback((stored) => {
    const isMe =
      Boolean(chatPersistence.user) &&
      stored.sender_id === chatPersistence.user.id;

    return {
      id: stored.client_message_id,
      databaseId: stored.id,
      sender: isMe ? 'me' : 'partner',
      senderId: stored.sender_id,
      type: stored.message_type,
      encryptedPayload: stored.encrypted_payload,
      media: stored.media_path
        ? {
            path: stored.media_path,
            mimeType: stored.media_mime_type || 'application/octet-stream',
            size: stored.media_size
          }
        : null,
      text: undefined,
      created: stored.created_at,
      timestampLabel: formatTimestamp(new Date(stored.created_at)),
      ttl: stored.ttl_seconds,
      expiresAt: stored.expires_at,
      deliveredAt: stored.delivered_at,
      readAt: stored.read_at
    };
  }, [formatTimestamp]);

  const scheduleSelfDestruct = useCallback((msg) => {
    if (!msg) {
      return;
    }

    // Only apply self-destruct to messages that actually have a TTL or expiration
    const hasExpiry = Boolean(msg.expiresAt || (Number.isFinite(msg.ttl) && msg.ttl > 0));
    if (!hasExpiry) {
      return;
    }

    let delay = null;

    if (msg.expiresAt) {
      delay = new Date(msg.expiresAt).getTime() - Date.now();
    } else if (Number.isFinite(msg.ttl) && msg.ttl > 0) {
      delay = msg.ttl * 1000;
    }

    if (delay <= 0) {
      setMessages((previous) =>
        previous.filter((message) => message.id !== msg.id)
      );

      messageIdsRef.current.delete(msg.id);

      return;
    }

    const existingTimer = selfDestructTimersRef.current.get(msg.id);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      setMessages((previous) =>
        previous.filter((message) => message.id !== msg.id)
      );

      messageIdsRef.current.delete(msg.id);

      selfDestructTimersRef.current.delete(msg.id);
    }, delay);

    selfDestructTimersRef.current.set(msg.id, timer);
  }, []);

  const onRealtimeInsert = useCallback(
    async (stored) => {
      if (!mountedRef.current) {
        return;
      }

      if (stored.sender_id === chatPersistence.user?.id) {
        return;
      }

      const clientMessageId = stored.client_message_id;

      if (messageIdsRef.current.has(clientMessageId)) {
        await chatPersistence.markDelivered(stored.id);
        await chatPersistence.markRead(stored.id);
        return;
      }

      try {
        const newMessage = storedToMessage(stored);

        if (!mountedRef.current) {
          return;
        }

        messageIdsRef.current.add(newMessage.id);

        setMessages((previous) => {
          if (previous.some((message) => message.id === newMessage.id)) {
            return previous;
          }

          return [...previous, newMessage];
        });

        scheduleSelfDestruct(newMessage);

        if (notificationEnabledRef.current) {
          notificationService.notifyChatActivity();
        }

        await chatPersistence.markDelivered(stored.id);
        await chatPersistence.markRead(stored.id);
      } catch (error) {
        console.error('[Comms] Realtime message processing failed:', error);
      }
    },
    [storedToMessage, scheduleSelfDestruct]
  );

  const onRealtimeUpdate = useCallback((stored) => {
    if (!mountedRef.current) {
      return;
    }

    setMessages((previous) =>
      previous.map((message) =>
        message.databaseId === stored.id
          ? {
              ...message,
              deliveredAt: stored.delivered_at,
              readAt: stored.read_at,
              expiresAt: stored.expires_at,
              ttl: stored.ttl_seconds
            }
          : message
      )
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    let cancelled = false;

    const initializePersistence = async () => {
      try {
        setPersistenceReady(false);
        setPersistenceError(null);

        await cryptoEngine.setPairCode(pairCode);
        await chatPersistence.joinRoom(pairCode);

        messageIdsRef.current = new Set();

        if (cancelled || !mountedRef.current) {
          return;
        }

        const storedMessages = await chatPersistence.loadMessages();

        if (cancelled || !mountedRef.current) {
          return;
        }

        const restoredMessages = [];

        for (const storedMessage of storedMessages) {
          try {
            const restored = storedToMessage(storedMessage);

            if (
              restored.expiresAt &&
              new Date(restored.expiresAt).getTime() <= Date.now()
            ) {
              continue;
            }

            restoredMessages.push(restored);

            messageIdsRef.current.add(restored.id);
          } catch (error) {
            console.error('[Comms] Failed to restore stored message:', error);
          }
        }

        setMessages(restoredMessages);

        restoredMessages.forEach(scheduleSelfDestruct);

        await chatPersistence.updateLastSeen();

        if (cancelled || !mountedRef.current) {
          return;
        }

        chatPersistence.subscribeToMessages(onRealtimeInsert, onRealtimeUpdate);

        setPersistenceReady(true);
      } catch (error) {
        console.error('[Comms] Encryption storage initialization failed:', error);

        if (cancelled || !mountedRef.current) {
          return;
        }

        setPersistenceReady(false);
        const rawErr = error?.message || 'Unable to initialize encrypted message storage';
        setPersistenceError(
          rawErr.toLowerCase().includes('full')
            ? 'Room is full. Tap the pair badge above to reset room or change code.'
            : rawErr
        );
      }
    };

    initializePersistence();

    const lastSeenTimer = window.setInterval(() => {
      chatPersistence.updateLastSeen();
    }, 20000);

    return () => {
      cancelled = true;
      mountedRef.current = false;

      window.clearInterval(lastSeenTimer);

      chatPersistence.cleanup();
    };
  }, [pairCode, onRealtimeInsert, onRealtimeUpdate, storedToMessage, scheduleSelfDestruct]);

  useEffect(() => {
    if (!persistenceReady) {
      return undefined;
    }

    let cancelled = false;

    const pollPartner = async () => {
      const partner = await chatPersistence.getPartner();

      if (cancelled || !mountedRef.current) {
        return;
      }

      if (!partner?.found) {
        setPartnerOnline(false);
        callManager.setPartnerPeerId(null);
        return;
      }

      const lastSeen = partner.last_seen_at
        ? new Date(partner.last_seen_at).getTime()
        : 0;

      const online =
        Boolean(partner.peer_id) && Date.now() - lastSeen < ONLINE_WINDOW_MS;

      setPartnerOnline(online);

      callManager.setPartnerPeerId(partner.peer_id || null);
    };

    callManager.init();

    pollPartner();

    const partnerTimer = window.setInterval(pollPartner, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(partnerTimer);
      callManager.cleanup();
    };
  }, [persistenceReady]);

  useEffect(() => {
    const selfDestructTimers = selfDestructTimersRef.current;

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Already stopped.
        }
      }

      selfDestructTimers.forEach((timer) => clearTimeout(timer));

      selfDestructTimers.clear();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const publishMessage = useCallback(
    async (spec) => {
      if (!persistenceReadyRef.current) {
        alert('Encrypted message storage is still initializing.');
        return;
      }

      const clientMessageId = createClientMessageId();
      const ttlSeconds = ephemeralTimerRef.current;
      const expiresAt = calculateExpiry(ttlSeconds);

      const optimisticMessage = {
        id: clientMessageId,
        sender: 'me',
        type: spec.type,
        text: spec.type === 'text' ? spec.text : undefined,
        blob: spec.blob,
        media: null,
        created: new Date().toISOString(),
        timestampLabel: formatTimestamp(),
        ttl: ttlSeconds,
        expiresAt,
        deliveredAt: null,
        readAt: null,
        status: 'sending'
      };

      messageIdsRef.current.add(clientMessageId);

      setMessages((previous) => [...previous, optimisticMessage]);

      try {
        let media = null;

        if (spec.blob) {
          media = await uploadEncryptedMedia({
            roomId: chatPersistence.roomId,
            clientMessageId,
            blob: spec.blob
          });
        }

        const content =
          spec.type === 'text'
            ? { text: spec.text }
            : { mediaPath: media.path, mediaIv: media.iv };

        const encryptedPayload = await cryptoEngine.encryptText(
          JSON.stringify(content)
        );

        const storedMessage = await chatPersistence.saveMessage({
          clientMessageId,
          messageType: spec.type,
          encryptedPayload,
          ttlSeconds,
          media
        });

        if (!mountedRef.current) {
          return;
        }

        setMessages((previous) =>
          previous.map((message) =>
            message.id === clientMessageId
              ? {
                  ...message,
                  databaseId: storedMessage.id,
                  encryptedPayload,
                  media: media || null,
                  blob: undefined,
                  status: 'sent'
                }
              : message
          )
        );

        scheduleSelfDestruct(optimisticMessage);
      } catch (error) {
        console.error('[Comms] Failed to store encrypted message:', error);

        if (!mountedRef.current) {
          return;
        }

        setMessages((previous) =>
          previous.map((message) =>
            message.id === clientMessageId
              ? { ...message, status: 'failed', error: error?.message }
              : message
          )
        );
      }
    },
    [calculateExpiry, createClientMessageId, formatTimestamp, scheduleSelfDestruct]
  );

  const retryMessage = useCallback(
    async (msg) => {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === msg.id
            ? { ...message, status: 'sending', error: undefined }
            : message
        )
      );

      try {
        let media = msg.media;

        if (msg.blob && !media) {
          media = await uploadEncryptedMedia({
            roomId: chatPersistence.roomId,
            clientMessageId: msg.id,
            blob: msg.blob
          });
        }

        const content =
          msg.type === 'text'
            ? { text: msg.text }
            : { mediaPath: media.path, mediaIv: media.iv };

        const encryptedPayload =
          msg.encryptedPayload ||
          (await cryptoEngine.encryptText(JSON.stringify(content)));

        const storedMessage = await chatPersistence.saveMessage({
          clientMessageId: msg.id,
          messageType: msg.type,
          encryptedPayload,
          ttlSeconds: msg.ttl,
          media
        });

        setMessages((previous) =>
          previous.map((message) =>
            message.id === msg.id
              ? {
                  ...message,
                  databaseId: storedMessage.id,
                  encryptedPayload,
                  media: media || null,
                  blob: undefined,
                  status: 'sent',
                  error: undefined
                }
              : message
          )
        );
      } catch (error) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === msg.id
              ? { ...message, status: 'failed', error: error?.message }
              : message
          )
        );
      }
    },
    []
  );

  const handleSendMessage = async (event) => {
    if (event) {
      event.preventDefault();
    }

    const rawText = inputText.trim();

    if (!rawText) {
      return;
    }

    setInputText('');

    publishMessage({ type: 'text', text: rawText });
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file) {
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      alert('Only image or video files are allowed.');
      return;
    }

    if (isImage && file.size > IMAGE_MAX_SIZE) {
      alert('Image must be smaller than 5 MB.');
      return;
    }

    if (isVideo && file.size > VIDEO_MAX_SIZE) {
      alert('Video must be smaller than 20 MB.');
      return;
    }

    if (!persistenceReadyRef.current) {
      alert('Encrypted message storage is still initializing.');
      return;
    }

    publishMessage({ type: isVideo ? 'video' : 'image', blob: file });
  };

  const startVoiceRecording = async () => {
    try {
      if (!persistenceReadyRef.current) {
        throw new Error('Encrypted message storage is not ready yet.');
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is unavailable.');
      }

      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Voice recording is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });

        if (mountedRef.current) {
          publishMessage({ type: 'voice', blob: audioBlob });
        }
      };

      recorder.start();

      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((previous) => previous + 1);
      }, 1000);
    } catch (error) {
      console.error('[Comms] Voice recording failed:', error);

      alert(error?.message || 'Microphone access is required.');
    }
  };

  const stopVoiceRecording = () => {
    if (
      mediaRecorderRef.current &&
      isRecordingVoice &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    setIsRecordingVoice(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const refreshNotificationSettings = useCallback(() => {
    setNotificationSettings(notificationService.getSettings());
    setNotificationPermission(notificationService.getPermission());
  }, []);

  const handleNotificationToggle = async () => {
    if (notificationBusy) {
      return;
    }

    setNotificationBusy(true);

    try {
      if (notificationSettings.enabled) {
        notificationService.disable();

        refreshNotificationSettings();

        return;
      }

      const enabled = await notificationService.enable();

      refreshNotificationSettings();

      if (!enabled) {
        alert(
          'Browser notifications are unavailable or permission was denied.'
        );
      }
    } finally {
      setNotificationBusy(false);
    }
  };

  const updateNotificationPreference = (key, value) => {
    const updated = notificationService.updateSettings({ [key]: value });

    setNotificationSettings(updated);
  };

  const handlePushToggle = async () => {
    if (pushBusy) {
      return;
    }

    setPushBusy(true);

    try {
      if (notificationSettings.push) {
        await notificationService.disablePush();

        notificationService.updateSettings({ push: false });
      } else {
        if (!notificationSettings.enabled) {
          const enabled = await notificationService.enable();

          if (!enabled) {
            alert('Enable browser notifications first.');

            refreshNotificationSettings();

            return;
          }
        }

        const ok = await notificationService.enablePush();

        notificationService.updateSettings({ push: ok });

        if (!ok) {
          alert(
            'Background notifications are unavailable or permission was denied.'
          );
        }
      }

      refreshNotificationSettings();
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestNotification = async () => {
    if (!notificationSettings.enabled) {
      const enabled = await notificationService.enable();

      refreshNotificationSettings();

      if (!enabled) {
        alert('Enable browser notifications first.');
        return;
      }
    }

    notificationService.notifyRecipeUpdate();

    refreshNotificationSettings();
  };

  const handleTestPush = async () => {
    if (!notificationSettings.push) {
      alert('Enable background notifications first.');
      return;
    }

    const ok = await notificationService.notifyTestPush();

    if (!ok) {
      alert('Test push could not be sent.');
    }
  };

  const copyPairCode = async () => {
    try {
      await navigator.clipboard.writeText(pairCode);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('[Comms] Clipboard error:', error);

      alert('Unable to copy pairing code.');
    }
  };

  const handleResetCurrentRoom = async () => {
    if (!window.confirm(`Reset room "${pairCode}"? This will clear stale device memberships so you and your partner can freshly reconnect.`)) {
      return;
    }
    try {
      setIsResettingRoom(true);
      setResetStatus('Resetting room...');
      await chatPersistence.resetRoom(pairCode);
      setResetStatus('Room reset! Reconnecting...');
      await chatPersistence.joinRoom(pairCode);
      setPersistenceReady(true);
      setPersistenceError(null);
      setTimeout(() => {
        setResetStatus(null);
        setShowPairModal(false);
      }, 1500);
    } catch (error) {
      console.error('[Comms] Reset room error:', error);
      setResetStatus(error?.message || 'Failed to reset room. (Ensure migration is applied)');
    } finally {
      setIsResettingRoom(false);
    }
  };

  const handleUpdateCode = (e) => {
    e.preventDefault();
    const clean = customPairInput.trim().toUpperCase();
    if (!clean || clean.length < 4) {
      alert('Pair code must be at least 4 alphanumeric characters.');
      return;
    }
    if (setPairCode) {
      setPairCode(clean);
      setCustomPairInput('');
      setShowPairModal(false);
    }
  };

  const handlePurgeExpired = async () => {
    try {
      if (!persistenceReadyRef.current) {
        return;
      }

      await chatPersistence.purgeExpiredMessages();

      const storedMessages = await chatPersistence.loadMessages();

      const restoredMessages = [];

      messageIdsRef.current.clear();

      for (const storedMessage of storedMessages) {
        try {
          const restored = storedToMessage(storedMessage);

          if (
            restored.expiresAt &&
            new Date(restored.expiresAt).getTime() <= Date.now()
          ) {
            continue;
          }

          restoredMessages.push(restored);

          messageIdsRef.current.add(restored.id);
        } catch (error) {
          console.error('[Comms] Restore failed:', error);
        }
      }

      setMessages(restoredMessages);

      restoredMessages.forEach(scheduleSelfDestruct);
    } catch (error) {
      console.error('[Comms] Purge failed:', error);

      alert('Unable to refresh messages.');
    }
  };

  const isPartnerOnline = persistenceReady && partnerOnline;

  const headerStatus = isPartnerOnline
    ? {
        label: 'Partner online',
        color: '#10b981',
        dot: '#10b981'
      }
    : persistenceReady
      ? {
          label: 'Encrypted storage ready',
          color: '#f59e0b',
          dot: '#f59e0b'
        }
      : {
          label: 'Connecting...',
          color: '#94a3b8',
          dot: '#64748b'
        };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f1117',
        color: '#f8fafc',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          padding: '14px 20px',
          backgroundColor: 'rgba(22, 25, 34, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.2rem',
              color: '#fff',
              position: 'relative'
            }}
          >
            {partnerName.charAt(0)}

            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: headerStatus.dot,
                border: '2px solid #161922'
              }}
            />
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              {partnerName}
            </h3>

            <span
              style={{
                fontSize: '0.75rem',
                color: headerStatus.color,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Shield size={12} />
              {headerStatus.label}
            </span>

            {persistenceError && (
              <span
                style={{
                  display: 'block',
                  marginTop: '2px',
                  fontSize: '0.65rem',
                  color: '#f87171',
                  maxWidth: '300px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={persistenceError}
              >
                {persistenceError}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowPairModal(true)}
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              gap: '6px'
            }}
          >
            <Sparkles size={14} color="#f97316" />
            {pairCode}
          </button>

          <button
            onClick={onStartVoiceCall}
            disabled={!isPartnerOnline}
            className="btn-icon"
            title="Start Voice Call"
          >
            <Phone size={18} />
          </button>

          <button
            onClick={onStartVideoCall}
            disabled={!isPartnerOnline}
            className="btn-icon"
            title="Start Video Call"
          >
            <Video size={18} />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="btn-icon"
            title="Settings"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={onPanicLock}
            className="btn-icon"
            title="Instant Panic Lock"
            style={{ color: '#f43f5e' }}
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      <div
        style={{
          padding: '6px 16px',
          backgroundColor: 'rgba(15,17,23,0.8)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          fontSize: '0.775rem',
          color: '#94a3b8'
        }}
      >
        <Clock size={13} color="#f97316" />

        <span>Self-Destruct Timer:</span>

        {[
          { label: 'Off', val: null },
          { label: '10s', val: 10 },
          { label: '30s', val: 30 },
          { label: '5m', val: 300 },
          { label: '1h', val: 3600 }
        ].map((timer) => (
          <button
            key={timer.label}
            onClick={() => setEphemeralTimer(timer.val)}
            style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor:
                ephemeralTimer === timer.val ? '#f97316' : 'transparent',
              color: ephemeralTimer === timer.val ? '#fff' : '#64748b',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {timer.label}
          </button>
        ))}
      </div>

      <main
        style={{
          flex: 1,
          padding: '20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundImage:
            'radial-gradient(rgba(249,115,22,0.03) 1px,transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMe={msg.sender === 'me'}
            onRetry={retryMessage}
          />
        ))}

        {messages.length === 0 && persistenceReady && (
          <div
            style={{
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.85rem',
              padding: '40px 20px'
            }}
          >
            No messages yet. Messages you exchange are encrypted and stored
            securely in the cloud.
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      <footer
        style={{
          padding: '14px 20px',
          backgroundColor: 'rgba(22,25,34,0.95)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!persistenceReady}
          className="btn-icon"
          title="Send Photo or Video"
        >
          <ImageIcon size={18} />
        </button>

        {isRecordingVoice ? (
          <button
            onClick={stopVoiceRecording}
            style={{
              height: '40px',
              padding: '0 14px',
              borderRadius: '12px',
              backgroundColor: '#f43f5e',
              color: '#fff',
              border: 'none',
              fontWeight: 700
            }}
          >
            Stop ({recordingSeconds}s)
          </button>
        ) : (
          <button
            onClick={startVoiceRecording}
            disabled={!persistenceReady}
            className="btn-icon"
            title="Voice Note"
          >
            <Mic size={18} />
          </button>
        )}

        <form
          onSubmit={handleSendMessage}
          style={{ flex: 1, display: 'flex', gap: '8px' }}
        >
          <input
            type="text"
            value={inputText}
            disabled={!persistenceReady}
            placeholder={
              persistenceReady
                ? 'Type encrypted message...'
                : 'Initializing encrypted storage...'
            }
            onChange={(event) => setInputText(event.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '16px',
              backgroundColor: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              outline: 'none'
            }}
          />

          <button
            type="submit"
            disabled={!persistenceReady || !inputText.trim()}
            className="btn-primary"
            style={{ padding: '0 18px', borderRadius: '16px' }}
          >
            <Send size={18} />
          </button>
        </form>
      </footer>

      {showPairModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '24px',
              borderRadius: '24px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}
            >
              <h3>Secure Room Pairing</h3>

              <button
                onClick={() => setShowPairModal(false)}
                className="btn-icon"
              >
                <X size={14} />
              </button>
            </div>

            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.85rem',
                marginBottom: '16px'
              }}
            >
              Pair this device using the room code. Both devices share one
              encrypted room.
            </p>

            <div
              style={{
                padding: '16px',
                borderRadius: '16px',
                backgroundColor: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'monospace',
                fontSize: '1.4rem',
                fontWeight: 800,
                color: '#f97316',
                marginBottom: '16px'
              }}
            >
              <span>{pairCode}</span>

              <button
                onClick={copyPairCode}
                className="btn-secondary"
                title="Copy Pair Code"
              >
                {copied ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>

            {setPairCode && (
              <form onSubmit={handleUpdateCode} style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    marginBottom: '6px'
                  }}
                >
                  Switch to Another Pair Code:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="e.g. PAIR-2026"
                    value={customPairInput}
                    onChange={(e) => setCustomPairInput(e.target.value.toUpperCase())}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace'
                    }}
                  />
                  <button
                    type="submit"
                    className="btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                  >
                    Set
                  </button>
                </div>
              </form>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
              <button
                type="button"
                onClick={handleResetCurrentRoom}
                disabled={isResettingRoom}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: isResettingRoom ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={14} />
                {isResettingRoom ? 'Resetting Room...' : 'Reset Room Devices / Slots'}
              </button>
              {resetStatus && (
                <p style={{ marginTop: '8px', fontSize: '0.75rem', color: '#38bdf8', textAlign: 'center' }}>
                  {resetStatus}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '440px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              borderRadius: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                Secret Vault Settings
              </h3>

              <button
                onClick={() => setShowSettingsModal(false)}
                className="btn-icon"
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Partner Nickname
              </label>

              <input
                type="text"
                value={partnerName}
                maxLength={40}
                onChange={(event) => setPartnerName(event.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop: '4px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Secret PIN Code
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={secretPin}
                maxLength={32}
                onChange={(event) => setSecretPin(event.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop: '4px'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Decoy PIN Code
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={decoyPin}
                maxLength={32}
                onChange={(event) => setDecoyPin(event.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop: '4px'
                }}
              />
            </div>

            <div
              style={{
                marginTop: '4px',
                padding: '16px',
                borderRadius: '16px',
                backgroundColor: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  {notificationSettings.enabled ? (
                    <Bell size={18} color="#f97316" />
                  ) : (
                    <BellOff size={18} color="#64748b" />
                  )}

                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      Notifications
                    </div>

                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '0.7rem',
                        marginTop: '2px'
                      }}
                    >
                      {notificationPermission === 'granted'
                        ? 'Browser notifications available'
                        : notificationPermission === 'denied'
                          ? 'Browser permission denied'
                          : 'Browser permission required'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleNotificationToggle}
                  disabled={notificationBusy}
                  style={{
                    width: '46px',
                    height: '26px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: notificationSettings.enabled
                      ? '#f97316'
                      : '#334155',
                    position: 'relative',
                    cursor: notificationBusy ? 'wait' : 'pointer'
                  }}
                  aria-label="Toggle notifications"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: notificationSettings.enabled ? '23px' : '3px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left 0.15s ease'
                    }}
                  />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Recipe updates
                  </div>

                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: '#64748b',
                      marginTop: '2px'
                    }}
                  >
                    New recipe alerts
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={notificationSettings.recipeUpdates}
                  disabled={!notificationSettings.enabled}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'recipeUpdates',
                      event.target.checked
                    )
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Activity alerts
                  </div>

                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: '#64748b',
                      marginTop: '2px'
                    }}
                  >
                    Generic content updates
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={notificationSettings.chatAlerts}
                  disabled={!notificationSettings.enabled}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'chatAlerts',
                      event.target.checked
                    )
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {notificationSettings.sound ? (
                    <Volume2 size={15} color="#94a3b8" />
                  ) : (
                    <VolumeX size={15} color="#64748b" />
                  )}

                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      Notification sound
                    </div>

                    <div
                      style={{
                        fontSize: '0.68rem',
                        color: '#64748b',
                        marginTop: '2px'
                      }}
                    >
                      Use browser default sound
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={notificationSettings.sound}
                  disabled={!notificationSettings.enabled}
                  onChange={(event) =>
                    updateNotificationPreference(
                      'sound',
                      event.target.checked
                    )
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderTop: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Background notifications
                  </div>

                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: '#64748b',
                      marginTop: '2px'
                    }}
                  >
                    Wake device with a generic alert when offline
                  </div>
                </div>

                <button
                  onClick={handlePushToggle}
                  disabled={pushBusy || !notificationService.isPushSupported()}
                  style={{
                    width: '46px',
                    height: '26px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: notificationSettings.push
                      ? '#f97316'
                      : '#334155',
                    position: 'relative',
                    cursor: pushBusy ? 'wait' : 'pointer'
                  }}
                  aria-label="Toggle background notifications"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: notificationSettings.push ? '23px' : '3px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left 0.15s ease'
                    }}
                  />
                </button>
              </div>

              <button
                onClick={handleTestNotification}
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center'
                }}
              >
                <Bell size={15} />
                Test Recipe Notification
              </button>

              <button
                onClick={handleTestPush}
                disabled={!notificationSettings.push}
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center'
                }}
              >
                <Bell size={15} />
                Test Background Push
              </button>
            </div>

            <button
              onClick={handlePurgeExpired}
              className="btn-secondary"
              style={{
                color: '#f43f5e',
                borderColor: 'rgba(244,63,94,0.3)'
              }}
            >
              <Trash2 size={16} />
              Purge Expired Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}