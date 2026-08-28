import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Phone, Video, Mic, MicOff, Image as ImageIcon, Lock, Shield, 
  Clock, Settings, Copy, Check, Trash2, EyeOff, User, Sparkles, AlertCircle, X, Play, Pause
} from 'lucide-react';
import { cryptoEngine } from '../services/CryptoEngine';
import { p2pManager } from '../services/P2PManager';

export default function CommsVault({ 
  onPanicLock, 
  onStartVoiceCall, 
  onStartVideoCall,
  secretPin,
  setSecretPin,
  decoyPin,
  setDecoyPin
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome-msg',
      sender: 'partner',
      text: 'Hey love! I am on the secret app now. Comms are safe and encrypted. ❤️',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
      ttl: null
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [partnerName, setPartnerName] = useState('My Love');
  const [pairCode, setPairCode] = useState('PAIR-1314');
  const [isPaired, setIsPaired] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [ephemeralTimer, setEphemeralTimer] = useState(null); // null | 10 | 30 | 300 | 3600

  // Voice Note Recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize P2P connection listener
  useEffect(() => {
    p2pManager.init(pairCode, {
      onConnect: () => setIsPaired(true),
      onDisconnect: () => setIsPaired(false),
      onMessage: async (incomingMsg) => {
        let decryptedText = incomingMsg.text;
        if (incomingMsg.text && incomingMsg.encrypted) {
          decryptedText = await cryptoEngine.decrypt(incomingMsg.text);
        }
        const newMsg = { ...incomingMsg, text: decryptedText, sender: 'partner' };
        setMessages(prev => [...prev, newMsg]);
        scheduleSelfDestruct(newMsg);
      }
    });
  }, [pairCode]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Self Destruct Timer scheduler
  const scheduleSelfDestruct = (msg) => {
    if (msg.ttl) {
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
      }, msg.ttl * 1000);
    }
  };

  // Send Text Message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const rawText = inputText.trim();
    setInputText('');

    const encryptedText = await cryptoEngine.encrypt(rawText);
    const msgObject = {
      id: `msg-${Date.now()}`,
      sender: 'me',
      text: rawText,
      encryptedText: encryptedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
      ttl: ephemeralTimer
    };

    setMessages(prev => [...prev, msgObject]);
    scheduleSelfDestruct(msgObject);

    // Send encrypted over P2P network
    p2pManager.sendMessage({
      ...msgObject,
      text: encryptedText,
      encrypted: true
    });
  };

  // Start Voice Note Recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          const msgObject = {
            id: `msg-${Date.now()}`,
            sender: 'me',
            audioUrl: base64Audio,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'voice',
            ttl: ephemeralTimer
          };
          setMessages(prev => [...prev, msgObject]);
          scheduleSelfDestruct(msgObject);
          p2pManager.sendMessage(msgObject);
        };
      };

      mediaRecorderRef.current.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access is required for voice notes.');
    }
  };

  // Stop Voice Note Recording
  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  // Handle Photo/Image Upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64Image = reader.result;
      const msgObject = {
        id: `msg-${Date.now()}`,
        sender: 'me',
        imageUrl: base64Image,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'image',
        ttl: ephemeralTimer
      };
      setMessages(prev => [...prev, msgObject]);
      scheduleSelfDestruct(msgObject);
      p2pManager.sendMessage(msgObject);
    };
  };

  const copyPairCode = () => {
    navigator.clipboard.writeText(pairCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f1117', color: '#f8fafc', overflow: 'hidden'
    }}>
      {/* Top Header Bar */}
      <header style={{
        padding: '14px 20px', backgroundColor: 'rgba(22, 25, 34, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 20
      }}>
        {/* Partner Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.2rem', color: '#fff', position: 'relative'
          }}>
            {partnerName.charAt(0)}
            <span style={{
              position: 'absolute', bottom: '0', right: '0',
              width: '12px', height: '12px', borderRadius: '50%',
              backgroundColor: isPaired ? '#10b981' : '#f59e0b',
              border: '2px solid #161922'
            }} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{partnerName}</h3>
            <span style={{ fontSize: '0.75rem', color: isPaired ? '#10b981' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Shield size={12} /> {isPaired ? 'P2P Encrypted Comms' : 'Connecting Wi-Fi...'}
            </span>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Pair Code Link Button */}
          <button 
            onClick={() => setShowPairModal(true)}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
          >
            <Sparkles size={14} color="#f97316" /> {pairCode}
          </button>

          {/* Wi-Fi Voice Call Button */}
          <button 
            onClick={onStartVoiceCall}
            className="btn-icon"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981' }}
            title="Start Wi-Fi Voice Call"
          >
            <Phone size={18} />
          </button>

          {/* Video Call Button */}
          <button 
            onClick={onStartVideoCall}
            className="btn-icon"
            style={{ backgroundColor: 'rgba(249, 115, 22, 0.2)', border: '1px solid rgba(249, 115, 22, 0.4)', color: '#f97316' }}
            title="Start HD Video Call"
          >
            <Video size={18} />
          </button>

          {/* Settings */}
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="btn-icon"
          >
            <Settings size={18} />
          </button>

          {/* PANIC LOCK BUTTON */}
          <button 
            onClick={onPanicLock}
            className="btn-icon"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.4)', color: '#f43f5e' }}
            title="Instant Panic Lock (Return to Recipe Book)"
          >
            <Lock size={18} />
          </button>
        </div>
      </header>

      {/* Ephemeral Self-Destruct Timer Bar */}
      <div style={{
        padding: '6px 16px', backgroundColor: 'rgba(15, 17, 23, 0.8)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
        fontSize: '0.775rem', color: '#94a3b8'
      }}>
        <Clock size={13} color="#f97316" />
        <span>Self-Destruct Timer:</span>
        {[
          { label: 'Off', val: null },
          { label: '10s', val: 10 },
          { label: '30s', val: 30 },
          { label: '5m', val: 300 },
          { label: '1h', val: 3600 }
        ].map(t => (
          <button
            key={t.label}
            onClick={() => setEphemeralTimer(t.val)}
            style={{
              padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
              backgroundColor: ephemeralTimer === t.val ? '#f97316' : 'transparent',
              color: ephemeralTimer === t.val ? '#fff' : '#64748b',
              border: 'none', cursor: 'pointer', transition: '0.15s ease'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chat Feed */}
      <main style={{
        flex: 1, padding: '20px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '16px',
        backgroundImage: 'radial-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}>
        {messages.map((msg) => {
          const isMe = msg.sender === 'me';
          return (
            <div 
              key={msg.id}
              style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '80%', alignSelf: isMe ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{
                padding: '12px 16px', borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                background: isMe ? 'linear-gradient(135deg, #ea580c, #c2410c)' : 'rgba(30, 34, 48, 0.85)',
                border: isMe ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff', fontSize: '0.925rem', lineHeight: 1.4,
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)', position: 'relative'
              }}>
                
                {/* Text Message */}
                {msg.type === 'text' && <div>{msg.text}</div>}

                {/* Voice Note Message */}
                {msg.type === 'voice' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <audio controls src={msg.audioUrl} style={{ height: '36px', width: '220px' }} />
                  </div>
                )}

                {/* Image Attachment Message */}
                {msg.type === 'image' && (
                  <img 
                    src={msg.imageUrl} 
                    alt="attachment" 
                    style={{ maxWidth: '240px', borderRadius: '12px', display: 'block' }} 
                  />
                )}

                {/* Ephemeral Timer Badge */}
                {msg.ttl && (
                  <div style={{
                    fontSize: '0.65rem', color: isMe ? 'rgba(255,255,255,0.7)' : '#f97316',
                    marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px'
                  }}>
                    <Clock size={10} /> Disappears in {msg.ttl}s
                  </div>
                )}
              </div>

              <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px', padding: '0 4px' }}>
                {msg.timestamp}
              </span>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </main>

      {/* Input Bar */}
      <footer style={{
        padding: '14px 20px', backgroundColor: 'rgba(22, 25, 34, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          onChange={handleImageUpload} 
          style={{ display: 'none' }} 
        />

        {/* Photo Upload Button */}
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="btn-icon" style={{ width: '40px', height: '40px' }}
          title="Send Photo"
        >
          <ImageIcon size={18} color="#94a3b8" />
        </button>

        {/* Voice Note Button */}
        {isRecordingVoice ? (
          <button 
            onClick={stopVoiceRecording}
            className="pulse-record"
            style={{
              padding: '0 16px', height: '40px', borderRadius: '12px',
              backgroundColor: '#f43f5e', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <SquareStopIcon /> Stop ({recordingSeconds}s)
          </button>
        ) : (
          <button 
            onClick={startVoiceRecording}
            className="btn-icon" style={{ width: '40px', height: '40px' }}
            title="Record Voice Note"
          >
            <Mic size={18} color="#94a3b8" />
          </button>
        )}

        {/* Text Input Form */}
        <form onSubmit={handleSendMessage} style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input 
            type="text"
            placeholder="Type encrypted message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff', fontSize: '0.925rem', outline: 'none'
            }}
          />
          <button 
            type="submit"
            className="btn-primary"
            style={{ padding: '0 18px', borderRadius: '16px' }}
          >
            <Send size={18} />
          </button>
        </form>
      </footer>

      {/* Pair Code Modal */}
      {showPairModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel animate-fadeIn" style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>P2P Room Pairing</h3>
              <button onClick={() => setShowPairModal(false)} className="btn-icon" style={{ width: '28px', height: '28px' }}><X size={14} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px' }}>
              Share this secret code with your partner to pair both phones for Wi-Fi calling & chat:
            </p>
            <div style={{
              padding: '16px', borderRadius: '16px', backgroundColor: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 800, color: '#f97316'
            }}>
              <span>{pairCode}</span>
              <button onClick={copyPairCode} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel animate-fadeIn" style={{ width: '100%', maxWidth: '420px', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Secret Vault Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} className="btn-icon" style={{ width: '28px', height: '28px' }}><X size={14} /></button>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Partner Nickname:</label>
              <input 
                type="text" 
                value={partnerName} 
                onChange={(e) => setPartnerName(e.target.value)} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginTop: '4px' }} 
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Secret PIN Code:</label>
              <input 
                type="text" 
                value={secretPin} 
                onChange={(e) => setSecretPin(e.target.value)} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginTop: '4px' }} 
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Decoy PIN Code:</label>
              <input 
                type="text" 
                value={decoyPin} 
                onChange={(e) => setDecoyPin(e.target.value)} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginTop: '4px' }} 
              />
            </div>

            <button 
              onClick={() => setMessages([])} 
              className="btn-secondary" 
              style={{ color: '#f43f5e', borderColor: 'rgba(244,63,94,0.3)', marginTop: '8px' }}
            >
              <Trash2 size={16} /> Purge All Chat Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SquareStopIcon() {
  return <div style={{ width: '12px', height: '12px', backgroundColor: '#fff', borderRadius: '2px' }} />;
}
