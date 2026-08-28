import Peer from 'peerjs';

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE SIGNALING SERVER CONFIG
// After deploying signal-server/ to Render.com, replace VITE_SIGNAL_HOST
// in your .env.production file with your Render URL
// e.g. VITE_SIGNAL_HOST=my-vault-signal.onrender.com
// ─────────────────────────────────────────────────────────────────────────────
const SIGNAL_SERVER_HOST = import.meta.env.VITE_SIGNAL_HOST || null;
const SIGNAL_SERVER_PORT = Number(import.meta.env.VITE_SIGNAL_PORT) || 443;
const SIGNAL_SERVER_PATH = import.meta.env.VITE_SIGNAL_PATH || '/peerjs';

class P2PManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.conn = null;
    this.mediaCall = null;
    this.localStream = null;
    this.remoteStream = null;

    this.broadcastChannel = null;
    this.callbacks = {
      onConnect: () => {},
      onDisconnect: () => {},
      onMessage: () => {},
      onIncomingCall: () => {},
      onCallAccepted: () => {},
      onCallEnded: () => {},
      onRemoteStream: () => {}
    };
  }

  // Initialize P2P Peer with optional custom Peer ID or random key
  init(customId = null, callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };

    // Set up local BroadcastChannel fallback for multi-tab testing
    if ('BroadcastChannel' in window) {
      if (this.broadcastChannel) this.broadcastChannel.close();
      this.broadcastChannel = new BroadcastChannel('vaultcomms-p2p-channel');
      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };
    }

    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      this.peerId = customId || `vault-${randomSuffix}`;

      // Build PeerJS config:
      // If VITE_SIGNAL_HOST is set → use your private Render.com server
      // Otherwise → fall back to PeerJS public cloud (testing only)
      const peerConfig = {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      };

      if (SIGNAL_SERVER_HOST) {
        peerConfig.host = SIGNAL_SERVER_HOST;
        peerConfig.port = SIGNAL_SERVER_PORT;
        peerConfig.path = SIGNAL_SERVER_PATH;
        peerConfig.secure = true;
      }

      this.peer = new Peer(this.peerId, peerConfig);

      this.peer.on('open', (id) => {
        this.peerId = id;
      });

      this.peer.on('connection', (connection) => {
        this.conn = connection;
        this.setupDataConnection();
      });

      this.peer.on('call', (call) => {
        this.mediaCall = call;
        this.callbacks.onIncomingCall({ isVideo: false, callerId: call.peer });
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS fallback mode:', err);
      });
    } catch (err) {
      console.warn('PeerJS init fallback:', err);
    }

    return this.peerId;
  }

  // Connect to target Peer by ID / Room Code
  connectToPeer(targetPeerId) {
    if (this.peer) {
      try {
        this.conn = this.peer.connect(targetPeerId, { reliable: true });
        this.setupDataConnection();
      } catch (err) {
        console.warn('Direct connection retry fallback');
      }
    }

    // Also broadcast connect intent over local channel for dual tab
    this.broadcastMessage({ type: 'SIGNAL_PEER_JOIN', senderId: this.peerId, targetId: targetPeerId });
  }

  setupDataConnection() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.callbacks.onConnect({ peerId: this.conn.peer });
    });

    this.conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.conn.on('close', () => {
      this.callbacks.onDisconnect();
    });
  }

  // Send encrypted message to peer
  sendMessage(msgObject) {
    const payload = { ...msgObject, senderId: this.peerId };

    // Send via PeerJS connection if open
    if (this.conn && this.conn.open) {
      this.conn.send(payload);
    }

    // Always broadcast via BroadcastChannel so dual tabs on same PC get instant sync!
    this.broadcastMessage({ type: 'CHAT_MESSAGE', payload });
  }

  // Handle incoming data payload
  handleIncomingData(data) {
    if (data.type === 'CALL_REQUEST') {
      this.callbacks.onIncomingCall(data);
    } else if (data.type === 'CALL_ACCEPT') {
      this.callbacks.onCallAccepted(data);
    } else if (data.type === 'CALL_REJECT' || data.type === 'CALL_END') {
      this.callbacks.onCallEnded(data);
    } else {
      this.callbacks.onMessage(data);
    }
  }

  // Broadcast Channel helper for local browser tabs
  broadcastMessage(msg) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ ...msg, senderId: this.peerId });
    }
  }

  handleBroadcastMessage(data) {
    if (data.senderId === this.peerId) return; // Ignore own messages

    if (data.type === 'CHAT_MESSAGE') {
      this.callbacks.onMessage(data.payload);
    } else if (data.type === 'CALL_REQUEST') {
      this.callbacks.onIncomingCall(data);
    } else if (data.type === 'CALL_ACCEPT') {
      this.callbacks.onCallAccepted(data);
    } else if (data.type === 'CALL_REJECT' || data.type === 'CALL_END') {
      this.callbacks.onCallEnded(data);
    } else if (data.type === 'SIGNAL_PEER_JOIN') {
      this.callbacks.onConnect({ peerId: data.senderId });
    }
  }

  // --- Voice & Video WebRTC Call Stream Management ---
  async startLocalMedia(video = false) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video
      });
      return this.localStream;
    } catch (err) {
      console.warn('Microphone/Camera permission notice:', err);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const dst = audioCtx.createMediaStreamDestination();
      osc.connect(dst);
      osc.start();
      this.localStream = dst.stream;
      return this.localStream;
    }
  }

  async callPeer(targetPeerId, isVideo = false) {
    await this.startLocalMedia(isVideo);

    // Send call request signal
    const callSignal = { type: 'CALL_REQUEST', isVideo, callerId: this.peerId };
    if (this.conn && this.conn.open) {
      this.conn.send(callSignal);
    }
    this.broadcastMessage(callSignal);

    if (this.peer && targetPeerId) {
      try {
        this.mediaCall = this.peer.call(targetPeerId, this.localStream);
        if (this.mediaCall) {
          this.mediaCall.on('stream', (remoteStream) => {
            this.remoteStream = remoteStream;
            this.callbacks.onRemoteStream(remoteStream);
          });
        }
      } catch (e) {
        console.warn('Peer call fallback active');
      }
    }
  }

  answerCall(isVideo = false) {
    this.startLocalMedia(isVideo).then((stream) => {
      if (this.mediaCall) {
        this.mediaCall.answer(stream);
        this.mediaCall.on('stream', (remoteStream) => {
          this.remoteStream = remoteStream;
          this.callbacks.onRemoteStream(remoteStream);
        });
      }
      const acceptSignal = { type: 'CALL_ACCEPT', isVideo, responderId: this.peerId };
      if (this.conn && this.conn.open) this.conn.send(acceptSignal);
      this.broadcastMessage(acceptSignal);
    });
  }

  endCall() {
    const endSignal = { type: 'CALL_END', senderId: this.peerId };
    if (this.conn && this.conn.open) this.conn.send(endSignal);
    this.broadcastMessage(endSignal);

    if (this.mediaCall) {
      this.mediaCall.close();
      this.mediaCall = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.callbacks.onCallEnded();
  }

  toggleMicrophone(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  toggleCamera(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }
}

export const p2pManager = new P2PManager();
