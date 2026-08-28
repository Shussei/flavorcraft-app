import Peer from 'peerjs';

const rawSignalHost = import.meta.env.VITE_SIGNAL_HOST || '';

/*
 * Defensive normalization:
 * Vercel should contain only:
 *
 * flavorcraft-app.onrender.com
 *
 * But stripping a protocol here prevents a configuration typo
 * from breaking PeerJS.
 */
const SIGNAL_SERVER_HOST = rawSignalHost
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

const SIGNAL_SERVER_PORT =
  Number(import.meta.env.VITE_SIGNAL_PORT) || 443;

const SIGNAL_SERVER_PATH =
  import.meta.env.VITE_SIGNAL_PATH || '/peerjs';

const SIGNAL_ORIGIN = SIGNAL_SERVER_HOST
  ? `https://${SIGNAL_SERVER_HOST}`
  : '';

const PAIRING_INTERVAL_MS = 2000;

function createPeerId() {
  if (window.crypto?.randomUUID) {
    return `vault-${window.crypto.randomUUID()}`;
  }

  return `vault-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

class P2PManager {
  constructor() {
    this.peer = null;
    this.peerId = null;

    this.pairCode = null;
    this.partnerPeerId = null;

    this.conn = null;
    this.mediaCall = null;

    this.localStream = null;
    this.remoteStream = null;

    this.pairingTimer = null;
    this.connectionAttemptedFor = null;

    this.callbacks = {
      onConnect: () => { },
      onDisconnect: () => { },
      onMessage: () => { },
      onIncomingCall: () => { },
      onCallAccepted: () => { },
      onCallEnded: () => { },
      onRemoteStream: () => { },
      onError: () => { }
    };
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = {
      ...this.callbacks,
      ...callbacks
    };
  }

  init(pairCode, callbacks = {}) {
    this.cleanup();

    this.pairCode = String(pairCode || '').trim();

    this.setCallbacks(callbacks);

    if (!this.pairCode) {
      this.callbacks.onError(
        new Error('Pair code is required')
      );
      return null;
    }

    if (!SIGNAL_SERVER_HOST) {
      const error = new Error(
        'VITE_SIGNAL_HOST is not configured'
      );

      console.error(error);
      this.callbacks.onError(error);

      return null;
    }

    this.peerId = createPeerId();

    const peerConfig = {
      debug: 2,

      host: SIGNAL_SERVER_HOST,
      port: SIGNAL_SERVER_PORT,
      path: SIGNAL_SERVER_PATH,
      secure: true,

      config: {
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302'
          },
          {
            urls: 'stun:stun1.l.google.com:19302'
          }
        ]
      }
    };

    console.log(
      '[P2P] Creating peer:',
      this.peerId
    );

    console.log(
      '[P2P] Signal server:',
      `https://${SIGNAL_SERVER_HOST}${SIGNAL_SERVER_PATH}`
    );

    try {
      this.peer = new Peer(
        this.peerId,
        peerConfig
      );

      this.registerPeerEvents();
    } catch (error) {
      console.error(
        '[P2P] Peer initialization failed:',
        error
      );

      this.callbacks.onError(error);
    }

    return this.peerId;
  }

  registerPeerEvents() {
    if (!this.peer) return;

    this.peer.on('open', async (id) => {
      this.peerId = id;

      console.log(
        '[P2P] Connected to PeerServer:',
        id
      );

      await this.registerPairing();

      this.startPairingPolling();
    });

    this.peer.on('connection', (connection) => {
      console.log(
        '[P2P] Incoming data connection from:',
        connection.peer
      );

      /*
       * Only accept connections belonging to the current pairing.
       */
      if (
        this.partnerPeerId &&
        connection.peer !== this.partnerPeerId
      ) {
        console.warn(
          '[P2P] Ignoring unexpected peer:',
          connection.peer
        );

        connection.close();
        return;
      }

      this.partnerPeerId = connection.peer;

      this.setupDataConnection(connection);
    });

    this.peer.on('call', (call) => {
      console.log(
        '[P2P] Incoming media call from:',
        call.peer
      );

      if (
        this.partnerPeerId &&
        call.peer !== this.partnerPeerId
      ) {
        call.close();
        return;
      }

      this.partnerPeerId = call.peer;
      this.mediaCall = call;

      this.callbacks.onIncomingCall({
        isVideo: Boolean(call.metadata?.isVideo),
        callerId: call.peer
      });
    });

    this.peer.on('disconnected', () => {
      console.warn(
        '[P2P] Disconnected from PeerServer'
      );

      this.callbacks.onDisconnect();

      /*
       * PeerJS supports reconnecting an existing peer ID.
       */
      if (this.peer && !this.peer.destroyed) {
        setTimeout(() => {
          try {
            this.peer.reconnect();
          } catch (error) {
            console.error(
              '[P2P] Reconnect failed:',
              error
            );
          }
        }, 1500);
      }
    });

    this.peer.on('close', () => {
      console.warn('[P2P] Peer closed');

      this.callbacks.onDisconnect();
    });

    this.peer.on('error', (error) => {
      console.error(
        '[P2P] PeerJS error:',
        error.type,
        error
      );

      this.callbacks.onError(error);

      if (
        error.type === 'unavailable-id' ||
        error.type === 'invalid-id'
      ) {
        this.callbacks.onDisconnect();
      }
    });
  }

  async registerPairing() {
    if (!SIGNAL_ORIGIN || !this.pairCode || !this.peerId) {
      return;
    }

    try {
      const response = await fetch(
        `${SIGNAL_ORIGIN}/pair/join`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pairCode: this.pairCode,
            peerId: this.peerId
          })
        }
      );

      if (!response.ok) {
        const body = await response.text();

        throw new Error(
          `Pairing server returned ${response.status}: ${body}`
        );
      }

      const result = await response.json();

      this.processDiscoveredPeers(result.peers || []);
    } catch (error) {
      console.error(
        '[P2P] Pairing registration failed:',
        error
      );

      this.callbacks.onError(error);
    }
  }

  startPairingPolling() {
    this.stopPairingPolling();

    this.pairingTimer = setInterval(() => {
      this.pollPairing();
    }, PAIRING_INTERVAL_MS);
  }

  stopPairingPolling() {
    if (this.pairingTimer) {
      clearInterval(this.pairingTimer);
      this.pairingTimer = null;
    }
  }

  async pollPairing() {
    if (
      !SIGNAL_ORIGIN ||
      !this.pairCode ||
      !this.peerId
    ) {
      return;
    }

    try {
      const url =
        `${SIGNAL_ORIGIN}/pair/` +
        `${encodeURIComponent(this.pairCode)}` +
        `?peerId=${encodeURIComponent(this.peerId)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Pairing poll returned ${response.status}`
        );
      }

      const result = await response.json();

      this.processDiscoveredPeers(result.peers || []);
    } catch (error) {
      console.error(
        '[P2P] Pairing poll failed:',
        error
      );
    }
  }

  processDiscoveredPeers(peers) {
    const candidates = peers.filter(
      (id) =>
        id &&
        id !== this.peerId
    );

    if (candidates.length === 0) {
      this.callbacks.onDisconnect();
      return;
    }

    /*
     * Deterministic initiator:
     *
     * Only the lexicographically smaller peer ID
     * initiates the data connection.
     *
     * This prevents both phones from simultaneously
     * creating duplicate connections.
     */
    candidates.sort();

    const targetPeerId = candidates[0];

    this.partnerPeerId = targetPeerId;

    if (
      this.conn?.open &&
      this.conn.peer === targetPeerId
    ) {
      return;
    }

    if (
      this.peerId &&
      this.peerId < targetPeerId
    ) {
      this.connectToPeer(targetPeerId);
    }
  }

  connectToPeer(targetPeerId) {
    if (
      !this.peer ||
      this.peer.destroyed ||
      !targetPeerId
    ) {
      return;
    }

    if (
      this.conn?.open &&
      this.conn.peer === targetPeerId
    ) {
      return;
    }

    if (
      this.connectionAttemptedFor === targetPeerId
    ) {
      return;
    }

    this.connectionAttemptedFor = targetPeerId;
    this.partnerPeerId = targetPeerId;

    console.log(
      '[P2P] Connecting to:',
      targetPeerId
    );

    try {
      const connection = this.peer.connect(
        targetPeerId,
        {
          reliable: true,
          serialization: 'json',
          metadata: {
            pairCode: this.pairCode
          }
        }
      );

      this.setupDataConnection(connection);
    } catch (error) {
      this.connectionAttemptedFor = null;

      console.error(
        '[P2P] Connection attempt failed:',
        error
      );

      this.callbacks.onError(error);
    }
  }

  setupDataConnection(connection) {
    if (!connection) return;

    connection.on('open', () => {
      console.log(
        '[P2P] Data connection OPEN:',
        connection.peer
      );

      this.conn = connection;
      this.partnerPeerId = connection.peer;
      this.connectionAttemptedFor = connection.peer;

      this.callbacks.onConnect({
        peerId: connection.peer
      });
    });

    connection.on('data', (data) => {
      this.handleIncomingData(data);
    });

    connection.on('close', () => {
      if (
        this.conn === connection
      ) {
        this.conn = null;
      }

      this.connectionAttemptedFor = null;

      console.warn(
        '[P2P] Data connection closed'
      );

      this.callbacks.onDisconnect();
    });

    connection.on('error', (error) => {
      console.error(
        '[P2P] Data connection error:',
        error
      );

      if (this.conn === connection) {
        this.conn = null;
      }

      this.connectionAttemptedFor = null;

      this.callbacks.onDisconnect();
      this.callbacks.onError(error);
    });
  }

  handleIncomingData(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    switch (data.type) {
      case 'CALL_REQUEST':
        this.callbacks.onIncomingCall(data);
        break;

      case 'CALL_ACCEPT':
        this.callbacks.onCallAccepted(data);
        break;

      case 'CALL_REJECT':
      case 'CALL_END':
        this.callbacks.onCallEnded(data);
        break;

      default:
        this.callbacks.onMessage(data);
    }
  }

  sendMessage(message) {
    if (
      !this.conn ||
      !this.conn.open
    ) {
      console.warn(
        '[P2P] Message not sent: no open data connection'
      );

      return false;
    }

    try {
      this.conn.send({
        ...message,
        senderId: this.peerId
      });

      return true;
    } catch (error) {
      console.error(
        '[P2P] Failed to send message:',
        error
      );

      return false;
    }
  }

  async startLocalMedia(video = false) {
    if (
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error(
        'Media capture is not available in this browser'
      );
    }

    this.localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video
      });

    return this.localStream;
  }

  async callPeer(
    targetPeerId = null,
    isVideo = false
  ) {
    const target =
      targetPeerId ||
      this.partnerPeerId;

    if (!target) {
      throw new Error(
        'No paired device is connected'
      );
    }

    if (
      !this.peer ||
      this.peer.destroyed
    ) {
      throw new Error(
        'Peer connection is not initialized'
      );
    }

    const stream =
      await this.startLocalMedia(isVideo);

    const call =
      this.peer.call(
        target,
        stream,
        {
          metadata: {
            isVideo
          }
        }
      );

    this.mediaCall = call;

    call.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;

      this.callbacks.onRemoteStream(
        remoteStream
      );

      this.callbacks.onCallAccepted({
        peerId: target
      });
    });

    call.on('close', () => {
      this.callbacks.onCallEnded();
    });

    call.on('error', (error) => {
      console.error(
        '[P2P] Media call error:',
        error
      );

      this.callbacks.onCallEnded();
      this.callbacks.onError(error);
    });

    return stream;
  }

  async answerCall(isVideo = false) {
    if (!this.mediaCall) {
      throw new Error(
        'No incoming call to answer'
      );
    }

    const stream =
      await this.startLocalMedia(isVideo);

    this.mediaCall.answer(stream);

    this.mediaCall.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;

      this.callbacks.onRemoteStream(
        remoteStream
      );
    });

    this.mediaCall.on('close', () => {
      this.callbacks.onCallEnded();
    });

    return stream;
  }

  endCall() {
    if (this.mediaCall) {
      try {
        this.mediaCall.close();
      } catch {
        // Ignore already closed media connections.
      }

      this.mediaCall = null;
    }

    if (this.localStream) {
      this.localStream
        .getTracks()
        .forEach((track) => track.stop());

      this.localStream = null;
    }

    this.remoteStream = null;

    this.callbacks.onCallEnded();
  }

  toggleMicrophone(enabled) {
    if (!this.localStream) return;

    this.localStream
      .getAudioTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
  }

  toggleCamera(enabled) {
    if (!this.localStream) return;

    this.localStream
      .getVideoTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
  }

  async leavePairing() {
    if (
      !SIGNAL_ORIGIN ||
      !this.pairCode ||
      !this.peerId
    ) {
      return;
    }

    try {
      await fetch(
        `${SIGNAL_ORIGIN}/pair/` +
        `${encodeURIComponent(this.pairCode)}` +
        `?peerId=${encodeURIComponent(this.peerId)}`,
        {
          method: 'DELETE'
        }
      );
    } catch (error) {
      console.warn(
        '[P2P] Failed to leave pairing room:',
        error
      );
    }
  }

  cleanup() {
    this.stopPairingPolling();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore already-destroyed peers.
      }
    }

    this.peer = null;
    this.peerId = null;
    this.partnerPeerId = null;
    this.conn = null;
    this.mediaCall = null;
    this.connectionAttemptedFor = null;
  }
}

export const p2pManager = new P2PManager();