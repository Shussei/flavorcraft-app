# VaultComms — Deployment Guide

## How Comms Work (Overview)

```
You (Your Phone)          Supabase             Partner (Her Phone)
         │             (Postgres + Storage        │
         │            + Realtime + Push trigger)  │
         │                     │                  │
         └──── Encrypted messages / media ───────┘
                    (persisted, delivery state)

         └────── WebRTC call handshake only ──────┘
                     Backend on Render.com
                  (PeerServer + Web Push)
```

- **Chat is centralized and encrypted.** Messages are AES-GCM encrypted in the
  browser, then stored on Supabase. Delivery/read state, offline persistence,
  and photo/video/voice sharing all go through Supabase.
- **Calls** (voice/video) still use direct WebRTC. Only the tiny offer/answer/
  ICE handshake passes through the Render backend (PeerServer). Audio/video
  never touches a server.
- The backend's second job is **Web Push**: when a message arrives while the
  recipient is offline, it wakes their device with a generic "New recipe
  released" alert. No content is ever included.

---

## Step 1: Apply the Supabase schema (required — one time)

1. Open https://supabase.com and log in to the project used by
   `VITE_SUPABASE_URL` (`kfwrfyuiykmulzirglpx`).
2. Go to **SQL Editor** → **New query**.
3. Paste the entire contents of
   `supabase/migrations/001_centralized_messaging.sql`.
4. Run it. This creates:
   - `chat_rooms`, `chat_room_members`, `chat_messages`, `push_subscriptions`
   - All RPC functions (`get_or_create_chat_room`, `insert_chat_message`,
     `mark_message_delivered`, `mark_message_read`,
     `purge_expired_chat_messages`, `set_chat_member_peer`, `get_chat_partner`)
   - Row-level security policies for every table
   - Storage bucket `vault-media` (+ policies)
   - Realtime publication for `chat_messages`
   - Optional `pg_cron` job to purge expired messages every minute
   - Drops the legacy pre-migration function variants

   > Tip: if `get_or_create_chat_room` already returns `uuid` (not `jsonb`),
   > the "drop" block at the bottom makes the migration re-runnable.

5. In the Supabase dashboard, also enable (one time, in **Project Settings → API**):
   - **Sign In / Up → Anonymous sign-ins**: ON (the app authenticates each
     device anonymously before joining a room).
   - Copy the **service_role** key — you'll need it for the backend in Step 2.

---

## Step 2: Deploy the Backend (Render.com — Free)

This is your own small Node service: PeerJS call signaling + Web Push delivery.

### a) Push backend/ to a private GitHub repo

1. Create a **new private GitHub repository**.
2. Copy the `backend/` folder into it (`server.js`, `package.json`, `scripts/`).
3. Push to GitHub.

### b) Create a Web Push keypair (once)

```bash
cd backend
npm install
npm run generate-vapid
```

Copy the printed `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` — you'll need both
below.

### c) Deploy on Render.com

1. Go to https://render.com → Sign up (free).
2. **New → Web Service** → connect your private GitHub repo.
3. Settings:
   - **Name**: `vaultcomms-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. Under **Environment Variables**, add:
   - `SUPABASE_URL` = your project URL (`https://kfwrfyuiykmulzirglpx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` = your service-role key (Secret)
   - `VAPID_PUBLIC_KEY` = from step 2b
   - `VAPID_PRIVATE_KEY` = from step 2b (Secret)
   - `VAPID_SUBJECT` = `mailto:you@example.com`
   - `ALLOWED_ORIGIN` = `*` (or your Vercel URL)
5. Create the service and wait ~2 minutes.
6. Copy your URL — it will look like `vaultcomms-backend.onrender.com`.
7. Verify it's alive: open `https://vaultcomms-backend.onrender.com/health`
   — you should see `{"status":"ok","supabase":"configured","push":"configured",...}`.

---

## Step 3: Configure the app

Open `.env.production` (and mirror the same values in the Vercel dashboard):

```
VITE_SIGNAL_HOST=vaultcomms-backend.onrender.com
VITE_SIGNAL_PORT=443
VITE_SIGNAL_PATH=/peerjs
VITE_BACKEND_URL=https://vaultcomms-backend.onrender.com
VITE_VAPID_PUBLIC_KEY=<public key from step 2b>
VITE_SUPABASE_URL=https://kfwrfyuiykmulzirglpx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon publishable key>
```

---

## Step 4: Deploy the FlavorCraft web app (Vercel — Free)

1. Push the whole project (app + `supabase/` + `public/`) to its **own private
   GitHub repo** (not the backend repo).
2. https://vercel.com → **Add New Project** → import the repo.
3. Framework preset: **Vite** (build `npm run build`, output `dist`).
4. Add the environment variables from Step 3.
5. **Deploy**. You get a URL like `https://flavorcraft-xyz.vercel.app`.

---

## Step 5: Send her the URL & instructions

Send her the **Vercel URL** over any messaging app.

**Instructions for her:**
1. Open the URL in Chrome or Safari.
2. It looks like a normal recipe app.
3. In the search bar, type `1515` and tap **Search**.
4. Enter PIN `1515` on the keypad.
5. You're in the Secret Vault.

**Pairing:**
- Both of you use the same **Pair Code** (`PAIR-1314`, shown top-right in the
  vault).
- Both devices share one encrypted room. Whichever device opens the vault first
  creates it; the second joins automatically.
- Calls only work while both devices are in the vault (partner shows "online"
  when their device has connected recently).

---

## Step 6: How to Use

| Feature | How |
|---|---|
| **Chat** | Type a message → Send (encrypted in-browser first) |
| **Photo / video** | Tap the image icon next to the input |
| **Voice note** | Tap the mic icon, record, stop |
| **Voice call** | Phone icon (WebRTC, free) |
| **Video call** | Camera icon |
| **Self-destruct** | Timer bar: Off / 10s / 30s / 5m / 1h |
| **Read receipts** | Clock (sending) → ✓ (sent) → ✓✓ (delivered) → ✓✓ green (read) |
| **Background alerts** | Settings → enable notifications + Background notifications |
| **Panic lock** | Red lock icon, or press `Escape` / switch tabs |

---

## Security Summary

| What | How Secure |
|---|---|
| Messages | AES-GCM 256, encrypted in the browser before any upload |
| Media | Encrypted bytes in Supabase Storage; IV stored inside the encrypted payload |
| Database | Row-level security; access only via SECURITY DEFINER RPCs |
| Voice/Video | Direct P2P WebRTC — the server only sees the call handshake |
| Backend keys | Service-role key stays on Render; frontend only has the publishable key |
| Notifications | Generic recipe-style alerts; never include message content |
| Panic lock | Drops all session state, returns to the recipe app |

> ⚠️ Notes:
> - Render free tier sleeps after ~15 min of inactivity; the first call after
>   idle may take ~30s to wake. Upgrade to Starter if that matters.
> - Web Push requires HTTPS (`/sw.js` + PushManager). Vercel provides this.
> - If you change `VITE_*` values after deploying, redeploy the frontend.