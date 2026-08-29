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

import { cryptoEngine } from '../services/CryptoEngine';
import { p2pManager } from '../services/P2PManager';
import { chatPersistence } from '../services/ChatPersistence';
import { notificationService } from '../services/NotificationService';

export default function CommsVault({
  pairCode = 'PAIR-1314',
  onPanicLock,
  onStartVoiceCall,
  onStartVideoCall,
  secretPin,
  setSecretPin,
  decoyPin,
  setDecoyPin,
  callState,
  setCallState,
  setIsVideoCall,
  setLocalStream,
  setRemoteStream
}) {
  /*
   * ----------------------------------------------------------
   * CHAT
   * ----------------------------------------------------------
   */

  const [messages, setMessages] =
    useState([]);

  const [inputText, setInputText] =
    useState('');

  const [partnerName, setPartnerName] =
    useState('My Love');

  const [isPaired, setIsPaired] =
    useState(false);

  const [connectionError, setConnectionError] =
    useState(null);

  const [persistenceReady, setPersistenceReady] =
    useState(false);

  const [persistenceError, setPersistenceError] =
    useState(null);

  /*
   * ----------------------------------------------------------
   * UI
   * ----------------------------------------------------------
   */

  const [copied, setCopied] =
    useState(false);

  const [showPairModal, setShowPairModal] =
    useState(false);

  const [showSettingsModal, setShowSettingsModal] =
    useState(false);

  const [ephemeralTimer, setEphemeralTimer] =
    useState(null);

  /*
   * ----------------------------------------------------------
   * NOTIFICATIONS
   * ----------------------------------------------------------
   */

  const [
    notificationSettings,
    setNotificationSettings
  ] = useState(
    () =>
      notificationService.getSettings()
  );

  const [
    notificationPermission,
    setNotificationPermission
  ] = useState(
    () =>
      notificationService.getPermission()
  );

  const [
    notificationBusy,
    setNotificationBusy
  ] = useState(false);

  /*
   * ----------------------------------------------------------
   * VOICE RECORDING
   * ----------------------------------------------------------
   */

  const [
    isRecordingVoice,
    setIsRecordingVoice
  ] = useState(false);

  const [
    recordingSeconds,
    setRecordingSeconds
  ] = useState(0);

  /*
   * ----------------------------------------------------------
   * REFS
   * ----------------------------------------------------------
   */

  const mediaRecorderRef =
    useRef(null);

  const audioChunksRef =
    useRef([]);

  const recordingTimerRef =
    useRef(null);

  const chatEndRef =
    useRef(null);

  const fileInputRef =
    useRef(null);

  const mountedRef =
    useRef(true);

  const messageIdsRef =
    useRef(new Set());

  const selfDestructTimersRef =
    useRef(new Map());

  /*
   * ----------------------------------------------------------
   * HELPERS
   * ----------------------------------------------------------
   */

  const createClientMessageId =
    useCallback(() => {
      if (
        window.crypto?.randomUUID
      ) {
        return window.crypto.randomUUID();
      }

      return (
        `msg-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 12)}`
      );
    }, []);

  const formatTimestamp =
    useCallback(
      (
        date = new Date()
      ) => {
        return date.toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        );
      },
      []
    );

  const calculateExpiry =
    useCallback(
      (ttlSeconds) => {
        if (
          !Number.isFinite(
            ttlSeconds
          ) ||
          ttlSeconds <= 0
        ) {
          return null;
        }

        return new Date(
          Date.now() +
          ttlSeconds * 1000
        ).toISOString();
      },
      []
    );

  /*
   * ----------------------------------------------------------
   * RESTORE STORED MESSAGE
   * ----------------------------------------------------------
   */

  const restoreStoredMessage =
    useCallback(
      async (
        storedMessage
      ) => {
        const decryptedPayload =
          await cryptoEngine.decrypt(
            storedMessage.encrypted_payload
          );

        const payload =
          JSON.parse(
            decryptedPayload
          );

        const sender =
          storedMessage.sender_id ===
            chatPersistence.user?.id
            ? 'me'
            : 'partner';

        return {
          id:
            storedMessage.client_message_id,

          databaseId:
            storedMessage.id,

          sender,

          type:
            storedMessage.message_type,

          text:
            payload.text,

          imageUrl:
            payload.imageUrl,

          audioUrl:
            payload.audioUrl,

          timestamp:
            formatTimestamp(
              new Date(
                storedMessage.created_at
              )
            ),

          ttl:
            storedMessage.ttl_seconds,

          expiresAt:
            storedMessage.expires_at,

          deliveredAt:
            storedMessage.delivered_at,

          readAt:
            storedMessage.read_at
        };
      },
      [formatTimestamp]
    );

  /*
   * ----------------------------------------------------------
   * SELF-DESTRUCT
   * ----------------------------------------------------------
   */

  const scheduleSelfDestruct =
    useCallback(
      (msg) => {
        if (!msg) {
          return;
        }

        let delay = null;

        if (
          msg.expiresAt
        ) {
          delay =
            new Date(
              msg.expiresAt
            ).getTime() -
            Date.now();
        } else if (
          Number.isFinite(
            msg.ttl
          ) &&
          msg.ttl > 0
        ) {
          delay =
            msg.ttl * 1000;
        }

        if (
          !delay ||
          delay <= 0
        ) {
          setMessages(
            (previous) =>
              previous.filter(
                (message) =>
                  message.id !==
                  msg.id
              )
          );

          messageIdsRef.current.delete(
            msg.id
          );

          return;
        }

        const existingTimer =
          selfDestructTimersRef.current.get(
            msg.id
          );

        if (existingTimer) {
          clearTimeout(
            existingTimer
          );
        }

        const timer =
          window.setTimeout(
            () => {
              setMessages(
                (previous) =>
                  previous.filter(
                    (message) =>
                      message.id !==
                      msg.id
                  )
              );

              messageIdsRef.current.delete(
                msg.id
              );

              selfDestructTimersRef.current.delete(
                msg.id
              );
            },
            delay
          );

        selfDestructTimersRef.current.set(
          msg.id,
          timer
        );
      },
      []
    );

  /*
   * ----------------------------------------------------------
   * NOTIFICATION SETTINGS
   * ----------------------------------------------------------
   */

  const refreshNotificationSettings =
    useCallback(() => {
      setNotificationSettings(
        notificationService.getSettings()
      );

      setNotificationPermission(
        notificationService.getPermission()
      );
    }, []);

  const handleNotificationToggle =
    async () => {
      if (notificationBusy) {
        return;
      }

      setNotificationBusy(true);

      try {
        if (
          notificationSettings.enabled
        ) {
          notificationService.disable();

          refreshNotificationSettings();

          return;
        }

        const enabled =
          await notificationService.enable();

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

  const updateNotificationPreference =
    (key, value) => {
      const updated =
        notificationService.updateSettings({
          [key]: value
        });

      setNotificationSettings(
        updated
      );
    };

  /*
   * Test notification.
   *
   * This always uses the recipe-style
   * notification and never exposes chat data.
   */

  const handleTestNotification =
    async () => {
      if (
        !notificationSettings.enabled
      ) {
        const enabled =
          await notificationService.enable();

        refreshNotificationSettings();

        if (!enabled) {
          alert(
            'Enable browser notifications first.'
          );

          return;
        }
      }

      notificationService.notifyRecipeUpdate();

      refreshNotificationSettings();
    };

  /*
   * ----------------------------------------------------------
   * SUPABASE INITIALIZATION
   * ----------------------------------------------------------
   */

  useEffect(() => {
    mountedRef.current =
      true;

    let cancelled = false;

    const initializePersistence =
      async () => {
        try {
          setPersistenceReady(
            false
          );

          setPersistenceError(
            null
          );

          await chatPersistence.joinRoom(
            pairCode
          );

          if (
            cancelled ||
            !mountedRef.current
          ) {
            return;
          }

          const storedMessages =
            await chatPersistence.loadMessages();

          if (
            cancelled ||
            !mountedRef.current
          ) {
            return;
          }

          const restoredMessages =
            [];

          for (
            const storedMessage
            of storedMessages
          ) {
            try {
              const restored =
                await restoreStoredMessage(
                  storedMessage
                );

              if (
                restored.expiresAt &&
                new Date(
                  restored.expiresAt
                ).getTime() <=
                Date.now()
              ) {
                continue;
              }

              restoredMessages.push(
                restored
              );

              messageIdsRef.current.add(
                restored.id
              );
            } catch (
            error
            ) {
              console.error(
                '[Comms] Failed to decrypt stored message:',
                error
              );
            }
          }

          setMessages(
            restoredMessages
          );

          restoredMessages.forEach(
            scheduleSelfDestruct
          );

          await chatPersistence.updateLastSeen();

          if (
            cancelled ||
            !mountedRef.current
          ) {
            return;
          }

          chatPersistence.subscribeToMessages(
            async (
              storedMessage
            ) => {
              if (
                cancelled ||
                !mountedRef.current
              ) {
                return;
              }

              /*
               * Supabase sends our own INSERT
               * back through Realtime.
               */
              if (
                storedMessage.sender_id ===
                chatPersistence.user?.id
              ) {
                return;
              }

              const clientMessageId =
                storedMessage.client_message_id;

              /*
               * P2P and Realtime may deliver
               * the same message.
               */
              if (
                messageIdsRef.current.has(
                  clientMessageId
                )
              ) {
                await chatPersistence.markDelivered(
                  storedMessage.id
                );

                await chatPersistence.markRead(
                  storedMessage.id
                );

                return;
              }

              try {
                const newMessage =
                  await restoreStoredMessage(
                    storedMessage
                  );

                if (
                  !mountedRef.current
                ) {
                  return;
                }

                messageIdsRef.current.add(
                  newMessage.id
                );

                setMessages(
                  (previous) => {
                    if (
                      previous.some(
                        (message) =>
                          message.id ===
                          newMessage.id
                      )
                    ) {
                      return previous;
                    }

                    return [
                      ...previous,
                      newMessage
                    ];
                  }
                );

                scheduleSelfDestruct(
                  newMessage
                );

                /*
                 * Do not reveal the actual
                 * chat message in the OS notification.
                 */
                if (
                  notificationSettings.enabled
                ) {
                  notificationService.notifyChatActivity();
                }

                await chatPersistence.markDelivered(
                  storedMessage.id
                );

                await chatPersistence.markRead(
                  storedMessage.id
                );
              } catch (
              error
              ) {
                console.error(
                  '[Comms] Realtime message processing failed:',
                  error
                );
              }
            }
          );

          setPersistenceReady(
            true
          );
        } catch (
        error
        ) {
          console.error(
            '[Comms] Supabase initialization failed:',
            error
          );

          if (
            cancelled ||
            !mountedRef.current
          ) {
            return;
          }

          setPersistenceReady(
            false
          );

          setPersistenceError(
            error?.message ||
            'Unable to initialize encrypted message storage'
          );
        }
      };

    initializePersistence();

    return () => {
      cancelled = true;
      mountedRef.current =
        false;

      chatPersistence.unsubscribe();
    };
  }, [
    pairCode,
    restoreStoredMessage,
    scheduleSelfDestruct,
    notificationSettings.enabled
  ]);

  /*
   * ----------------------------------------------------------
   * P2P INITIALIZATION
   * ----------------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    setConnectionError(null);
    setIsPaired(false);

    const peerId =
      p2pManager.init(
        pairCode,
        {
          onConnect: ({
            peerId:
            remotePeerId
          }) => {
            if (!mounted) {
              return;
            }

            setIsPaired(true);
            setConnectionError(
              null
            );

            console.log(
              '[Comms] P2P connected:',
              remotePeerId
            );
          },

          onDisconnect: () => {
            if (!mounted) {
              return;
            }

            setIsPaired(false);
          },

          onError: (
            error
          ) => {
            if (!mounted) {
              return;
            }

            console.error(
              '[Comms] P2P error:',
              error
            );

            setConnectionError(
              error?.message ||
              error?.type ||
              'P2P connection error'
            );
          },

          onMessage:
            async (
              incomingMsg
            ) => {
              if (
                !mounted ||
                !incomingMsg
              ) {
                return;
              }

              if (
                !incomingMsg.encrypted ||
                typeof incomingMsg.text !==
                'string'
              ) {
                return;
              }

              if (
                incomingMsg.id &&
                messageIdsRef.current.has(
                  incomingMsg.id
                )
              ) {
                return;
              }

              try {
                const decryptedPayload =
                  await cryptoEngine.decrypt(
                    incomingMsg.text
                  );

                const payload =
                  JSON.parse(
                    decryptedPayload
                  );

                const newMsg = {
                  id:
                    incomingMsg.id ||
                    createClientMessageId(),

                  sender:
                    'partner',

                  type:
                    incomingMsg.type ||
                    'text',

                  text:
                    payload.text,

                  imageUrl:
                    payload.imageUrl,

                  audioUrl:
                    payload.audioUrl,

                  timestamp:
                    incomingMsg.timestamp ||
                    formatTimestamp(),

                  ttl:
                    incomingMsg.ttl ||
                    null,

                  expiresAt:
                    incomingMsg.expiresAt ||
                    null
                };

                messageIdsRef.current.add(
                  newMsg.id
                );

                setMessages(
                  (previous) => {
                    if (
                      previous.some(
                        (message) =>
                          message.id ===
                          newMsg.id
                      )
                    ) {
                      return previous;
                    }

                    return [
                      ...previous,
                      newMsg
                    ];
                  }
                );

                scheduleSelfDestruct(
                  newMsg
                );

                /*
                 * Generic notification only.
                 */
                if (
                  notificationSettings.enabled
                ) {
                  notificationService.notifyChatActivity();
                }
              } catch (
              error
              ) {
                console.error(
                  '[Comms] P2P decryption failed:',
                  error
                );
              }
            },

          onIncomingCall:
            (data) => {
              if (!mounted) {
                return;
              }

              setIsVideoCall(
                Boolean(
                  data?.isVideo
                )
              );

              setCallState(
                'incoming'
              );
            },

          onCallAccepted:
            () => {
              if (!mounted) {
                return;
              }

              setCallState(
                'connected'
              );
            },

          onCallEnded:
            () => {
              if (!mounted) {
                return;
              }

              setCallState(
                null
              );

              setLocalStream(
                null
              );

              setRemoteStream(
                null
              );
            },

          onRemoteStream:
            (stream) => {
              if (!mounted) {
                return;
              }

              setRemoteStream(
                stream
              );

              setCallState(
                'connected'
              );
            }
        }
      );

    console.log(
      '[Comms] Local PeerJS ID:',
      peerId
    );

    return () => {
      mounted = false;
    };
  }, [
    pairCode,
    createClientMessageId,
    formatTimestamp,
    scheduleSelfDestruct,
    notificationSettings.enabled,
    setCallState,
    setIsVideoCall,
    setLocalStream,
    setRemoteStream
  ]);

  /*
   * ----------------------------------------------------------
   * CLEANUP
   * ----------------------------------------------------------
   */

  useEffect(() => {
    return () => {
      if (
        recordingTimerRef.current
      ) {
        clearInterval(
          recordingTimerRef.current
        );
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current
          .state !== 'inactive'
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Already stopped.
        }
      }

      selfDestructTimersRef.current.forEach(
        (timer) =>
          clearTimeout(timer)
      );

      selfDestructTimersRef.current.clear();
    };
  }, []);

  /*
   * ----------------------------------------------------------
   * AUTO SCROLL
   * ----------------------------------------------------------
   */

  useEffect(() => {
    chatEndRef.current?.scrollIntoView(
      {
        behavior: 'smooth'
      }
    );
  }, [messages]);

  /*
   * ----------------------------------------------------------
   * P2P SEND
   * ----------------------------------------------------------
   */

  const sendP2PMessage =
    useCallback(
      (message) => {
        return p2pManager.sendMessage(
          message
        );
      },
      []
    );

  /*
   * ----------------------------------------------------------
   * TEXT MESSAGE
   * ----------------------------------------------------------
   */

  const handleSendMessage =
    async (event) => {
      if (event) {
        event.preventDefault();
      }

      const rawText =
        inputText.trim();

      if (!rawText) {
        return;
      }

      if (
        !persistenceReady
      ) {
        alert(
          'Encrypted message storage is still initializing.'
        );

        return;
      }

      const clientMessageId =
        createClientMessageId();

      const ttlSeconds =
        ephemeralTimer;

      const expiresAt =
        calculateExpiry(
          ttlSeconds
        );

      try {
        const encryptedPayload =
          await cryptoEngine.encrypt(
            JSON.stringify({
              text: rawText
            })
          );

        const storedMessage =
          await chatPersistence.saveMessage({
            clientMessageId,
            messageType:
              'text',
            encryptedPayload,
            ttlSeconds,
            expiresAt
          });

        const msgObject = {
          id:
            clientMessageId,

          databaseId:
            storedMessage.id,

          sender:
            'me',

          text:
            rawText,

          timestamp:
            formatTimestamp(),

          type:
            'text',

          ttl:
            ttlSeconds,

          expiresAt
        };

        messageIdsRef.current.add(
          clientMessageId
        );

        setMessages(
          (previous) => [
            ...previous,
            msgObject
          ]
        );

        setInputText('');

        scheduleSelfDestruct(
          msgObject
        );

        /*
         * P2P is best-effort.
         *
         * Supabase remains the persistent
         * source of truth.
         */
        sendP2PMessage({
          id:
            clientMessageId,

          type:
            'text',

          text:
            encryptedPayload,

          encrypted:
            true,

          ttl:
            ttlSeconds,

          expiresAt
        });
      } catch (
      error
      ) {
        console.error(
          '[Comms] Failed to save encrypted message:',
          error
        );

        alert(
          'Unable to save the encrypted message.'
        );
      }
    };

  /*
   * ----------------------------------------------------------
   * VOICE RECORDING
   * ----------------------------------------------------------
   */

  const startVoiceRecording =
    async () => {
      try {
        if (
          !persistenceReady
        ) {
          throw new Error(
            'Encrypted message storage is not ready yet.'
          );
        }

        if (
          !navigator.mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            'Microphone access is unavailable.'
          );
        }

        if (
          typeof MediaRecorder ===
          'undefined'
        ) {
          throw new Error(
            'Voice recording is not supported by this browser.'
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: true
          });

        const recorder =
          new MediaRecorder(
            stream
          );

        mediaRecorderRef.current =
          recorder;

        audioChunksRef.current =
          [];

        recorder.ondataavailable =
          (event) => {
            if (
              event.data &&
              event.data.size >
              0
            ) {
              audioChunksRef.current.push(
                event.data
              );
            }
          };

        recorder.onstop =
          () => {
            stream
              .getTracks()
              .forEach(
                (track) =>
                  track.stop()
              );

            const audioBlob =
              new Blob(
                audioChunksRef.current,
                {
                  type:
                    recorder.mimeType ||
                    'audio/webm'
                }
              );

            const reader =
              new FileReader();

            reader.onloadend =
              async () => {
                const base64Audio =
                  reader.result;

                if (
                  typeof base64Audio !==
                  'string'
                ) {
                  return;
                }

                const clientMessageId =
                  createClientMessageId();

                const ttlSeconds =
                  ephemeralTimer;

                const expiresAt =
                  calculateExpiry(
                    ttlSeconds
                  );

                try {
                  const encryptedPayload =
                    await cryptoEngine.encrypt(
                      JSON.stringify({
                        audioUrl:
                          base64Audio
                      })
                    );

                  const storedMessage =
                    await chatPersistence.saveMessage({
                      clientMessageId,
                      messageType:
                        'voice',
                      encryptedPayload,
                      ttlSeconds,
                      expiresAt
                    });

                  const msgObject = {
                    id:
                      clientMessageId,

                    databaseId:
                      storedMessage.id,

                    sender:
                      'me',

                    audioUrl:
                      base64Audio,

                    timestamp:
                      formatTimestamp(),

                    type:
                      'voice',

                    ttl:
                      ttlSeconds,

                    expiresAt
                  };

                  messageIdsRef.current.add(
                    clientMessageId
                  );

                  setMessages(
                    (previous) => [
                      ...previous,
                      msgObject
                    ]
                  );

                  scheduleSelfDestruct(
                    msgObject
                  );

                  sendP2PMessage({
                    id:
                      clientMessageId,

                    type:
                      'voice',

                    text:
                      encryptedPayload,

                    encrypted:
                      true,

                    ttl:
                      ttlSeconds,

                    expiresAt
                  });
                } catch (
                error
                ) {
                  console.error(
                    '[Comms] Voice message failed:',
                    error
                  );

                  alert(
                    'Unable to save the encrypted voice message.'
                  );
                }
              };

            reader.readAsDataURL(
              audioBlob
            );
          };

        recorder.start();

        setIsRecordingVoice(
          true
        );

        setRecordingSeconds(
          0
        );

        recordingTimerRef.current =
          setInterval(() => {
            setRecordingSeconds(
              (previous) =>
                previous + 1
            );
          }, 1000);
      } catch (
      error
      ) {
        console.error(
          '[Comms] Voice recording failed:',
          error
        );

        alert(
          error?.message ||
          'Microphone access is required.'
        );
      }
    };

  const stopVoiceRecording =
    () => {
      if (
        mediaRecorderRef.current &&
        isRecordingVoice &&
        mediaRecorderRef.current
          .state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }

      setIsRecordingVoice(
        false
      );

      if (
        recordingTimerRef.current
      ) {
        clearInterval(
          recordingTimerRef.current
        );

        recordingTimerRef.current =
          null;
      }
    };

  /*
   * ----------------------------------------------------------
   * IMAGE
   * ----------------------------------------------------------
   */

  const handleImageUpload =
    (event) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          'image/'
        )
      ) {
        alert(
          'Only image files are allowed.'
        );

        event.target.value = '';

        return;
      }

      const MAX_IMAGE_SIZE =
        5 * 1024 * 1024;

      if (
        file.size >
        MAX_IMAGE_SIZE
      ) {
        alert(
          'Image must be smaller than 5 MB.'
        );

        event.target.value = '';

        return;
      }

      if (
        !persistenceReady
      ) {
        alert(
          'Encrypted message storage is still initializing.'
        );

        event.target.value = '';

        return;
      }

      const reader =
        new FileReader();

      reader.onloadend =
        async () => {
          const base64Image =
            reader.result;

          if (
            typeof base64Image !==
            'string'
          ) {
            return;
          }

          const clientMessageId =
            createClientMessageId();

          const ttlSeconds =
            ephemeralTimer;

          const expiresAt =
            calculateExpiry(
              ttlSeconds
            );

          try {
            const encryptedPayload =
              await cryptoEngine.encrypt(
                JSON.stringify({
                  imageUrl:
                    base64Image
                })
              );

            const storedMessage =
              await chatPersistence.saveMessage({
                clientMessageId,
                messageType:
                  'image',
                encryptedPayload,
                ttlSeconds,
                expiresAt
              });

            const msgObject = {
              id:
                clientMessageId,

              databaseId:
                storedMessage.id,

              sender:
                'me',

              imageUrl:
                base64Image,

              timestamp:
                formatTimestamp(),

              type:
                'image',

              ttl:
                ttlSeconds,

              expiresAt
            };

            messageIdsRef.current.add(
              clientMessageId
            );

            setMessages(
              (previous) => [
                ...previous,
                msgObject
              ]
            );

            scheduleSelfDestruct(
              msgObject
            );

            sendP2PMessage({
              id:
                clientMessageId,

              type:
                'image',

              text:
                encryptedPayload,

              encrypted:
                true,

              ttl:
                ttlSeconds,

              expiresAt
            });
          } catch (
          error
          ) {
            console.error(
              '[Comms] Image persistence failed:',
              error
            );

            alert(
              'Unable to save the encrypted image.'
            );
          }
        };

      reader.readAsDataURL(
        file
      );

      event.target.value = '';
    };

  /*
   * ----------------------------------------------------------
   * PAIR CODE
   * ----------------------------------------------------------
   */

  const copyPairCode =
    async () => {
      try {
        await navigator.clipboard.writeText(
          pairCode
        );

        setCopied(true);

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (
      error
      ) {
        console.error(
          '[Comms] Clipboard error:',
          error
        );

        alert(
          'Unable to copy pairing code.'
        );
      }
    };

  /*
   * ----------------------------------------------------------
   * PURGE
   * ----------------------------------------------------------
   */

  const handlePurgeExpired =
    async () => {
      try {
        if (
          !persistenceReady
        ) {
          return;
        }

        await chatPersistence.purgeExpiredMessages();

        const storedMessages =
          await chatPersistence.loadMessages();

        const restoredMessages =
          [];

        messageIdsRef.current.clear();

        for (
          const storedMessage
          of storedMessages
        ) {
          try {
            const restored =
              await restoreStoredMessage(
                storedMessage
              );

            if (
              restored.expiresAt &&
              new Date(
                restored.expiresAt
              ).getTime() <=
              Date.now()
            ) {
              continue;
            }

            restoredMessages.push(
              restored
            );

            messageIdsRef.current.add(
              restored.id
            );
          } catch (
          error
          ) {
            console.error(
              '[Comms] Restore failed:',
              error
            );
          }
        }

        setMessages(
          restoredMessages
        );

        restoredMessages.forEach(
          scheduleSelfDestruct
        );
      } catch (
      error
      ) {
        console.error(
          '[Comms] Purge failed:',
          error
        );

        alert(
          'Unable to refresh messages.'
        );
      }
    };

  /*
   * ----------------------------------------------------------
   * RENDER
   * ----------------------------------------------------------
   */

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
      {/* HEADER */}

      <header
        style={{
          padding:
            '14px 20px',
          backgroundColor:
            'rgba(22, 25, 34, 0.95)',
          borderBottom:
            '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          zIndex: 20
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background:
                'linear-gradient(135deg,#f97316,#ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',
              fontWeight: 800,
              fontSize: '1.2rem',
              color: '#fff',
              position: 'relative'
            }}
          >
            {partnerName.charAt(0)}

            <span
              style={{
                position:
                  'absolute',
                bottom: 0,
                right: 0,
                width: '12px',
                height: '12px',
                borderRadius:
                  '50%',
                backgroundColor:
                  isPaired
                    ? '#10b981'
                    : persistenceReady
                      ? '#f59e0b'
                      : '#64748b',
                border:
                  '2px solid #161922'
              }}
            />
          </div>

          <div>
            <h3
              style={{
                fontSize:
                  '1.05rem',
                fontWeight: 700
              }}
            >
              {partnerName}
            </h3>

            <span
              style={{
                fontSize:
                  '0.75rem',
                color:
                  isPaired
                    ? '#10b981'
                    : persistenceReady
                      ? '#f59e0b'
                      : '#94a3b8',
                display: 'flex',
                alignItems:
                  'center',
                gap: '4px'
              }}
            >
              <Shield size={12} />

              {isPaired
                ? 'P2P Encrypted Comms'
                : persistenceReady
                  ? 'Encrypted storage ready'
                  : 'Connecting...'}
            </span>

            {persistenceError && (
              <span
                style={{
                  display: 'block',
                  marginTop: '2px',
                  fontSize:
                    '0.65rem',
                  color:
                    '#f87171',
                  maxWidth:
                    '300px',
                  overflow:
                    'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace:
                    'nowrap'
                }}
                title={
                  persistenceError
                }
              >
                Storage:{' '}
                {
                  persistenceError
                }
              </span>
            )}

            {connectionError && (
              <span
                style={{
                  display: 'block',
                  marginTop: '2px',
                  fontSize:
                    '0.65rem',
                  color:
                    '#f87171',
                  maxWidth:
                    '300px',
                  overflow:
                    'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace:
                    'nowrap'
                }}
                title={
                  connectionError
                }
              >
                P2P:{' '}
                {
                  connectionError
                }
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems:
              'center',
            gap: '10px'
          }}
        >
          <button
            onClick={() =>
              setShowPairModal(
                true
              )
            }
            className="btn-secondary"
            style={{
              padding:
                '6px 12px',
              fontSize:
                '0.8rem',
              gap: '6px'
            }}
          >
            <Sparkles
              size={14}
              color="#f97316"
            />

            {pairCode}
          </button>

          <button
            onClick={
              onStartVoiceCall
            }
            disabled={
              !isPaired
            }
            className="btn-icon"
            title="Start Voice Call"
          >
            <Phone size={18} />
          </button>

          <button
            onClick={
              onStartVideoCall
            }
            disabled={
              !isPaired
            }
            className="btn-icon"
            title="Start Video Call"
          >
            <Video size={18} />
          </button>

          <button
            onClick={() =>
              setShowSettingsModal(
                true
              )
            }
            className="btn-icon"
            title="Settings"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={
              onPanicLock
            }
            className="btn-icon"
            title="Instant Panic Lock"
            style={{
              color:
                '#f43f5e'
            }}
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      {/* TIMER */}

      <div
        style={{
          padding:
            '6px 16px',
          backgroundColor:
            'rgba(15,17,23,0.8)',
          borderBottom:
            '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems:
            'center',
          justifyContent:
            'center',
          gap: '12px',
          fontSize:
            '0.775rem',
          color:
            '#94a3b8'
        }}
      >
        <Clock
          size={13}
          color="#f97316"
        />

        <span>
          Self-Destruct Timer:
        </span>

        {[
          {
            label: 'Off',
            val: null
          },
          {
            label: '10s',
            val: 10
          },
          {
            label: '30s',
            val: 30
          },
          {
            label: '5m',
            val: 300
          },
          {
            label: '1h',
            val: 3600
          }
        ].map(
          (timer) => (
            <button
              key={
                timer.label
              }
              onClick={() =>
                setEphemeralTimer(
                  timer.val
                )
              }
              style={{
                padding:
                  '2px 8px',
                borderRadius:
                  '10px',
                fontSize:
                  '0.75rem',
                fontWeight: 600,
                backgroundColor:
                  ephemeralTimer ===
                    timer.val
                    ? '#f97316'
                    : 'transparent',
                color:
                  ephemeralTimer ===
                    timer.val
                    ? '#fff'
                    : '#64748b',
                border:
                  'none',
                cursor:
                  'pointer'
              }}
            >
              {
                timer.label
              }
            </button>
          )
        )}
      </div>

      {/* CHAT */}

      <main
        style={{
          flex: 1,
          padding: '20px',
          overflowY:
            'auto',
          display: 'flex',
          flexDirection:
            'column',
          gap: '16px',
          backgroundImage:
            'radial-gradient(rgba(249,115,22,0.03) 1px,transparent 1px)',
          backgroundSize:
            '24px 24px'
        }}
      >
        {messages.map(
          (msg) => {
            const isMe =
              msg.sender ===
              'me';

            return (
              <div
                key={
                  msg.id
                }
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  alignItems:
                    isMe
                      ? 'flex-end'
                      : 'flex-start',
                  maxWidth:
                    '80%',
                  alignSelf:
                    isMe
                      ? 'flex-end'
                      : 'flex-start'
                }}
              >
                <div
                  style={{
                    padding:
                      '12px 16px',
                    borderRadius:
                      isMe
                        ? '20px 20px 4px 20px'
                        : '20px 20px 20px 4px',
                    background:
                      isMe
                        ? 'linear-gradient(135deg,#ea580c,#c2410c)'
                        : 'rgba(30,34,48,0.85)',
                    border:
                      isMe
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontSize:
                      '0.925rem',
                    lineHeight:
                      1.4
                  }}
                >
                  {msg.type ===
                    'text' && (
                      <div>
                        {
                          msg.text
                        }
                      </div>
                    )}

                  {msg.type ===
                    'voice' && (
                      <audio
                        controls
                        src={
                          msg.audioUrl
                        }
                        style={{
                          width:
                            '220px',
                          height:
                            '36px'
                        }}
                      />
                    )}

                  {msg.type ===
                    'image' && (
                      <img
                        src={
                          msg.imageUrl
                        }
                        alt="attachment"
                        style={{
                          maxWidth:
                            '240px',
                          borderRadius:
                            '12px',
                          display:
                            'block'
                        }}
                      />
                    )}

                  {msg.ttl && (
                    <div
                      style={{
                        fontSize:
                          '0.65rem',
                        color:
                          isMe
                            ? 'rgba(255,255,255,0.7)'
                            : '#f97316',
                        marginTop:
                          '4px',
                        display:
                          'flex',
                        alignItems:
                          'center',
                        gap: '4px'
                      }}
                    >
                      <Clock
                        size={10}
                      />

                      Disappears
                      in{' '}
                      {msg.ttl}
                      s
                    </div>
                  )}
                </div>

                <span
                  style={{
                    fontSize:
                      '0.7rem',
                    color:
                      '#64748b',
                    marginTop:
                      '4px',
                    padding:
                      '0 4px'
                  }}
                >
                  {
                    msg.timestamp
                  }
                </span>
              </div>
            );
          }
        )}

        <div
          ref={
            chatEndRef
          }
        />
      </main>

      {/* INPUT */}

      <footer
        style={{
          padding:
            '14px 20px',
          backgroundColor:
            'rgba(22,25,34,0.95)',
          borderTop:
            '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems:
            'center',
          gap: '10px'
        }}
      >
        <input
          type="file"
          ref={
            fileInputRef
          }
          accept="image/*"
          onChange={
            handleImageUpload
          }
          style={{
            display: 'none'
          }}
        />

        <button
          onClick={() =>
            fileInputRef.current?.click()
          }
          disabled={
            !persistenceReady
          }
          className="btn-icon"
          title="Send Photo"
        >
          <ImageIcon
            size={18}
          />
        </button>

        {isRecordingVoice ? (
          <button
            onClick={
              stopVoiceRecording
            }
            style={{
              height: '40px',
              padding:
                '0 14px',
              borderRadius:
                '12px',
              backgroundColor:
                '#f43f5e',
              color: '#fff',
              border:
                'none',
              fontWeight:
                700
            }}
          >
            Stop (
            {
              recordingSeconds
            }
            s)
          </button>
        ) : (
          <button
            onClick={
              startVoiceRecording
            }
            disabled={
              !persistenceReady
            }
            className="btn-icon"
            title="Voice Note"
          >
            <Mic size={18} />
          </button>
        )}

        <form
          onSubmit={
            handleSendMessage
          }
          style={{
            flex: 1,
            display: 'flex',
            gap: '8px'
          }}
        >
          <input
            type="text"
            value={
              inputText
            }
            disabled={
              !persistenceReady
            }
            placeholder={
              persistenceReady
                ? 'Type encrypted message...'
                : 'Initializing encrypted storage...'
            }
            onChange={(
              event
            ) =>
              setInputText(
                event.target.value
              )
            }
            style={{
              width:
                '100%',
              padding:
                '12px 16px',
              borderRadius:
                '16px',
              backgroundColor:
                'rgba(0,0,0,0.35)',
              border:
                '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              outline:
                'none'
            }}
          />

          <button
            type="submit"
            disabled={
              !persistenceReady ||
              !inputText.trim()
            }
            className="btn-primary"
            style={{
              padding:
                '0 18px',
              borderRadius:
                '16px'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </footer>

      {/* -------------------------------------------------- */}
      {/* PAIR MODAL                                         */}
      {/* -------------------------------------------------- */}

      {showPairModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor:
              'rgba(0,0,0,0.8)',
            backdropFilter:
              'blur(10px)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width:
                '100%',
              maxWidth:
                '400px',
              padding:
                '24px',
              borderRadius:
                '24px'
            }}
          >
            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                marginBottom:
                  '16px'
              }}
            >
              <h3>
                P2P Room Pairing
              </h3>

              <button
                onClick={() =>
                  setShowPairModal(
                    false
                  )
                }
                className="btn-icon"
              >
                <X size={14} />
              </button>
            </div>

            <p
              style={{
                color:
                  '#94a3b8',
                fontSize:
                  '0.85rem',
                marginBottom:
                  '16px'
              }}
            >
              Pair this device
              using the room
              code.
            </p>

            <div
              style={{
                padding:
                  '16px',
                borderRadius:
                  '16px',
                backgroundColor:
                  'rgba(0,0,0,0.4)',
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'space-between',
                fontFamily:
                  'monospace',
                fontSize:
                  '1.4rem',
                fontWeight:
                  800,
                color:
                  '#f97316'
              }}
            >
              <span>
                {
                  pairCode
                }
              </span>

              <button
                onClick={
                  copyPairCode
                }
                className="btn-secondary"
              >
                {copied ? (
                  <Check
                    size={16}
                  />
                ) : (
                  <Copy
                    size={16}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SETTINGS                                           */}
      {/* -------------------------------------------------- */}

      {showSettingsModal && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor:
              'rgba(0,0,0,0.8)',
            backdropFilter:
              'blur(10px)',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width:
                '100%',
              maxWidth:
                '440px',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              padding:
                '24px',
              borderRadius:
                '24px',
              display:
                'flex',
              flexDirection:
                'column',
              gap: '18px'
            }}
          >
            {/* SETTINGS HEADER */}

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center'
              }}
            >
              <h3
                style={{
                  fontSize:
                    '1.1rem',
                  fontWeight:
                    800
                }}
              >
                Secret Vault Settings
              </h3>

              <button
                onClick={() =>
                  setShowSettingsModal(
                    false
                  )
                }
                className="btn-icon"
              >
                <X size={14} />
              </button>
            </div>

            {/* PARTNER NAME */}

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Partner Nickname
              </label>

              <input
                type="text"
                value={
                  partnerName
                }
                maxLength={40}
                onChange={(
                  event
                ) =>
                  setPartnerName(
                    event.target.value
                  )
                }
                style={{
                  width:
                    '100%',
                  padding:
                    '10px',
                  borderRadius:
                    '10px',
                  backgroundColor:
                    'rgba(255,255,255,0.05)',
                  border:
                    '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            {/* SECRET PIN */}

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Secret PIN Code
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={
                  secretPin
                }
                maxLength={32}
                onChange={(
                  event
                ) =>
                  setSecretPin(
                    event.target.value
                  )
                }
                style={{
                  width:
                    '100%',
                  padding:
                    '10px',
                  borderRadius:
                    '10px',
                  backgroundColor:
                    'rgba(255,255,255,0.05)',
                  border:
                    '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            {/* DECOY PIN */}

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Decoy PIN Code
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={
                  decoyPin
                }
                maxLength={32}
                onChange={(
                  event
                ) =>
                  setDecoyPin(
                    event.target.value
                  )
                }
                style={{
                  width:
                    '100%',
                  padding:
                    '10px',
                  borderRadius:
                    '10px',
                  backgroundColor:
                    'rgba(255,255,255,0.05)',
                  border:
                    '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            {/* ------------------------------------------------ */}
            {/* NOTIFICATION SETTINGS                           */}
            {/* ------------------------------------------------ */}

            <div
              style={{
                marginTop:
                  '4px',
                padding:
                  '16px',
                borderRadius:
                  '16px',
                backgroundColor:
                  'rgba(255,255,255,0.035)',
                border:
                  '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  marginBottom:
                    '14px'
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: '10px'
                  }}
                >
                  {notificationSettings.enabled ? (
                    <Bell
                      size={18}
                      color="#f97316"
                    />
                  ) : (
                    <BellOff
                      size={18}
                      color="#64748b"
                    />
                  )}

                  <div>
                    <div
                      style={{
                        fontWeight:
                          700,
                        fontSize:
                          '0.9rem'
                      }}
                    >
                      Notifications
                    </div>

                    <div
                      style={{
                        color:
                          '#64748b',
                        fontSize:
                          '0.7rem',
                        marginTop:
                          '2px'
                      }}
                    >
                      {notificationPermission ===
                        'granted'
                        ? 'Browser notifications available'
                        : notificationPermission ===
                          'denied'
                          ? 'Browser permission denied'
                          : 'Browser permission required'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={
                    handleNotificationToggle
                  }
                  disabled={
                    notificationBusy
                  }
                  style={{
                    width:
                      '46px',
                    height:
                      '26px',
                    borderRadius:
                      '20px',
                    border:
                      'none',
                    backgroundColor:
                      notificationSettings.enabled
                        ? '#f97316'
                        : '#334155',
                    position:
                      'relative',
                    cursor:
                      notificationBusy
                        ? 'wait'
                        : 'pointer'
                  }}
                  aria-label="Toggle notifications"
                >
                  <span
                    style={{
                      position:
                        'absolute',
                      top: '3px',
                      left:
                        notificationSettings.enabled
                          ? '23px'
                          : '3px',
                      width:
                        '20px',
                      height:
                        '20px',
                      borderRadius:
                        '50%',
                      backgroundColor:
                        '#fff',
                      transition:
                        'left 0.15s ease'
                    }}
                  />
                </button>
              </div>

              {/* RECIPE UPDATES */}

              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  padding:
                    '10px 0',
                  borderTop:
                    '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        '0.8rem',
                      fontWeight:
                        600
                    }}
                  >
                    Recipe updates
                  </div>

                  <div
                    style={{
                      fontSize:
                        '0.68rem',
                      color:
                        '#64748b',
                      marginTop:
                        '2px'
                    }}
                  >
                    New recipe alerts
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    notificationSettings.recipeUpdates
                  }
                  disabled={
                    !notificationSettings.enabled
                  }
                  onChange={(
                    event
                  ) =>
                    updateNotificationPreference(
                      'recipeUpdates',
                      event
                        .target
                        .checked
                    )
                  }
                />
              </div>

              {/* CHAT ALERTS */}

              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  padding:
                    '10px 0',
                  borderTop:
                    '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        '0.8rem',
                      fontWeight:
                        600
                    }}
                  >
                    Activity alerts
                  </div>

                  <div
                    style={{
                      fontSize:
                        '0.68rem',
                      color:
                        '#64748b',
                      marginTop:
                        '2px'
                    }}
                  >
                    Generic content updates
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    notificationSettings.chatAlerts
                  }
                  disabled={
                    !notificationSettings.enabled
                  }
                  onChange={(
                    event
                  ) =>
                    updateNotificationPreference(
                      'chatAlerts',
                      event
                        .target
                        .checked
                    )
                  }
                />
              </div>

              {/* SOUND */}

              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  padding:
                    '10px 0',
                  borderTop:
                    '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: '8px'
                  }}
                >
                  {notificationSettings.sound ? (
                    <Volume2
                      size={15}
                      color="#94a3b8"
                    />
                  ) : (
                    <VolumeX
                      size={15}
                      color="#64748b"
                    />
                  )}

                  <div>
                    <div
                      style={{
                        fontSize:
                          '0.8rem',
                        fontWeight:
                          600
                      }}
                    >
                      Notification sound
                    </div>

                    <div
                      style={{
                        fontSize:
                          '0.68rem',
                        color:
                          '#64748b',
                        marginTop:
                          '2px'
                      }}
                    >
                      Use browser default sound
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    notificationSettings.sound
                  }
                  disabled={
                    !notificationSettings.enabled
                  }
                  onChange={(
                    event
                  ) =>
                    updateNotificationPreference(
                      'sound',
                      event
                        .target
                        .checked
                    )
                  }
                />
              </div>

              {/* TEST */}

              <button
                onClick={
                  handleTestNotification
                }
                className="btn-secondary"
                style={{
                  width:
                    '100%',
                  marginTop:
                    '10px',
                  justifyContent:
                    'center'
                }}
              >
                <Bell
                  size={15}
                />

                Test Recipe Notification
              </button>
            </div>

            {/* PURGE */}

            <button
              onClick={
                handlePurgeExpired
              }
              className="btn-secondary"
              style={{
                color:
                  '#f43f5e',
                borderColor:
                  'rgba(244,63,94,0.3)'
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