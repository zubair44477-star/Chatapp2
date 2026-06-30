# ChatApp — Your WhatsApp-Style Chat Website

A simple real-time 1-on-1 chat website. People enter a name or phone number (no password needed) and can chat live with anyone else who has used the app.

## What's inside
- Login with just a name or phone number — no password
- A contact list showing everyone who has used the app, with green dots for who's online right now
- Real-time 1-on-1 chat (messages appear instantly, no page refresh)
- "Typing..." indicator
- Send photos and files (up to 25MB) — images show as previews, other files show as downloadable attachments
- Voice and video calling between two people, with an incoming-call popup (accept/decline)
- Message history is saved, so conversations are still there if you come back later
- WhatsApp-style look (green bubbles, sidebar layout)
- **Installable as an app** — once it's online, you and your family/friends can install it like a real app (own icon, opens full-screen, no browser bars)

## Installing it as an app
Once your site is live (after following the deployment steps below), open the website link on your phone or computer:
- **Android / Chrome / Edge (desktop or phone):** You'll see an "Install App" button on the login screen, or in the app's sidebar once logged in. Tap it, confirm, and it'll appear as an app icon on your home screen / app list.
- **iPhone / iPad (Safari):** Apple doesn't allow an automatic install button, so instead: open the site in Safari, tap the Share icon (square with an arrow), then tap "Add to Home Screen." You'll see a reminder of this on the login screen if you're on an iPhone.
- **Windows / Mac (Chrome/Edge):** Click the install icon in the address bar, or use the same "Install App" button mentioned above.

After installing, it opens like a normal app — full screen, with its own icon, no browser address bar.

**Two important notes:**
- The install option only appears once your site is online with a real address (like `https://chatapp.onrender.com`) — it won't show up while just testing on your own computer before deploying. Render gives you this automatically (it provides "https" addresses by default).
- This is *not* the same as being listed in the Apple App Store or Google Play Store — it installs directly from the website instead, no store account or app review needed. That's what makes it possible to do this without any developer fees. If you ever want it in the actual app stores too, that's a separate, bigger project — just let me know if you want to explore that down the line.

## A note on voice/video calling
Calling uses a browser technology called WebRTC, which connects two people's browsers directly to each other so audio/video doesn't have to pass through my server. This works well on most home WiFi and normal mobile connections.

However, some networks (strict corporate WiFi, certain mobile carriers, some public WiFi) block this kind of direct connection. In those cases, calls may fail to connect ("Connecting..." that never finishes). If that happens regularly for you or your family/friends, the fix is to add what's called a TURN relay server — this is a small paid service (a few dollars a month for light use) that relays the call through a server instead of connecting directly. Let me know if you run into this and I'll help you add one (services like Twilio or Metered.ca offer this).

For text messages and photos/files, none of this applies — those always work normally.

## Important: this needs a slightly different kind of hosting than DocShare
Real-time chat needs the server to stay connected to everyone's browser at once, which means it needs to run all the time (not "wake up" only when someone visits a page). Render's free tier works for this, but the free tier may go to sleep after periods of no use — when it wakes back up, it works fine, it's just a few seconds slower to load after being idle.

## How to put this online (step-by-step)

### Step 1: Create a GitHub account (if you don't have one)
Go to github.com and sign up — it's free.

### Step 2: Upload this project to GitHub
1. On github.com, click "New repository," name it `chatapp`, and create it.
2. Click "uploading an existing file" and drag in all the files/folders from this project.
3. Click "Commit changes."

### Step 3: Create a free Render account
Go to render.com and sign up (signing up with your GitHub account makes this easier).

### Step 4: Create a new Web Service
1. In Render, click "New +" → "Web Service."
2. Connect your GitHub account and select the `chatapp` repository.
3. Fill in:
   - **Name:** chatapp (or anything you like)
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
4. Click "Create Web Service."

After a couple of minutes, Render will give you a live address like `https://chatapp.onrender.com` — share that link with whoever you want to chat with, and you can both log in and message each other.

### Step 5 (optional): Connect a GoDaddy domain
Same as with DocShare — buy the domain on GoDaddy, then in Render go to Settings → Custom Domain, and follow the on-screen instructions to point your GoDaddy domain at it.

## How people use it
1. Each person opens the website link and types their name or phone number to "log in" (no account creation, no password).
2. They'll see a sidebar of everyone who has ever used the app.
3. Click a name to start chatting, or type a new name/number in "Start a chat with..." if the person hasn't logged in yet (you can message them, and once they log in, the messages will be waiting).
4. To send a photo or file, click the 📎 icon next to the message box.
5. To call someone, open a chat with them (they must be online) and click 📞 for voice or 🎥 for video. They'll see a popup to accept or decline.

## Things to know
- **This is meant for friends/family, not the public** — there's no privacy beyond people you trust not to read each other's messages, since there's no password protection on accounts. Anyone could "log in" as any name.
- **Calls require both people online** — you can only call someone while they're actively using the site (green dot showing).
- **Calling reliability** — see the note above about some networks needing a TURN server.
- **No group chats yet** — only 1-on-1 messaging and calling. Let me know if you'd like group chats added.

## Questions / changes
Just tell me what you'd like changed (colors, add group chats, add a real password login, add a TURN server for more reliable calls, etc.) and I'll update it.
