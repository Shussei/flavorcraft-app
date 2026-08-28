import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Video, VideoOff, 
  ShieldCheck, Lock, Wifi
} from 'lucide-react';
import { ringtoneSynth } from '../services/RingtoneSynth';

export default function CallModal({ 
  callState, // 'incoming' | 'outgoing' | 'connected'
  partnerName = 'My Love',
  isVideoCall = false,
  onAcceptCall,
  onEndCall,
  onPanicLock,
  localStream,
  remoteStream
}) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(isVideoCall);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Play ringtone sounds based on state
  useEffect(() => {
    if (callState === 'incoming') {
      ringtoneSynth.startIncomingRing();
    } else if (callState === 'outgoing') {
      ringtoneSynth.startOutgoingDialTone();
    } else if (callState === 'connected') {
      ringtoneSynth.playCallConnected();
    }

    return () => {
      ringtoneSynth.stopRingtone();
    };
  }, [callState]);

  // Duration timer for active call
  useEffect(() => {
    let timer = null;
    if (callState === 'connected') {
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Bind WebRTC Video Streams to HTML5 Video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOn]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    ringtoneSynth.playCallEnded();
    onEndCall();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      backgroundColor: '#090b0f', color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '32px 24px'
    }}>
      {/* Top Bar with Encrypted Wi-Fi Badge & Panic Lock */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px', borderRadius: '20px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#10b981', fontSize: '0.8rem', fontWeight: 600
        }}>
          <Wifi size={14} /> Wi-Fi Encrypted Voice
        </div>

        <button 
          onClick={onPanicLock}
          className="btn-icon"
          title="Instant Panic Lock (Return to Recipes)"
          style={{ backgroundColor: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.4)' }}
        >
          <Lock size={18} color="#f43f5e" />
        </button>
      </div>

      {/* Main Video or Audio Avatar Section */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '20px',
        position: 'relative'
      }}>

        {/* Video Call Streams */}
        {isVideoOn && callState === 'connected' ? (
          <div style={{
            position: 'relative', width: '100%', maxWidth: '500px', height: '360px',
            borderRadius: '24px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            {/* Remote Partner Video */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Local Self Video (PiP) */}
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              style={{
                position: 'absolute', bottom: '16px', right: '16px',
                width: '100px', height: '140px', borderRadius: '16px',
                objectFit: 'cover', border: '2px solid #f97316'
              }}
            />
          </div>
        ) : (
          /* Voice Call Avatar Display */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div className={callState === 'incoming' ? 'pulse-accept' : ''} style={{
              width: '120px', height: '120px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(249, 115, 22, 0.4)',
              fontSize: '3rem', fontWeight: 800, color: '#fff'
            }}>
              {partnerName.charAt(0)}
            </div>

            <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{partnerName}</h2>

            <span style={{ fontSize: '0.95rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {callState === 'incoming' && 'Incoming Wi-Fi Call...'}
              {callState === 'outgoing' && 'Calling partner over Wi-Fi...'}
              {callState === 'connected' && (
                <>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>{formatDuration(duration)}</span>
                  <span>•</span>
                  <span>AES-256 E2E Secure</span>
                </>
              )}
            </span>

            {/* Audio Visualizer Wavebars for Connected Call */}
            {callState === 'connected' && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '30px', marginTop: '10px' }}>
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
                <div className="wave-bar" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Call Action Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        
        {/* Call Controls Bar (Mute, Speaker, Video) */}
        {callState === 'connected' && (
          <div style={{
            display: 'flex', gap: '16px', padding: '12px 24px', borderRadius: '24px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="btn-icon"
              style={{ backgroundColor: isMuted ? '#f43f5e' : 'rgba(255, 255, 255, 0.1)' }}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button 
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className="btn-icon"
              style={{ backgroundColor: !isSpeakerOn ? '#f43f5e' : 'rgba(255, 255, 255, 0.1)' }}
            >
              {isSpeakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            <button 
              onClick={() => setIsVideoOn(!isVideoOn)}
              className="btn-icon"
              style={{ backgroundColor: isVideoOn ? '#f97316' : 'rgba(255, 255, 255, 0.1)' }}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          </div>
        )}

        {/* Call Accept / Decline / End Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          
          {callState === 'incoming' ? (
            <>
              {/* Decline Button */}
              <button 
                onClick={handleEndCall}
                style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  backgroundColor: '#f43f5e', border: 'none', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(244, 63, 94, 0.5)'
                }}
              >
                <PhoneOff size={28} />
              </button>

              {/* Accept Button */}
              <button 
                onClick={onAcceptCall}
                className="pulse-accept"
                style={{
                  width: '68px', height: '68px', borderRadius: '50%',
                  backgroundColor: '#10b981', border: 'none', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.5)'
                }}
              >
                <Phone size={28} />
              </button>
            </>
          ) : (
            /* End Call Button */
            <button 
              onClick={handleEndCall}
              style={{
                width: '68px', height: '68px', borderRadius: '50%',
                backgroundColor: '#f43f5e', border: 'none', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 4px 20px rgba(244, 63, 94, 0.5)'
              }}
            >
              <PhoneOff size={28} />
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
