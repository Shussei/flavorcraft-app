# VaultComms / FlavorCraft

A disguised private communication app. On the surface it looks like a gourmet
recipe cookbook ("FlavorCraft"); a hidden access path (search bar code, keypad
PIN, or timer entry) unlocks the private "Secret Vault" of encrypted messaging,
photo/video sharing, voice notes, and WebRTC voice/video calls.

## Architecture

```
Your Browser ─────────── Supabase ──────────── Partner Browser
   │                  (Postgres, RLS,          │
   │                 Storage, Realtime,        │
   │                    auth)                  │
   │                       │                   │
   │   └── Encrypted messages, media, delivery state, Web Push trigger
   │
   └─────────── Backend (Render.com) ───────────┘
                PeerServer (WebRTC call signaling)
                Web Push delivery endpoints
                Health / monitoring
```

- **Messaging is centralized and persistent.** Messages (text, image, video,
  voice) are encrypted with AES-GCM in the browser before they ever leave the
  device, then stored in Supabase Postgres (`chat_messages`). Delivery and read
  state (`delivered_at`, `read_at`) is tracked server-side. New messages reach
  the open app instantly through Supabase Realtime.
- **Media** (photos, videos, voice notes) is uploaded as encrypted bytes to
  Supabase Storage (`vault-media`), with a per-message IV stored inside the
  encrypted payload.
- **Live calls** (voice/video) still use WebRTC over PeerJS. Only the WebRTC
  offer/answer/ICE handshake travels through the backend's PeerServer. Audio and
  video go directly device-to-device. Chat never uses PeerJS anymore.
- **Background alerts** are generic only ("New recipe released..."). When a
  message arrives while the recipient is offline, the backend sends a Web Push
  so the OS wakes the user—without ever leaking message content.
- **Logout / panic lock** instantly drops all session state and returns to the
  recipe facade. Pressing `Escape` or switching away from the tab while the
  vault is open also auto-locks.

## Security properties

- Messages are **client-side encrypted only**. No plaintext is ever stored or
  transmitted. The server only ever sees ciphertext + metadata.
- The encryption key is derived in the browser from the shared pair code
  (PBKDF2 → AES-GCM 256), so each room has its own key and neither Supabase nor
  the backend can decrypt content.
- All Postgres access goes through **row-level security** plus `SECURITY
  DEFINER` RPC helpers (see the SQL migration). The only Supabase credentials
  in the frontend are the publishable key; the service-role key lives on the
  backend only.
- Notifications are generic recipe-style alerts and carry zero message content.

## Project layout

```
backend/                     Express + PeerServer + Web Push (Render.com)
  server.js                  Heart of the backend
  scripts/generate-vapid.js  Generates VAPID keypair
  package.json
public/
  sw.js                      Service worker (shows generic push alerts)
supabase/migrations/
  001_centralized_messaging.sql   All tables, RPCs, RLS, storage bucket
src/
  App.jsx                    App shell, mode switching, call orchestration
  components/
    CookbookFacade.jsx       Recipe cookbook disguise + hidden triggers
    AuthModal.jsx            PIN keypad (secret 1515 / decoy 0000)
    DecoyGroceryList.jsx     Decoy content for the decoy PIN
    CommsVault.jsx           The encrypted messaging vault UI
    MessageBubble.jsx        Single message bubble (decrypt + media + status)
    CallModal.jsx            Incoming/outgoing/active call screen
  services/
    CryptoEngine.js          AES-GCM encryption (room-scoped key, legacy support)
    ChatPersistence.js       Supabase RPC + Realtime messaging client
    MediaService.js          Encrypted upload/download to Storage
    CallManager.js           PeerJS call-only manager
    NotificationService.js   Local + Web Push notifications (generic)
    RingtoneSynth.js         Call ringtones
    SupabaseClient.js        Supabase client bootstrap
```

## Environment variables

Frontend (`.env.development`, `.env.production` / Vercel):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `VITE_SIGNAL_HOST` / `VITE_SIGNAL_PORT` / `VITE_SIGNAL_PATH` | Backend host + PeerServer path (`/peerjs`) |
| `VITE_BACKEND_URL` | Backend base URL for Web Push endpoints |
| `VITE_VAPID_PUBLIC_KEY` | Public VAPID key for Web Push subscription |

Backend (Render.com dashboard):

| Variable | Purpose |
|---|---|
| `PORT` | Web server port (Render injects this) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server only, keep secret) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keypair from `npm run generate-vapid` |
| `VAPID_SUBJECT` | `mailto:` contact for push payloads |
| `ALLOWED_ORIGIN` | Comma-separated origins, or `*` |
| `OFFLINE_WINDOW_MS` | (optional) Offline threshold before pushing, default 120000 |
| `PUSH_COOLDOWN_MS` | (optional) Minimum gap between pushes, default 300000 |

## Scripts

```bash
npm install          # root app
npm run dev          # Vite dev server
npm run build        # production build (dist/)
npm run lint         # oxlint

cd backend
npm install
npm run generate-vapid   # print VAPID keys once
npm start                # node server.js
```

See [DEPLOY.md](DEPLOY.md) for the full deployment walkthrough.