const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();
const PORT = process.env.PORT || 9000;

// Security: Only allow requests from our own deployed app origin
// Set ALLOWED_ORIGIN env variable on Render to your deployed URL
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint (needed for Render.com keep-alive)
app.get('/', (req, res) => {
  res.json({ status: 'VaultComms Signal Server Online', ts: new Date().toISOString() });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`[VaultComms] Private Signaling Server running on port ${PORT}`);
});

// Mount PeerJS server at /peerjs path
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,        // Do NOT list connected peers publicly
  proxied: true,                 // Required for Render.com proxy
  concurrent_limit: 20,          // Max simultaneous connections
  cleanup_out_msgs: 1000,
});

app.use('/peerjs', peerServer);

// Log connections for debugging (peer ID only, never message content)
peerServer.on('connection', (client) => {
  const id = client.getId();
  // Only log first 8 chars of peer ID for debugging
  console.log(`[+] Peer connected: ${id.substring(0, 8)}...`);
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();
  console.log(`[-] Peer disconnected: ${id.substring(0, 8)}...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[VaultComms] Server shutting down...');
  server.close();
});
