const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();

const PORT = Number(process.env.PORT) || 9000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_PEERS_PER_PAIR = 2;

/*
 * In-memory pairing registry.
 *
 * pairCode -> Map(peerId, lastSeenTimestamp)
 *
 * This is intentionally small because the app is designed for
 * one private pair at a time. For multi-instance production
 * deployments, replace this with Redis or another shared store.
 */
const pairings = new Map();

app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGIN === '*' || !origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

function normalizePairCode(value) {
  if (typeof value !== 'string') return null;

  const code = value.trim();

  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    return null;
  }

  return code;
}

function normalizePeerId(value) {
  if (typeof value !== 'string') return null;

  const peerId = value.trim();

  // PeerJS IDs must start/end alphanumeric.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,96}[A-Za-z0-9])?$/.test(peerId)) {
    return null;
  }

  return peerId;
}

function cleanupExpiredPairings() {
  const now = Date.now();

  for (const [pairCode, peers] of pairings.entries()) {
    for (const [peerId, lastSeen] of peers.entries()) {
      if (now - lastSeen > PAIR_TTL_MS) {
        peers.delete(peerId);
      }
    }

    if (peers.size === 0) {
      pairings.delete(pairCode);
    }
  }
}

function removePeerFromAllPairings(peerId) {
  for (const [pairCode, peers] of pairings.entries()) {
    peers.delete(peerId);

    if (peers.size === 0) {
      pairings.delete(pairCode);
    }
  }
}

setInterval(cleanupExpiredPairings, 30_000);

/*
 * Health check
 */
app.get('/', (req, res) => {
  res.json({
    status: 'VaultComms Signal Server Online',
    timestamp: new Date().toISOString()
  });
});

/*
 * Join/refresh a pairing room.
 *
 * POST /pair/join
 *
 * Body:
 * {
 *   "pairCode": "PAIR-1314",
 *   "peerId": "vault-..."
 * }
 */
app.post('/pair/join', (req, res) => {
  const pairCode = normalizePairCode(req.body?.pairCode);
  const peerId = normalizePeerId(req.body?.peerId);

  if (!pairCode || !peerId) {
    return res.status(400).json({
      error: 'Invalid pairCode or peerId'
    });
  }

  let peers = pairings.get(pairCode);

  if (!peers) {
    peers = new Map();
    pairings.set(pairCode, peers);
  }

  /*
   * If this peer is already registered, simply refresh it.
   */
  if (peers.has(peerId)) {
    peers.set(peerId, Date.now());

    return res.json({
      ok: true,
      peers: [...peers.keys()].filter((id) => id !== peerId)
    });
  }

  /*
   * Only two peers are allowed in one pairing room.
   */
  if (peers.size >= MAX_PEERS_PER_PAIR) {
    return res.status(409).json({
      error: 'Pairing room is full'
    });
  }

  peers.set(peerId, Date.now());

  console.log(
    `[PAIR] ${pairCode}: ${peerId.slice(0, 12)}... joined`
  );

  return res.json({
    ok: true,
    peers: [...peers.keys()].filter((id) => id !== peerId)
  });
});

/*
 * Poll the current pairing room.
 *
 * GET /pair/:pairCode?peerId=...
 */
app.get('/pair/:pairCode', (req, res) => {
  const pairCode = normalizePairCode(req.params.pairCode);
  const peerId = normalizePeerId(req.query.peerId);

  if (!pairCode || !peerId) {
    return res.status(400).json({
      error: 'Invalid pairCode or peerId'
    });
  }

  const peers = pairings.get(pairCode);

  if (!peers) {
    return res.json({
      ok: true,
      peers: []
    });
  }

  peers.set(peerId, Date.now());

  return res.json({
    ok: true,
    peers: [...peers.keys()].filter((id) => id !== peerId)
  });
});

/*
 * Leave pairing room.
 */
app.delete('/pair/:pairCode', (req, res) => {
  const pairCode = normalizePairCode(req.params.pairCode);
  const peerId = normalizePeerId(req.query.peerId);

  if (!pairCode || !peerId) {
    return res.status(400).json({
      error: 'Invalid pairCode or peerId'
    });
  }

  const peers = pairings.get(pairCode);

  if (peers) {
    peers.delete(peerId);

    if (peers.size === 0) {
      pairings.delete(pairCode);
    }
  }

  res.json({ ok: true });
});

/*
 * Start HTTP server.
 */
const server = app.listen(PORT, () => {
  console.log(
    `[VaultComms] Signal server listening on port ${PORT}`
  );
});

/*
 * PeerJS signaling server.
 *
 * Client URL:
 *
 * https://YOUR-RENDER-DOMAIN.onrender.com/peerjs
 */
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,
  proxied: true,
  concurrent_limit: 20,
  cleanup_out_msgs: 1000
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  const id = client.getId();

  console.log(
    `[PEER +] ${id.slice(0, 12)}... connected`
  );
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();

  removePeerFromAllPairings(id);

  console.log(
    `[PEER -] ${id.slice(0, 12)}... disconnected`
  );
});

process.on('SIGTERM', () => {
  console.log('[VaultComms] Shutting down...');
  server.close();
});