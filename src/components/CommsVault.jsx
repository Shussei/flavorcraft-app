import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';

import { cryptoEngine } from '../services/CryptoEngine';
import { p2pManager } from '../services/P2PManager';

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
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partnerName, setPartnerName] = useState('My Love');

  const [isPaired, setIsPaired] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const [copied, setCopied] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] =
    useState(false);

  const [ephemeralTimer, setEphemeralTimer] =
    useState(null);

  // Voice-note recording state
  const [isRecordingVoice, setIsRecordingVoice] =
    useState(false);

  const [recordingSeconds, setRecordingSeconds] =
    useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  /*
   * Initialize the P2P connection.
   *
   * pairCode identifies the pairing room.
   * P2PManager generates a unique PeerJS ID internally.
   */
  useEffect(() => {
    let mounted = true;

    setConnectionError(null);
    setIsPaired(false);

    const peerId = p2pManager.init(pairCode, {
      onConnect: ({ peerId: remotePeerId }) => {
        if (!mounted) return;

        console.log(
          '[Comms] P2P connection established:',
          remotePeerId
        );

        setIsPaired(true);
        setConnectionError(null);
      },

      onDisconnect: () => {
        if (!mounted) return;

        console.log(
          '[Comms] P2P connection disconnected'
        );

        setIsPaired(false);
      },

      onError: (error) => {
        if (!mounted) return;

        console.error(
          '[Comms] P2P error:',
          error
        );

        setConnectionError(
          error?.message ||
          error?.type ||
          'Connection error'
        );
      },

      onMessage: async (incomingMsg) => {
        if (!mounted || !incomingMsg) return;

        try {
          let decryptedText =
            incomingMsg.text;

          /*
           * Text messages arrive encrypted.
           */
          if (
            incomingMsg.type === 'text' &&
            incomingMsg.text &&
            incomingMsg.encrypted
          ) {
            decryptedText =
              await cryptoEngine.decrypt(
                incomingMsg.text
              );
          }

          const newMsg = {
            ...incomingMsg,
            text: decryptedText,
            sender: 'partner'
          };

          setMessages((previous) => [
            ...previous,
            newMsg
          ]);

          scheduleSelfDestruct(newMsg);
        } catch (error) {
          console.error(
            '[Comms] Failed to process incoming message:',
            error
          );
        }
      },

      onIncomingCall: (data) => {
        if (!mounted) return;

        console.log(
          '[Comms] Incoming call:',
          data
        );

        setIsVideoCall(
          Boolean(data?.isVideo)
        );

        setCallState('incoming');
      },

      onCallAccepted: () => {
        if (!mounted) return;

        setCallState('connected');
      },

      onCallEnded: () => {
        if (!mounted) return;

        setCallState(null);
        setLocalStream(null);
        setRemoteStream(null);
      },

      onRemoteStream: (stream) => {
        if (!mounted) return;

        setRemoteStream(stream);
        setCallState('connected');
      }
    });

    console.log(
      '[Comms] Local PeerJS ID:',
      peerId
    );

    return () => {
      mounted = false;
    };
  }, [
    pairCode,
    setCallState,
    setIsVideoCall,
    setLocalStream,
    setRemoteStream
  ]);

  /*
   * Clean up recording timer if component unmounts.
   */
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(
          recordingTimerRef.current
        );
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  /*
   * Scroll chat to newest message.
   */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [messages]);

  /*
   * Remove an ephemeral message after its TTL.
   */
  const scheduleSelfDestruct = (msg) => {
    if (!msg?.ttl) return;

    setTimeout(() => {
      setMessages((previous) =>
        previous.filter(
          (message) =>
            message.id !== msg.id
        )
      );
    }, msg.ttl * 1000);
  };

  /*
   * Send a message through the P2P data channel.
   */
  const sendP2PMessage = (message) => {
    const sent =
      p2pManager.sendMessage(message);

    if (!sent) {
      setMessages((previous) =>
        previous.filter(
          (messageItem) =>
            messageItem.id !== message.id
        )
      );

      alert(
        'The other device is not connected yet.'
      );

      return false;
    }

    return true;
  };

  /*
   * Send text message.
   */
  const handleSendMessage = async (event) => {
    if (event) {
      event.preventDefault();
    }

    const rawText = inputText.trim();

    if (!rawText) return;

    /*
     * Don't clear the input until encryption succeeds.
     */
    try {
      const encryptedText =
        await cryptoEngine.encrypt(
          rawText
        );

      const msgObject = {
        id: `msg-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

        sender: 'me',

        /*
         * Keep plaintext locally so the sender can
         * render the message immediately.
         */
        text: rawText,

        encryptedText,

        timestamp:
          new Date().toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit'
            }
          ),

        type: 'text',

        ttl: ephemeralTimer
      };

      /*
       * Only show the local message after confirming
       * that a P2P connection exists.
       */
      const sent = sendP2PMessage({
        ...msgObject,
        text: encryptedText,
        encrypted: true
      });

      if (!sent) {
        return;
      }

      setInputText('');

      setMessages((previous) => [
        ...previous,
        msgObject
      ]);

      scheduleSelfDestruct(msgObject);
    } catch (error) {
      console.error(
        '[Comms] Failed to encrypt message:',
        error
      );

      alert(
        'Unable to encrypt the message.'
      );
    }
  };

  /*
   * Start voice-note recording.
   */
  const startVoiceRecording = async () => {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          'Microphone access is unavailable.'
        );
      }

      if (
        typeof MediaRecorder === 'undefined'
      ) {
        throw new Error(
          'Voice recording is not supported by this browser.'
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      mediaRecorderRef.current =
        new MediaRecorder(stream);

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable =
        (event) => {
          if (
            event.data &&
            event.data.size > 0
          ) {
            audioChunksRef.current.push(
              event.data
            );
          }
        };

      mediaRecorderRef.current.onstop =
        () => {
          /*
           * Release microphone immediately.
           */
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );

          const audioBlob = new Blob(
            audioChunksRef.current,
            {
              type:
                mediaRecorderRef.current
                  ?.mimeType ||
                'audio/webm'
            }
          );

          const reader =
            new FileReader();

          reader.readAsDataURL(
            audioBlob
          );

          reader.onloadend = () => {
            const base64Audio =
              reader.result;

            if (
              typeof base64Audio !==
              'string'
            ) {
              return;
            }

            const msgObject = {
              id: `msg-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,

              sender: 'me',

              audioUrl: base64Audio,

              timestamp:
                new Date().toLocaleTimeString(
                  [],
                  {
                    hour: '2-digit',
                    minute: '2-digit'
                  }
                ),

              type: 'voice',

              ttl: ephemeralTimer
            };

            const sent =
              sendP2PMessage(
                msgObject
              );

            if (!sent) {
              return;
            }

            setMessages((previous) => [
              ...previous,
              msgObject
            ]);

            scheduleSelfDestruct(
              msgObject
            );
          };
        };

      mediaRecorderRef.current.start();

      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current =
        setInterval(() => {
          setRecordingSeconds(
            (previous) =>
              previous + 1
          );
        }, 1000);
    } catch (error) {
      console.error(
        '[Comms] Voice recording failed:',
        error
      );

      alert(
        error?.message ||
        'Microphone access is required for voice notes.'
      );
    }
  };

  /*
   * Stop voice-note recording.
   */
  const stopVoiceRecording = () => {
    if (
      mediaRecorderRef.current &&
      isRecordingVoice &&
      mediaRecorderRef.current.state !==
      'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    setIsRecordingVoice(false);

    if (recordingTimerRef.current) {
      clearInterval(
        recordingTimerRef.current
      );

      recordingTimerRef.current = null;
    }
  };

  /*
   * Image upload.
   */
  const handleImageUpload = (event) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    /*
     * Client-side validation.
     */
    if (
      !file.type.startsWith('image/')
    ) {
      alert(
        'Only image files are allowed.'
      );

      event.target.value = '';
      return;
    }

    /*
     * Prevent unnecessarily huge DataChannel payloads.
     */
    const MAX_IMAGE_SIZE =
      5 * 1024 * 1024;

    if (file.size > MAX_IMAGE_SIZE) {
      alert(
        'Image must be smaller than 5 MB.'
      );

      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onloadend = () => {
      const base64Image =
        reader.result;

      if (
        typeof base64Image !==
        'string'
      ) {
        return;
      }

      const msgObject = {
        id: `msg-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

        sender: 'me',

        imageUrl: base64Image,

        timestamp:
          new Date().toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit'
            }
          ),

        type: 'image',

        ttl: ephemeralTimer
      };

      const sent =
        sendP2PMessage(msgObject);

      if (!sent) {
        return;
      }

      setMessages((previous) => [
        ...previous,
        msgObject
      ]);

      scheduleSelfDestruct(
        msgObject
      );
    };

    /*
     * Allow selecting the same file again.
     */
    event.target.value = '';
  };

  /*
   * Copy pairing code.
   */
  const copyPairCode = async () => {
    try {
      await navigator.clipboard.writeText(
        pairCode
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        '[Comms] Clipboard error:',
        error
      );

      alert(
        'Unable to copy the pairing code.'
      );
    }
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
      {/* Header */}
      <header
        style={{
          padding: '14px 20px',
          backgroundColor:
            'rgba(22, 25, 34, 0.95)',
          borderBottom:
            '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20
        }}
      >
        {/* Partner information */}
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
                'linear-gradient(135deg, #f97316, #ea580c)',
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
                bottom: '0',
                right: '0',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor:
                  isPaired
                    ? '#10b981'
                    : '#f59e0b',
                border:
                  '2px solid #161922'
              }}
            />
          </div>

          <div>
            <h3
              style={{
                fontSize: '1.05rem',
                fontWeight: 700
              }}
            >
              {partnerName}
            </h3>

            <span
              style={{
                fontSize: '0.75rem',
                color:
                  isPaired
                    ? '#10b981'
                    : '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Shield size={12} />

              {isPaired
                ? 'P2P Encrypted Comms'
                : 'Waiting for partner...'}
            </span>

            {connectionError && (
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
                title={connectionError}
              >
                {connectionError}
              </span>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <button
            onClick={() =>
              setShowPairModal(true)
            }
            className="btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
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
            onClick={onStartVoiceCall}
            disabled={!isPaired}
            className="btn-icon"
            style={{
              backgroundColor:
                'rgba(16, 185, 129, 0.2)',
              border:
                '1px solid rgba(16, 185, 129, 0.4)',
              color: '#10b981',
              opacity:
                isPaired ? 1 : 0.4
            }}
            title="Start Voice Call"
          >
            <Phone size={18} />
          </button>

          <button
            onClick={onStartVideoCall}
            disabled={!isPaired}
            className="btn-icon"
            style={{
              backgroundColor:
                'rgba(249, 115, 22, 0.2)',
              border:
                '1px solid rgba(249, 115, 22, 0.4)',
              color: '#f97316',
              opacity:
                isPaired ? 1 : 0.4
            }}
            title="Start Video Call"
          >
            <Video size={18} />
          </button>

          <button
            onClick={() =>
              setShowSettingsModal(true)
            }
            className="btn-icon"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={onPanicLock}
            className="btn-icon"
            style={{
              backgroundColor:
                'rgba(244, 63, 94, 0.2)',
              border:
                '1px solid rgba(244, 63, 94, 0.4)',
              color: '#f43f5e'
            }}
            title="Instant Panic Lock"
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      {/* Self-destruct timer */}
      <div
        style={{
          padding: '6px 16px',
          backgroundColor:
            'rgba(15, 17, 23, 0.8)',
          borderBottom:
            '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          fontSize: '0.775rem',
          color: '#94a3b8'
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
        ].map((timer) => (
          <button
            key={timer.label}
            onClick={() =>
              setEphemeralTimer(
                timer.val
              )
            }
            style={{
              padding:
                '2px 8px',
              borderRadius: '10px',
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
              border: 'none',
              cursor: 'pointer',
              transition:
                '0.15s ease'
            }}
          >
            {timer.label}
          </button>
        ))}
      </div>

      {/* Chat feed */}
      <main
        style={{
          flex: 1,
          padding: '20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          backgroundImage:
            'radial-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        {messages.map((msg) => {
          const isMe =
            msg.sender === 'me';

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection:
                  'column',
                alignItems:
                  isMe
                    ? 'flex-end'
                    : 'flex-start',
                maxWidth: '80%',
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
                      ? 'linear-gradient(135deg, #ea580c, #c2410c)'
                      : 'rgba(30, 34, 48, 0.85)',
                  border:
                    isMe
                      ? 'none'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  fontSize:
                    '0.925rem',
                  lineHeight: 1.4,
                  boxShadow:
                    '0 4px 14px rgba(0, 0, 0, 0.25)',
                  position:
                    'relative'
                }}
              >
                {/* Text */}
                {msg.type === 'text' && (
                  <div>
                    {msg.text}
                  </div>
                )}

                {/* Voice */}
                {msg.type ===
                  'voice' && (
                    <div
                      style={{
                        display:
                          'flex',
                        alignItems:
                          'center',
                        gap: '10px'
                      }}
                    >
                      <audio
                        controls
                        src={
                          msg.audioUrl
                        }
                        style={{
                          height:
                            '36px',
                          width:
                            '220px'
                        }}
                      />
                    </div>
                  )}

                {/* Image */}
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

                {/* TTL */}
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
                    <Clock size={10} />

                    Disappears in{' '}
                    {msg.ttl}s
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
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        <div ref={chatEndRef} />
      </main>

      {/* Input bar */}
      <footer
        style={{
          padding:
            '14px 20px',
          backgroundColor:
            'rgba(22, 25, 34, 0.95)',
          borderTop:
            '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems:
            'center',
          gap: '10px'
        }}
      >
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={
            handleImageUpload
          }
          style={{
            display: 'none'
          }}
        />

        {/* Image button */}
        <button
          onClick={() =>
            fileInputRef.current?.click()
          }
          disabled={!isPaired}
          className="btn-icon"
          style={{
            width: '40px',
            height: '40px',
            opacity:
              isPaired ? 1 : 0.4
          }}
          title="Send Photo"
        >
          <ImageIcon
            size={18}
            color="#94a3b8"
          />
        </button>

        {/* Voice recording */}
        {isRecordingVoice ? (
          <button
            onClick={
              stopVoiceRecording
            }
            className="pulse-record"
            style={{
              padding:
                '0 16px',
              height: '40px',
              borderRadius:
                '12px',
              backgroundColor:
                '#f43f5e',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize:
                '0.85rem',
              cursor:
                'pointer',
              display:
                'flex',
              alignItems:
                'center',
              gap: '6px'
            }}
          >
            <SquareStopIcon />

            Stop ({recordingSeconds}s)
          </button>
        ) : (
          <button
            onClick={
              startVoiceRecording
            }
            disabled={!isPaired}
            className="btn-icon"
            style={{
              width: '40px',
              height: '40px',
              opacity:
                isPaired ? 1 : 0.4
            }}
            title="Record Voice Note"
          >
            <Mic
              size={18}
              color="#94a3b8"
            />
          </button>
        )}

        {/* Text input */}
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
            placeholder={
              isPaired
                ? 'Type encrypted message...'
                : 'Waiting for partner...'
            }
            value={inputText}
            disabled={!isPaired}
            onChange={(event) =>
              setInputText(
                event.target.value
              )
            }
            style={{
              width: '100%',
              padding:
                '12px 16px',
              borderRadius:
                '16px',
              backgroundColor:
                'rgba(0, 0, 0, 0.35)',
              border:
                '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize:
                '0.925rem',
              outline: 'none',
              opacity:
                isPaired ? 1 : 0.5
            }}
          />

          <button
            type="submit"
            disabled={
              !isPaired ||
              !inputText.trim()
            }
            className="btn-primary"
            style={{
              padding:
                '0 18px',
              borderRadius:
                '16px',
              opacity:
                isPaired &&
                  inputText.trim()
                  ? 1
                  : 0.4
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </footer>

      {/* Pairing modal */}
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
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel animate-fadeIn"
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
              <h3
                style={{
                  fontSize:
                    '1.1rem',
                  fontWeight:
                    800
                }}
              >
                P2P Room Pairing
              </h3>

              <button
                onClick={() =>
                  setShowPairModal(
                    false
                  )
                }
                className="btn-icon"
                style={{
                  width:
                    '28px',
                  height:
                    '28px'
                }}
              >
                <X size={14} />
              </button>
            </div>

            <p
              style={{
                fontSize:
                  '0.85rem',
                color:
                  '#94a3b8',
                marginBottom:
                  '16px'
              }}
            >
              Share this pairing
              code with your
              partner to connect
              both devices:
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
                {pairCode}
              </span>

              <button
                onClick={
                  copyPairCode
                }
                className="btn-secondary"
                style={{
                  padding:
                    '6px 12px',
                  fontSize:
                    '0.8rem'
                }}
              >
                {copied ? (
                  <Check
                    size={16}
                    color="#10b981"
                  />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
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
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel animate-fadeIn"
            style={{
              width:
                '100%',
              maxWidth:
                '420px',
              padding:
                '24px',
              borderRadius:
                '24px',
              display:
                'flex',
              flexDirection:
                'column',
              gap: '16px'
            }}
          >
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
                style={{
                  width:
                    '28px',
                  height:
                    '28px'
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Partner Nickname:
              </label>

              <input
                type="text"
                value={partnerName}
                maxLength={40}
                onChange={(event) =>
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
                  color:
                    '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Secret PIN Code:
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={secretPin}
                maxLength={32}
                onChange={(event) =>
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
                  color:
                    '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    '#94a3b8'
                }}
              >
                Decoy PIN Code:
              </label>

              <input
                type="password"
                inputMode="numeric"
                value={decoyPin}
                maxLength={32}
                onChange={(event) =>
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
                  color:
                    '#fff',
                  marginTop:
                    '4px'
                }}
              />
            </div>

            <button
              onClick={() =>
                setMessages([])
              }
              className="btn-secondary"
              style={{
                color:
                  '#f43f5e',
                borderColor:
                  'rgba(244,63,94,0.3)',
                marginTop:
                  '8px'
              }}
            >
              <Trash2 size={16} />

              Purge All Chat Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SquareStopIcon() {
  return (
    <div
      style={{
        width: '12px',
        height: '12px',
        backgroundColor: '#fff',
        borderRadius: '2px'
      }}
    />
  );
}