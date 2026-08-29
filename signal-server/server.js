const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();

const PORT =
  Number(process.env.PORT) || 9000;

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || '*';

const PAIR_TTL_MS =
  15 * 1000;

const MAX_PEERS_PER_PAIR =
  2;

/*
 * pairCode -> Map(peerId, lastSeen)
 */
const pairings =
  new Map();

/*
 * ----------------------------------------------------------
 * APPLICATION SECURITY
 * ----------------------------------------------------------
 */

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '32kb'
  })
);

/*
 * ----------------------------------------------------------
 * CORS
 * ----------------------------------------------------------
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
      'Content-Type, Cache-Control'
    );

    if (
      req.method === 'OPTIONS'
    ) {
      return res.sendStatus(204);
    }

    next();
  }
);

/*
 * ----------------------------------------------------------
 * NO-CACHE MIDDLEWARE
 * ----------------------------------------------------------
 *
 * Pairing state is live/ephemeral.
 *
 * We explicitly prevent:
 *
 * - Browser caching
 * - Proxy caching
 * - Conditional 304 responses
 */

function noStore(
  req,
  res,
  next
) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.setHeader(
    'Pragma',
    'no-cache'
  );

  res.setHeader(
    'Expires',
    '0'
  );

  res.setHeader(
    'Surrogate-Control',
    'no-store'
  );

  next();
}

/*
 * ----------------------------------------------------------
 * VALIDATION
 * ----------------------------------------------------------
 */

function normalizePairCode(
  value
) {
  if (
    typeof value !== 'string'
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

function normalizePeerId(
  value
) {
  if (
    typeof value !== 'string'
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
 * ----------------------------------------------------------
 * PAIRING CLEANUP
 * ----------------------------------------------------------
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

/*
 * Keep stale registrations from accumulating.
 */
const cleanupTimer =
  setInterval(
    cleanupExpiredPairings,
    5000
  );

/*
 * ----------------------------------------------------------
 * REMOVE PEER FROM ALL PAIRINGS
 * ----------------------------------------------------------
 *
 * This is called when PeerJS tells us that
 * a peer has disconnected.
 */

function removePeerFromAllPairings(
  peerId
) {
  if (!peerId) {
    return;
  }

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
 * ----------------------------------------------------------
 * HEALTH CHECK
 * ----------------------------------------------------------
 */

app.get(
  '/',
  noStore,
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
 * ----------------------------------------------------------
 * JOIN / REFRESH PAIRING
 * ----------------------------------------------------------
 *
 * POST /pair/join
 *
 * Body:
 *
 * {
 *   pairCode: "PAIR-1314",
 *   peerId: "vault-..."
 * }
 */

app.post(
  '/pair/join',
  noStore,
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
      return res
        .status(400)
        .json({
          error:
            'Invalid pairCode or peerId'
        });
    }

    let peers =
      pairings.get(
        pairCode
      );

    if (!peers) {
      peers =
        new Map();

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
     * checking capacity.
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
     * Pairing room is limited to
     * exactly two devices.
     */
    if (
      peers.size >=
      MAX_PEERS_PER_PAIR
    ) {
      return res
        .status(409)
        .json({
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
 * ----------------------------------------------------------
 * POLL PAIRING
 * ----------------------------------------------------------
 *
 * GET /pair/:pairCode?peerId=...
 *
 * Polling refreshes the current peer's
 * registration and returns the other peer.
 */

app.get(
  '/pair/:pairCode',
  noStore,
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
      return res
        .status(400)
        .json({
          error:
            'Invalid pairCode or peerId'
        });
    }

    const peers =
      pairings.get(
        pairCode
      );

    /*
     * Pairing room doesn't exist.
     */
    if (!peers) {
      return res.json({
        ok: true,
        peers: []
      });
    }

    /*
     * The peer's registration has expired
     * or it was removed because PeerJS disconnected.
     */
    if (
      !peers.has(peerId)
    ) {
      return res
        .status(404)
        .json({
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
 * ----------------------------------------------------------
 * LEAVE PAIRING
 * ----------------------------------------------------------
 *
 * DELETE /pair/:pairCode?peerId=...
 */

app.delete(
  '/pair/:pairCode',
  noStore,
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
      return res
        .status(400)
        .json({
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
 * ----------------------------------------------------------
 * HTTP SERVER
 * ----------------------------------------------------------
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
 * ----------------------------------------------------------
 * PEERJS SIGNALING SERVER
 * ----------------------------------------------------------
 */

const peerServer =
  ExpressPeerServer(
    server,
    {
      path: '/',

      /*
       * Clients must know the peer ID.
       * Discovery through PeerJS itself is disabled.
       */
      allow_discovery:
        false,

      /*
       * Render sits behind a reverse proxy.
       */
      proxied:
        true,

      /*
       * Limit concurrent PeerJS
       * signaling connections.
       */
      concurrent_limit:
        20,

      /*
       * Prevent unbounded outgoing
       * message buffering.
       */
      cleanup_out_msgs:
        1000
    }
  );

app.use(
  '/peerjs',
  peerServer
);

/*
 * ----------------------------------------------------------
 * PEERJS CONNECTION EVENTS
 * ----------------------------------------------------------
 */

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

    /*
     * Critical:
     *
     * When PeerJS disconnects, immediately
     * remove the peer from PAIR-1314.
     *
     * This prevents dead PeerJS IDs from being
     * returned to other clients.
     */
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
 * ----------------------------------------------------------
 * GRACEFUL SHUTDOWN
 * ----------------------------------------------------------
 */

function shutdown() {
  console.log(
    '[VaultComms] Shutting down...'
  );

  clearInterval(
    cleanupTimer
  );

  /*
   * Clear in-memory pairing state.
   */
  pairings.clear();

  server.close(
    () => {
      console.log(
        '[VaultComms] HTTP server closed'
      );

      process.exit(0);
    }
  );

  /*
   * Don't keep Render hanging forever
   * if an active connection refuses to close.
   */
  setTimeout(
    () => {
      process.exit(0);
    },
    10000
  ).unref();
}

process.on(
  'SIGTERM',
  shutdown
);

process.on(
  'SIGINT',
  shutdown
);