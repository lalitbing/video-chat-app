# Deploy VC Meet (Vercel + Convex)

The frontend runs on **Vercel** and the realtime backend on **Convex**. There is no separate socket server to host.

---

## 1. Create the Convex project

On your machine, in the project folder:

```bash
npx convex dev
```

- Log in when prompted and create a new project (e.g. `vc-meet`).
- This creates a **dev** deployment, pushes the functions in `convex/`, and writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local`.
- Commit the generated `convex/_generated` folder.

## 2. Get a production deploy key

1. Open the [Convex dashboard](https://dashboard.convex.dev) and select your project.
2. Switch to the **Production** deployment.
3. Go to **Settings → URL & Deploy Key** and click **Generate Production Deploy Key**.
4. Copy the key.

## 3. Configure Vercel

In your Vercel project, go to **Settings**:

1. **Environment Variables**
   - Add `CONVEX_DEPLOY_KEY` = the key from step 2 (Production environment).
   - Remove the old `NEXT_PUBLIC_SOCKET_URL`, which is no longer used.
2. **Build & Development Settings → Build Command** (override):
   ```bash
   npx convex deploy --cmd 'npm run build'
   ```
   This pushes the Convex functions to production, then builds Next.js with `NEXT_PUBLIC_CONVEX_URL` set to the production URL.
3. Redeploy.

## 4. Test

1. Open your Vercel URL, enter a name, and create a room.
2. In another browser or device, join the same room ID. The host sees the request and admits you.
3. Check that video, chat, and screen share work. Closing a tab should remove that person from the other side within a second or two.

## Troubleshooting

- **"Unable to check room right now"**: the app can't reach Convex. Check that the latest Vercel build log shows `npx convex deploy` succeeding and that the Convex production deployment is running (dashboard → Health).
- **"NEXT_PUBLIC_CONVEX_URL is not set"**: the Vercel build command wasn't changed, so the Convex URL was never injected. Redo step 3.
- **Calls fail to connect on some networks**: the app uses only a public STUN server. Strict corporate or mobile networks may need a TURN server added to `rtcConfig` in `app/hooks/useWebRTC.ts`.

## Free plan usage

Rough cost per meeting: one heartbeat per participant every 10 s, one sweep per room every 15 s, and a few dozen signaling calls per participant when joining. A 2-person, 1-hour call uses about 1,000–1,500 function calls, so Convex's free 1M calls/month covers several hundred meeting-hours.
