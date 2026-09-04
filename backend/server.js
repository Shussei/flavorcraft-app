const express = require('express');
const { ExpressPeerServer } = require('peer');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.PORT) || 9000;

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || '*';

const SUPABASE_URL =
  process.env.SUPABASE_URL || '';

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY || '';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || '';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:admin@flavorcraft.example';

/*
 * A user is considered offline (needs a background push) when their
 * last_seen_at is older than this window.
 */
const OFFLINE_WINDOW_MS =
  Number(process.env.OFFLINE_WINDOW_MS) || 120000;

/*
 * Minimum gap between pushes sent to the same user for the same room,
 * to avoid notification spam.
 */
const PUSH_COOLDOWN_MS =
  Number(process.env.PUSH_COOLDOWN_MS) || 300000;

const RATE_LIMIT_REQUESTS =
  Number(process.env.RATE_LIMIT_REQUESTS) || 120;

const RATE_LIMIT_WINDOW_MS =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

/*
 * ----------------------------------------------------------
 * CORS
 * ----------------------------------------------------------
 */

const allowedOrigins = String(ALLOWED_ORIGIN)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    return next();
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

/*
 * ----------------------------------------------------------
 * Rate limiting (in-memory, per IP)
 * ----------------------------------------------------------
 */

const rateBuckets = new Map();

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}

app.use('/api', rateLimit);

/*
 * ----------------------------------------------------------
 * Supabase admin client (server-side only; never exposed to the client)
 * ----------------------------------------------------------
 */

const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const admin = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    })
  : null;

/*
 * ----------------------------------------------------------
 * Web Push
 * ----------------------------------------------------------
 */

const pushEnabled = Boolean(
  supabaseEnabled && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY
);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const pushCooldowns = new Map();

const GENERIC_NOTIFICATION = {
  title: 'New recipe released',
  body: 'A fresh recipe is available to explore.'
};

function nowIso() {
  return new Date().toISOString();
}

async function sendPush(subscription, payload) {
  if (!pushEnabled) return;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'normal' }
    );
  } catch (error) {
    if (error && error.statusCode === 404) {
      try {
        await admin
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

function cooldownAllows(userId) {
  const last = pushCooldowns.get(userId) || 0;
  if (Date.now() - last >= PUSH_COOLDOWN_MS) {
    pushCooldowns.set(userId, Date.now());
    return true;
  }
  return false;
}

async function handleNewChatMessage(message) {
  if (!admin || !pushEnabled) return;

  try {
    const { data: members, error } = await admin
      .from('chat_room_members')
      .select('user_id, last_seen_at')
      .eq('room_id', message.room_id)
      .neq('user_id', message.sender_id);

    if (error || !Array.isArray(members)) return;

    for (const member of members) {
      const lastSeen = member.last_seen_at
        ? new Date(member.last_seen_at).getTime()
        : 0;
      const offline = Date.now() - lastSeen > OFFLINE_WINDOW_MS;

      if (!offline) continue;
      if (!cooldownAllows(member.user_id)) continue;

      const { data: subscriptions } = await admin
        .from('push_subscriptions')
        .select('endpoint, keys')
        .eq('user_id', member.user_id);

      if (!Array.isArray(subscriptions)) continue;

      for (const subscription of subscriptions) {
        await sendPush(subscription, GENERIC_NOTIFICATION);
      }
    }
  } catch {
    // Never crash the process because of one delivery attempt.
  }
}

function startRealtimeListener() {
  if (!admin) return null;

  const channel = admin
    .channel('backend:chat-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      },
      (payload) => {
        handleNewChatMessage(payload.new);
      }
    );

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[backend] Realtime message listener subscribed');
    } else if (err) {
      console.warn('[backend] Realtime subscription error:', err.message);
    }
  });

  return channel;
}

const realtimeChannel = startRealtimeListener();

/*
 * ----------------------------------------------------------
 * Auth helper
 * ----------------------------------------------------------
 */

async function resolveUser(token) {
  if (!admin || !token) return null;

  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

function getBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function validPushSubscription(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) return false;
  if (!/^https:\/\//.test(body.endpoint)) return false;
  if (!body.keys || typeof body.keys !== 'object') return false;
  if (typeof body.keys.p256dh !== 'string' || body.keys.p256dh.length > 2048) return false;
  if (typeof body.keys.auth !== 'string' || body.keys.auth.length > 2048) return false;
  return true;
}

/*
 * ----------------------------------------------------------
 * Routes
 * ----------------------------------------------------------
 */

app.get('/', (req, res) => {
  res.json({
    status: 'VaultComms backend online',
    services: ['health', 'peerjs', 'push'],
    timestamp: nowIso()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    supabase: supabaseEnabled ? 'configured' : 'missing',
    push: pushEnabled ? 'configured' : 'missing',
    timestamp: nowIso()
  });
});

app.post('/api/push/subscribe', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Backend not fully configured' });
  }

  const user = await resolveUser(getBearer(req));

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!validPushSubscription(req.body)) {
    return res.status(400).json({ error: 'Invalid push subscription' });
  }

  const { endpoint, keys } = req.body;

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        keys,
        updated_at: nowIso()
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    return res.status(500).json({ error: 'Failed to store subscription' });
  }

  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Backend not fully configured' });
  }

  const user = await resolveUser(getBearer(req));

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { endpoint } = req.body || {};

  if (typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Invalid endpoint' });
  }

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    return res.status(500).json({ error: 'Failed to remove subscription' });
  }

  res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  if (!supabaseEnabled) {
    return res.status(503).json({ error: 'Backend not fully configured' });
  }

  const user = await resolveUser(getBearer(req));

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!pushEnabled) {
    return res.status(503).json({ error: 'Push not configured' });
  }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('endpoint, keys')
    .eq('user_id', user.id);

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return res.status(404).json({ error: 'No push subscription registered' });
  }

  for (const subscription of subscriptions) {
    await sendPush(subscription, GENERIC_NOTIFICATION);
  }

  res.json({ ok: true });
});

/*
 * ----------------------------------------------------------
 * PeerServer (WebRTC call signaling only)
 *
 * Normal chat does NOT flow through here. This endpoint is used
 * exclusively for the WebRTC offer/answer/ICE handshake of live
 * voice and video calls. Media itself travels directly between
 * the two devices.
 * ----------------------------------------------------------
 */

const server = app.listen(PORT, () => {
  console.log(`[backend] VaultComms backend listening on port ${PORT}`);
});

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
  if (id) {
    console.log(`[calls +] ${id.slice(0, 12)}... connected`);
  }
});

peerServer.on('disconnect', (client) => {
  const id = client.getId();
  if (id) {
    console.log(`[calls -] ${id.slice(0, 12)}... disconnected`);
  }
});

/*
 * ----------------------------------------------------------
 * Shutdown
 * ----------------------------------------------------------
 */

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('[backend] Shutting down...');

  if (realtimeChannel && admin) {
    admin.removeChannel(realtimeChannel);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);