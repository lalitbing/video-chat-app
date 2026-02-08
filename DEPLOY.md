# Step-by-step: Host VC Meet (Vercel + Railway)

Use this guide to deploy the frontend on **Vercel** and the socket server on **Railway**. No database needed.

---

## Before you start

- Code is in a **Git repo** (GitHub, GitLab, or Bitbucket) and pushed.
- You have accounts on [Vercel](https://vercel.com) and [Railway](https://railway.app).

---

## Part 1: Deploy the Socket server on Railway

### Step 1.1 — Create a new project

1. Go to [railway.app](https://railway.app) and log in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo** (or GitLab/Bitbucket) and select this **video-chat-app** repo.
4. Railway will create a project and try to deploy. We’ll fix the start command next.

### Step 1.2 — Configure the service

1. In the project, open the **service** that was created (the one linked to your repo).
2. Go to the **Settings** tab.
3. Find **Build** or **Deploy**:
   - **Build Command:** leave default (e.g. `npm install` or blank).
   - **Start Command:** set to:
     ```bash
     npm run start:socket
     ```
   - **Root Directory:** leave blank (project root).
4. Under **Variables** (or **Environment**), add:
   - **Name:** `CORS_ORIGIN`  
   - **Value:** you’ll set this in Part 2 after you have your Vercel URL. For now you can use `*` so the server starts (we’ll tighten it later).
5. Save. Railway will redeploy.

### Step 1.3 — Get the public URL

1. In the same service, go to **Settings**.
2. Find **Networking** or **Public Networking** / **Generate domain**.
3. Click **Generate domain** (or similar). Railway will assign a URL like `https://video-chat-app-production-xxxx.up.railway.app`.
4. **Copy this URL** (no trailing slash). You’ll use it in Part 2.

---

## Part 2: Deploy the Frontend on Vercel

### Step 2.1 — Import the project

1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **Add New…** → **Project**.
3. Import the same **video-chat-app** repo (connect the Git provider if needed).
4. Click **Import**.

### Step 2.2 — Configure build (don’t change much)

1. **Framework Preset:** Next.js (auto-detected).
2. **Build Command:** leave as `next build` (default).
3. **Output Directory:** leave default.
4. **Install Command:** leave default (`npm install` or similar).
5. Do **not** set a custom “Start” or “Run” command — Vercel runs the built Next.js app; we are not using the custom Node server here.

### Step 2.3 — Add environment variable

1. Expand **Environment Variables**.
2. Add one variable:
   - **Name:** `NEXT_PUBLIC_SOCKET_URL`
   - **Value:** the Railway URL you copied in Step 1.3, e.g. `https://video-chat-app-production-xxxx.up.railway.app` (no trailing slash).
   - **Environment:** leave all checked (Production, Preview, Development) or at least Production.
3. Click **Deploy**. Wait for the build to finish.

### Step 2.4 — Get your Vercel URL

1. After deploy, Vercel shows the live URL, e.g. `https://video-chat-app-xxx.vercel.app`.
2. **Copy this URL** (no trailing slash).

---

## Part 3: Lock down CORS on Railway

So only your Vercel app can talk to the socket server:

1. In **Railway**, open your socket service → **Variables**.
2. Set **CORS_ORIGIN** to your Vercel URL, e.g. `https://video-chat-app-xxx.vercel.app`.
   - For multiple URLs (e.g. preview deployments), use a comma-separated list:  
     `https://your-app.vercel.app,https://your-app-xxx.vercel.app`
3. Save. Railway will redeploy the socket server.

---

## Part 4: Test the app

1. Open your **Vercel URL** in the browser.
2. Enter a name, create or join a room.
3. Open the same room URL in another tab or device and confirm:
   - Video/audio works.
   - Chat works.
   - Screen share works (if you use it).

If the second client never connects or you see **CORS** errors (“No 'Access-Control-Allow-Origin' header”):

- In **Railway** → your socket service → **Variables**, set **CORS_ORIGIN** to your **exact** Vercel origin:  
  `https://video-chat-app-orcin.vercel.app` (no trailing slash).  
  For multiple origins use a comma-separated list.
- Save so Railway redeploys the socket server. The browser only allows requests when the server sends this header for your frontend origin.

Also check:

- **NEXT_PUBLIC_SOCKET_URL** on Vercel is exactly the Railway URL (no trailing slash).
- Redeploy both after changing env vars.

---

## Quick reference

| Where   | What to set |
|--------|-------------|
| **Railway** | Start: `npm run start:socket` · Variable: `CORS_ORIGIN` = your Vercel URL(s) |
| **Vercel**  | Variable: `NEXT_PUBLIC_SOCKET_URL` = your Railway URL |

**Order:** Deploy Railway first → copy Railway URL → deploy Vercel with that URL → then set `CORS_ORIGIN` on Railway to the Vercel URL.
