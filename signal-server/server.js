const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();

const PORT =
  Number(process.env.PORT) || 9000;

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || '*';

/*
 * A peer must refresh its pairing registration
 * regularly. If it disappears for this long,
 * the server removes it.
 */
const PAIR_TTL_MS =
  15 * 1000;

const MAX_PEERS_PER_PAIR = 2;

/*
 * pairCode -> Map(peerId, lastSeen)
 */
const pairings = new Map();

app.use(
  express.json({
    limit: '32kb'
  })
);

/*
 * CORS
 */
app.use(
  (req, res, next) => {
    const origin =
      req.headers.origin;

    if (
      ALLOWED_ORIGIN === '*' ||
      !origin
    ) {
      res.setHeader(
        'Access-Control-Allow-Origin',
        '*'
      );
    } else if (
      origin === ALLOWED_ORIGIN
    ) {
      res.setHeader(
        'Access-Control-Allow-Origin',
        origin
      );
    }

    res.setHeader(
      'Vary',
      'Origin'
    );

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, DELETE, OPTIONS'
    );

    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type'
    );

    if (
      req.method === 'OPTIONS'
    ) {
      return res.sendStatus(
        204
      );
    }

    next();
  }
);

/*
 * Validate pair code.
 */
function normalizePairCode(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const code =
    value.trim();

  if (
    !/^[A-Za-z0-9_-]{4,64}$/.test(
      code
    )
  ) {
    return null;
  }

  return code;
}

/*
 * Validate PeerJS ID.
 */
function normalizePeerId(
  value
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const peerId =
    value.trim();

  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,96}[A-Za-z0-9])?$/.test(
      peerId
    )
  ) {
    return null;
  }

  return peerId;
}

/*
 * Remove expired registrations.
 */
function cleanupExpiredPairings() {
  const now =
    Date.now();

  for (
    const [
      pairCode,
      peers
    ] of pairings.entries()
  ) {
    for (
      const [
        peerId,
        lastSeen
      ] of peers.entries()
    ) {
      if (
        now - lastSeen >
        PAIR_TTL_MS
      ) {
        console.log(
          `[PAIR] ${pairCode}: removing stale peer ${peerId.slice(
            0,
            12
          )}...`
        );

        peers.delete(
          peerId
        );
      }
    }

    if (
      peers.size === 0
    ) {
      pairings.delete(
        pairCode
      );
    }
  }
}

setInterval(
  cleanupExpiredPairings,
  5000
);

/*
 * Remove a PeerJS ID from every pairing room.
 */
function removePeerFromAllPairings(
  peerId
) {
  for (
    const [
      pairCode,
      peers
    ] of pairings.entries()
  ) {
    if (
      peers.delete(peerId)
    ) {
      console.log(
        `[PAIR] ${pairCode}: peer ${peerId.slice(
          0,
          12
        )}... removed`
      );
    }

    if (
      peers.size === 0
    ) {
      pairings.delete(
        pairCode
      );
    }
  }
}

/*
 * Health check.
 */
app.get(
  '/',
  (req, res) => {
    res.json({
      status:
        'VaultComms Signal Server Online',
      timestamp:
        new Date().toISOString()
    });
  }
);

/*
 * Join or refresh pairing room.
 *
 * POST /pair/join
 */
app.post(
  '/pair/join',
  (req, res) => {
    cleanupExpiredPairings();

    const pairCode =
      normalizePairCode(
        req.body?.pairCode
      );

    const peerId =
      normalizePeerId(
        req.body?.peerId
      );

    if (
      !pairCode ||
      !peerId
    ) {
      return res.status(400).json({
        error:
          'Invalid pairCode or peerId'
      });
    }

    let peers =
      pairings.get(
        pairCode
      );

    if (!peers) {
      peers = new Map();

      pairings.set(
        pairCode,
        peers
      );
    }

    /*
     * Existing peer:
     * refresh its lease.
     */
    if (
      peers.has(peerId)
    ) {
      peers.set(
        peerId,
        Date.now()
      );

      return res.json({
        ok: true,
        peers: [
          ...peers.keys()
        ].filter(
          (id) =>
            id !== peerId
        )
      });
    }

    /*
     * Remove stale peers before
     * determining whether room is full.
     */
    const now =
      Date.now();

    for (
      const [
        existingPeerId,
        lastSeen
      ] of peers.entries()
    ) {
      if (
        now - lastSeen >
        PAIR_TTL_MS
      ) {
        peers.delete(
          existingPeerId
        );
      }
    }

    /*
     * Room still full.
     */
    if (
      peers.size >=
      MAX_PEERS_PER_PAIR
    ) {
      return res.status(409).json({
        error:
          'Pairing room is full',
        peers: [
          ...peers.keys()
        ]
      });
    }

    peers.set(
      peerId,
      Date.now()
    );

    console.log(
      `[PAIR] ${pairCode}: ${peerId.slice(
        0,
        12
      )}... joined (${peers.size}/${MAX_PEERS_PER_PAIR})`
    );

    return res.json({
      ok: true,
      peers: [
        ...peers.keys()
      ].filter(
        (id) =>
          id !== peerId
      )
    });
  }
);

/*
 * Poll pairing room.
 *
 * IMPORTANT:
 * Polling only refreshes an EXISTING
 * registration. It cannot create a third
 * peer accidentally.
 */
app.get(
  '/pair/:pairCode',
  (req, res) => {
    cleanupExpiredPairings();

    const pairCode =
      normalizePairCode(
        req.params.pairCode
      );

    const peerId =
      normalizePeerId(
        req.query.peerId
      );

    if (
      !pairCode ||
      !peerId
    ) {
      return res.status(400).json({
        error:
          'Invalid pairCode or peerId'
      });
    }

    const peers =
      pairings.get(
        pairCode
      );

    if (!peers) {
      return res.json({
        ok: true,
        peers: []
      });
    }

    /*
     * Do not add unknown peers here.
     */
    if (
      !peers.has(peerId)
    ) {
      return res.status(404).json({
        error:
          'Peer is not registered in this pairing room'
      });
    }

    /*
     * Refresh lease.
     */
    peers.set(
      peerId,
      Date.now()
    );

    return res.json({
      ok: true,
      peers: [
        ...peers.keys()
      ].filter(
        (id) =>
          id !== peerId
      )
    });
  }
);

/*
 * Leave pairing room.
 */
app.delete(
  '/pair/:pairCode',
  (req, res) => {
    const pairCode =
      normalizePairCode(
        req.params.pairCode
      );

    const peerId =
      normalizePeerId(
        req.query.peerId
      );

    if (
      !pairCode ||
      !peerId
    ) {
      return res.status(400).json({
        error:
          'Invalid pairCode or peerId'
      });
    }

    const peers =
      pairings.get(
        pairCode
      );

    if (peers) {
      peers.delete(
        peerId
      );

      if (
        peers.size === 0
      ) {
        pairings.delete(
          pairCode
        );
      }
    }

    console.log(
      `[PAIR] ${pairCode}: ${peerId.slice(
        0,
        12
      )}... left`
    );

    return res.json({
      ok: true
    });
  }
);

/*
 * HTTP server.
 */
const server =
  app.listen(
    PORT,
    () => {
      console.log(
        `[VaultComms] Signal server listening on port ${PORT}`
      );
    }
  );

/*
 * PeerJS signaling server.
 */
const peerServer =
  ExpressPeerServer(
    server,
    {
      path: '/',
      allow_discovery: false,
      proxied: true,
      concurrent_limit: 20,
      cleanup_out_msgs: 1000
    }
  );

app.use(
  '/peerjs',
  peerServer
);

peerServer.on(
  'connection',
  (client) => {
    const id =
      client.getId();

    console.log(
      `[PEER +] ${id.slice(
        0,
        12
      )}... connected`
    );
  }
);

peerServer.on(
  'disconnect',
  (client) => {
    const id =
      client.getId();

    removePeerFromAllPairings(
      id
    );

    console.log(
      `[PEER -] ${id.slice(
        0,
        12
      )}... disconnected`
    );
  }
);

/*
 * Graceful shutdown.
 */
process.on(
  'SIGTERM',
  () => {
    console.log(
      '[VaultComms] Shutting down...'
    );

    server.close();
  }
);