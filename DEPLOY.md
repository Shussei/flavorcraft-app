# VaultComms — Deployment Guide

## How Comms Work (Overview)

```
You (Your Phone)  ←──── Direct P2P Encrypted Voice/Chat ────→  Her (Her Phone)
        │                                                               │
        └──────── Only WebRTC "hello handshake" goes through ─────────┘
                       Your Private Signal Server
                      (Render.com Free • You Own It)
```

The **signaling server does NOT carry your messages or audio**. 
It only helps your two phones find each other on the internet.
Once connected, everything goes directly device-to-device, encrypted.

---

## Step 1: Deploy the Signal Server (Render.com — Free)

This is your own private PeerJS signaling server. It never sees message content.

### a) Push signal-server/ to a GitHub repo

1. Create a **new private GitHub repository** (important: keep it private!)
2. Copy the `signal-server/` folder contents into it:
   - `server.js`
   - `package.json`
3. Push to GitHub

### b) Deploy to Render.com (Free)

1. Go to https://render.com → Sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Use these settings:
   - **Name**: `vaultcomms-signal` (or anything you like)
   - **Root Directory**: leave blank
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. Click **Create Web Service**
6. Wait ~2 minutes for it to deploy
7. **Copy your URL** — it'll look like: `vaultcomms-signal.onrender.com`

---

## Step 2: Update the App Config

Open `.env.production` and replace `YOUR-RENDER-APP-NAME`:

```
VITE_SIGNAL_HOST=vaultcomms-signal.onrender.com
VITE_SIGNAL_PORT=443
VITE_SIGNAL_PATH=/peerjs
```

---

## Step 3: Deploy the FlavorCraft Web App (Vercel — Free)

1. Push the entire `Comm/` project (the React app, NOT the signal-server) to a **separate private GitHub repo**
2. Go to https://vercel.com → Sign up (free)
3. Click **Add New Project → Import** your GitHub repo
4. In Vercel project settings → **Environment Variables**, add:
   - `VITE_SIGNAL_HOST` = `vaultcomms-signal.onrender.com`
   - `VITE_SIGNAL_PORT` = `443`
   - `VITE_SIGNAL_PATH` = `/peerjs`
5. Click **Deploy**
6. Vercel gives you a URL like: `https://flavorcraft-xyz.vercel.app`

---

## Step 4: Send Her the URL & Instructions

Send her the **Vercel URL** (e.g. `https://flavorcraft-xyz.vercel.app`) over any messaging app.

**Instructions for her:**
1. Open the URL in Chrome/Safari 
2. It'll look like a normal recipe app
3. In the search bar, type `1314` and tap Search
4. Enter PIN `1314` on the keypad
5. You're in the Secret Vault!

**For pairing:**
- Both of you need the same **Pair Code** (default: `PAIR-1314`)
- This is the shared "room name" — whoever opens the vault first creates the room
- The other person connects to the same room code automatically

---

## Step 5: How to Use

| Feature | How |
|---|---|
| **Chat** | Type message → Send (AES-256 encrypted) |
| **Voice Call** | Tap the 📞 phone icon (Wi-Fi call, free) |
| **Video Call** | Tap the 📹 camera icon |
| **Self-destruct messages** | Use the timer bar (10s, 30s, 5m, etc.) |
| **Panic Lock** | Tap the 🔴 lock icon OR press `Escape` |
| **Change PIN** | Go inside vault → Settings gear icon |

---

## Security Summary

| What | How Secure |
|---|---|
| Messages | AES-GCM 256-bit encrypted BEFORE leaving device |
| Voice/Video | Direct P2P WebRTC — no server sees audio |
| Signal server | Only sees encrypted connection requests, never content |
| Panic lock | Instantly drops all state, returns to recipe app |
| Auto-lock | App auto-locks if you switch browser tabs |

> ⚠️ Note: Render.com free tier sleeps after 15 min of inactivity.
> The first connection after idle may take ~30 seconds to wake up.
> Upgrade to Render Starter ($7/mo) to avoid this if needed.
