import React, { useEffect, useState } from 'react';

import CookbookFacade from './components/CookbookFacade';
import AuthModal from './components/AuthModal';
import DecoyGroceryList from './components/DecoyGroceryList';
import CommsVault from './components/CommsVault';
import CallModal from './components/CallModal';

import { p2pManager } from './services/P2PManager';

const PAIR_CODE = 'PAIR-1314';

export default function App() {
  const [appMode, setAppMode] = useState('cookbook');

  const [secretPin, setSecretPin] =
    useState('1314');

  const [decoyPin, setDecoyPin] =
    useState('0000');

  const [callState, setCallState] =
    useState(null);

  const [isVideoCall, setIsVideoCall] =
    useState(false);

  const [localStream, setLocalStream] =
    useState(null);

  const [remoteStream, setRemoteStream] =
    useState(null);

  const handlePanicLock = () => {
    p2pManager.endCall();

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

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.hidden &&
        appMode === 'vault'
      ) {
        handlePanicLock();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [appMode]);

  /*
   * IMPORTANT:
   *
   * P2PManager is initialized by CommsVault.
   * App must NOT initialize it a second time.
   */

  const handleStartVoiceCall = async () => {
    try {
      setIsVideoCall(false);
      setCallState('outgoing');

      const stream =
        await p2pManager.callPeer(
          null,
          false
        );

      setLocalStream(stream);
    } catch (error) {
      console.error(
        'Voice call failed:',
        error
      );

      setCallState(null);

      alert(
        error?.message ||
        'Unable to start the voice call.'
      );
    }
  };

  const handleStartVideoCall = async () => {
    try {
      setIsVideoCall(true);
      setCallState('outgoing');

      const stream =
        await p2pManager.callPeer(
          null,
          true
        );

      setLocalStream(stream);
    } catch (error) {
      console.error(
        'Video call failed:',
        error
      );

      setCallState(null);

      alert(
        error?.message ||
        'Unable to start the video call.'
      );
    }
  };

  const handleAcceptCall = async () => {
    try {
      const stream =
        await p2pManager.answerCall(
          isVideoCall
        );

      setLocalStream(stream);
      setCallState('connected');
    } catch (error) {
      console.error(
        'Accept call failed:',
        error
      );

      setCallState(null);

      alert(
        error?.message ||
        'Unable to accept the call.'
      );
    }
  };

  const handleEndCall = () => {
    p2pManager.endCall();

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
          onSecretTrigger={() =>
            setAppMode('auth_modal')
          }
          secretPin={secretPin}
        />
      )}

      {appMode === 'auth_modal' && (
        <AuthModal
          onCancel={() =>
            setAppMode('cookbook')
          }
          onUnlockSecret={() =>
            setAppMode('vault')
          }
          onUnlockDecoy={() =>
            setAppMode('decoy')
          }
          secretPin={secretPin}
          decoyPin={decoyPin}
        />
      )}

      {appMode === 'decoy' && (
        <DecoyGroceryList
          onLock={handlePanicLock}
        />
      )}

      {appMode === 'vault' && (
        <CommsVault
          pairCode={PAIR_CODE}
          onPanicLock={handlePanicLock}
          onStartVoiceCall={
            handleStartVoiceCall
          }
          onStartVideoCall={
            handleStartVideoCall
          }
          secretPin={secretPin}
          setSecretPin={setSecretPin}
          decoyPin={decoyPin}
          setDecoyPin={setDecoyPin}
          callState={callState}
          setCallState={setCallState}
          setIsVideoCall={setIsVideoCall}
          setLocalStream={setLocalStream}
          setRemoteStream={setRemoteStream}
        />
      )}

      {callState && (
        <CallModal
          callState={callState}
          partnerName="My Love"
          isVideoCall={isVideoCall}
          onAcceptCall={
            handleAcceptCall
          }
          onEndCall={
            handleEndCall
          }
          onPanicLock={
            handlePanicLock
          }
          localStream={localStream}
          remoteStream={remoteStream}
        />
      )}
    </div>
  );
}