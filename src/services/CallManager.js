import Peer from 'peerjs';
import { chatPersistence } from './ChatPersistence';

function getSignalConfig() {
  const rawHost = import.meta.env.VITE_SIGNAL_HOST || '';
  const host = rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const port = Number(import.meta.env.VITE_SIGNAL_PORT) || 443;
  const path = import.meta.env.VITE_SIGNAL_PATH || '/peerjs';
  const override = String(import.meta.env.VITE_SIGNAL_SECURE || '').toLowerCase();

  let secure;
  if (override === 'true') {
    secure = true;
  } else if (override === 'false') {
    secure = false;
  } else {
    secure = port === 443;
  }

  return { host, port, path, secure };
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

class CallManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.partnerPeerId = null;
    this.mediaCall = null;
    this.localStream = null;
    this.remoteStream = null;
    this.destroying = false;
    this.reconnectTimer = null;

    this.callbacks = {
      onReady: () => {},
      onIncomingCall: () => {},
      onRemoteStream: () => {},
      onCallEnded: () => {},
      onError: () => {}
    };
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks
    };
  }

  init() {
    this.cleanup();
    this.destroying = false;

    const config = getSignalConfig();

    if (!config.host) {
      Promise.resolve().then(() => {
        this.callbacks.onError(new Error('VITE_SIGNAL_HOST is not configured'));
      });
      return null;
    }

    this.peerId = window.crypto?.randomUUID
      ? `vault-${window.crypto.randomUUID()}`
      : `vault-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      this.peer = new Peer(this.peerId, {
        debug: 0,
        host: config.host,
        port: config.port,
        path: config.path,
        secure: config.secure,
        config: { iceServers: ICE_SERVERS }
      });
      this.registerPeerEvents();
    } catch (error) {
      this.callbacks.onError(error);
      return null;
    }

    return this.peerId;
  }

  registerPeerEvents() {
    this.peer.on('open', async () => {
      if (this.destroying) {
        return;
      }

      await chatPersistence.registerPeerId(this.peerId).catch(() => {});
      this.callbacks.onReady(this.peerId);
    });

    this.peer.on('call', (call) => {
      if (this.destroying) {
        call.close();
        return;
      }

      if (this.mediaCall) {
        call.close();
        return;
      }

      this.mediaCall = call;
      this.attachMediaCallHandlers(call);

      this.callbacks.onIncomingCall({
        isVideo: Boolean(call.metadata?.isVideo),
        callerId: call.peer
      });
    });

    this.peer.on('disconnected', () => {
      if (this.destroying) {
        return;
      }
      this.scheduleReconnect();
    });

    this.peer.on('close', () => {
      if (!this.destroying) {
        this.scheduleReconnect();
      }
    });

    this.peer.on('error', (error) => {
      if (this.destroying) {
        return;
      }

      const reconnectTypes = ['network', 'socket-error', 'socket-closed'];
      if (reconnectTypes.includes(error?.type)) {
        this.scheduleReconnect();
        return;
      }

      this.callbacks.onError(error);
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.destroying || !this.peer || this.peer.destroyed) {
        return;
      }

      if (!this.peer.disconnected) {
        return;
      }

      try {
        this.peer.reconnect();
      } catch (error) {
        this.callbacks.onError(error);
      }
    }, 2000);
  }

  async startLocalMedia(video = false) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media capture is not available in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video
    });

    this.localStream = stream;
    return stream;
  }

  attachMediaCallHandlers(call) {
    call.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;
      this.callbacks.onRemoteStream(remoteStream);
    });

    call.on('close', () => {
      if (this.mediaCall === call) {
        this.endCall();
      }
    });

    call.on('error', () => {
      if (this.mediaCall === call) {
        this.endCall();
        this.callbacks.onError(new Error('Call connection failed'));
      }
    });
  }

  async callPeer(isVideo = false) {
    const target = this.partnerPeerId;

    if (!target) {
      throw new Error('Partner is not online');
    }

    if (!this.peer || this.peer.destroyed) {
      throw new Error('Call service is not ready');
    }

    if (this.mediaCall) {
      throw new Error('A call is already in progress');
    }

    const stream = await this.startLocalMedia(isVideo);

    const call = this.peer.call(target, stream, {
      metadata: { isVideo }
    });

    this.mediaCall = call;
    this.attachMediaCallHandlers(call);

    return stream;
  }

  async answerCall(isVideo = false) {
    if (!this.mediaCall) {
      throw new Error('No incoming call to answer');
    }

    const stream = await this.startLocalMedia(isVideo);

    try {
      this.mediaCall.answer(stream);
    } catch (error) {
      this.endCall();
      throw error;
    }

    return stream;
  }

  endCall() {
    if (this.mediaCall) {
      try {
        this.mediaCall.close();
      } catch {
        // Already closed.
      }
      this.mediaCall = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStream = null;
    this.callbacks.onCallEnded();
  }

  toggleMicrophone(enabled) {
    if (!this.localStream) {
      return;
    }
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  toggleCamera(enabled) {
    if (!this.localStream) {
      return;
    }
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  setPartnerPeerId(peerId) {
    this.partnerPeerId = peerId || null;
  }

  async syncPeerId() {
    if (this.peerId) {
      await chatPersistence.registerPeerId(this.peerId).catch(() => {});
    }
  }

  cleanup() {
    this.destroying = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.endCall();

    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore cleanup errors.
      }
    }

    this.peer = null;
    this.peerId = null;
    this.partnerPeerId = null;
    this.destroying = false;
  }
}

export const callManager = new CallManager();