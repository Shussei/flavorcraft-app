import React, { useEffect, useState } from 'react';

import CookbookFacade from './components/CookbookFacade';
import AuthModal from './components/AuthModal';
import DecoyGroceryList from './components/DecoyGroceryList';
import CommsVault from './components/CommsVault';
import CallModal from './components/CallModal';

import { callManager } from './services/CallManager';

const DEFAULT_PAIR_CODE = 'PAIR-1314';

export default function App() {
  const [appMode, setAppMode] = useState('cookbook');
  const [pairCode, setPairCode] = useState(() => {
    try {
      return localStorage.getItem('vault_pair_code') || DEFAULT_PAIR_CODE;
    } catch {
      return DEFAULT_PAIR_CODE;
    }
  });

  const handleUpdatePairCode = (newCode) => {
    const clean = String(newCode || '').trim().toUpperCase();
    if (clean) {
      setPairCode(clean);
      try {
        localStorage.setItem('vault_pair_code', clean);
      } catch (err) {
        console.warn('Failed to save pair code:', err);
      }
    }
  };

  const [secretPin, setSecretPin] = useState('1515');

  const [decoyPin, setDecoyPin] = useState('0000');

  const [callState, setCallState] = useState(null);

  const [isVideoCall, setIsVideoCall] = useState(false);

  const [localStream, setLocalStream] = useState(null);

  const [remoteStream, setRemoteStream] = useState(null);

  useEffect(() => {
    callManager.setCallbacks({
      onReady: (peerId) => {
        console.log('[Calls] Peer ready:', peerId);
      },
      onIncomingCall: (data) => {
        setIsVideoCall(Boolean(data?.isVideo));
        setCallState('incoming');
        setRemoteStream(null);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        setCallState('connected');
      },
      onCallEnded: () => {
        setCallState(null);
        setLocalStream(null);
        setRemoteStream(null);
      },
      onError: (error) => {
        console.error('[Calls] Call error:', error);
      }
    });
  }, []);

  const handlePanicLock = () => {
    callManager.endCall();

    setCallState(null);
    setLocalStream(null);
    setRemoteStream(null);

    setAppMode('cookbook');
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handlePanicLock();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && appMode === 'vault') {
        handlePanicLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [appMode]);

  const handleStartVoiceCall = async () => {
    try {
      setIsVideoCall(false);
      setCallState('outgoing');

      const stream = await callManager.callPeer(false);

      setLocalStream(stream);
    } catch (error) {
      console.error('Voice call failed:', error);

      setCallState(null);

      alert(error?.message || 'Unable to start the voice call.');
    }
  };

  const handleStartVideoCall = async () => {
    try {
      setIsVideoCall(true);
      setCallState('outgoing');

      const stream = await callManager.callPeer(true);

      setLocalStream(stream);
    } catch (error) {
      console.error('Video call failed:', error);

      setCallState(null);

      alert(error?.message || 'Unable to start the video call.');
    }
  };

  const handleAcceptCall = async () => {
    try {
      const stream = await callManager.answerCall(isVideoCall);

      setLocalStream(stream);
      setCallState('connected');
    } catch (error) {
      console.error('Accept call failed:', error);

      setCallState(null);

      alert(error?.message || 'Unable to accept the call.');
    }
  };

  const handleEndCall = () => {
    callManager.endCall();

    setCallState(null);
    setLocalStream(null);
    setRemoteStream(null);
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#0f1117'
      }}
    >
      {appMode === 'cookbook' && (
        <CookbookFacade
          onSecretTrigger={() => setAppMode('auth_modal')}
          secretPin={secretPin}
        />
      )}

      {appMode === 'auth_modal' && (
        <AuthModal
          onCancel={() => setAppMode('cookbook')}
          onUnlockSecret={() => setAppMode('vault')}
          onUnlockDecoy={() => setAppMode('decoy')}
          secretPin={secretPin}
          decoyPin={decoyPin}
        />
      )}

      {appMode === 'decoy' && (
        <DecoyGroceryList onLock={handlePanicLock} />
      )}

      {appMode === 'vault' && (
        <CommsVault
          pairCode={pairCode}
          setPairCode={handleUpdatePairCode}
          onPanicLock={handlePanicLock}
          onStartVoiceCall={handleStartVoiceCall}
          onStartVideoCall={handleStartVideoCall}
          secretPin={secretPin}
          setSecretPin={setSecretPin}
          decoyPin={decoyPin}
          setDecoyPin={setDecoyPin}
        />
      )}

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