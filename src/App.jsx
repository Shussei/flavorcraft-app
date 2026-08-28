import React, { useState, useEffect } from 'react';
import CookbookFacade from './components/CookbookFacade';
import AuthModal from './components/AuthModal';
import DecoyGroceryList from './components/DecoyGroceryList';
import CommsVault from './components/CommsVault';
import CallModal from './components/CallModal';
import { p2pManager } from './services/P2PManager';

export default function App() {
  // Navigation State: 'cookbook' | 'auth_modal' | 'decoy' | 'vault'
  const [appMode, setAppMode] = useState('cookbook');

  // Custom PIN Codes
  const [secretPin, setSecretPin] = useState('1314');
  const [decoyPin, setDecoyPin] = useState('0000');

  // Call State: null | 'incoming' | 'outgoing' | 'connected'
  const [callState, setCallState] = useState(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Global Panic Lock Handler (Instantly returns to Cookbook facade)
  const handlePanicLock = () => {
    p2pManager.endCall();
    setCallState(null);
    setAppMode('cookbook');
  };

  // Keyboard shortcut listener (Escape key for Panic Lock)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handlePanicLock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for browser tab blur/hidden event for auto-lock security
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && appMode === 'vault') {
        handlePanicLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [appMode]);

  // Setup Call Callbacks
  useEffect(() => {
    p2pManager.init('PAIR-1314', {
      onIncomingCall: (data) => {
        setIsVideoCall(!!data.isVideo);
        setCallState('incoming');
      },
      onCallAccepted: () => {
        setCallState('connected');
      },
      onCallEnded: () => {
        setCallState(null);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      }
    });
  }, []);

  // Start Voice Call
  const handleStartVoiceCall = async () => {
    setIsVideoCall(false);
    setCallState('outgoing');
    const stream = await p2pManager.callPeer('PAIR-1314', false);
    setLocalStream(stream);
  };

  // Start Video Call
  const handleStartVideoCall = async () => {
    setIsVideoCall(true);
    setCallState('outgoing');
    const stream = await p2pManager.callPeer('PAIR-1314', true);
    setLocalStream(stream);
  };

  // Accept Incoming Call
  const handleAcceptCall = () => {
    p2pManager.answerCall(isVideoCall);
    setCallState('connected');
  };

  // End Active Call
  const handleEndCall = () => {
    p2pManager.endCall();
    setCallState(null);
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#0f1117' }}>
      
      {/* 1. Fake Front Facade (FlavorCraft Cookbook) */}
      {appMode === 'cookbook' && (
        <CookbookFacade 
          onSecretTrigger={() => setAppMode('auth_modal')}
          secretPin={secretPin}
        />
      )}

      {/* 2. Disguised Security Keypad Authentication Gate */}
      {appMode === 'auth_modal' && (
        <AuthModal 
          onCancel={() => setAppMode('cookbook')}
          onUnlockSecret={() => setAppMode('vault')}
          onUnlockDecoy={() => setAppMode('decoy')}
          secretPin={secretPin}
          decoyPin={decoyPin}
        />
      )}

      {/* 3. Decoy Mode (Harmless Weekly Grocery Notes) */}
      {appMode === 'decoy' && (
        <DecoyGroceryList 
          onLock={handlePanicLock}
        />
      )}

      {/* 4. Secret Communication Hub (Encrypted Chat & Voice Notes) */}
      {appMode === 'vault' && (
        <CommsVault 
          onPanicLock={handlePanicLock}
          onStartVoiceCall={handleStartVoiceCall}
          onStartVideoCall={handleStartVideoCall}
          secretPin={secretPin}
          setSecretPin={setSecretPin}
          decoyPin={decoyPin}
          setDecoyPin={setDecoyPin}
        />
      )}

      {/* 5. Wi-Fi / Internet Voice & Video Calling Screen */}
      {callState && (
        <CallModal 
          callState={callState}
          partnerName="My Love"
          isVideoCall={isVideoCall}
          onAcceptCall={handleAcceptCall}
          onEndCall={handleEndCall}
          onPanicLock={handlePanicLock}
          localStream={localStream}
          remoteStream={remoteStream}
        />
      )}

    </div>
  );
}
