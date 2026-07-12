# WhatsApp Auto-Reply & Group Broadcast Bot

A two-part WhatsApp automation suite:

- **`backend/`** — a persistent Node.js + Express service that runs the WhatsApp client
  ([Baileys](https://github.com/WhiskeySockets/Baileys) — browserless, it speaks
  WhatsApp's multi-device protocol directly over WebSocket, so it needs **no
  Chromium** and runs in ~100 MB), streams QR codes and live logs over Socket.io,
  and reads/writes to Supabase.
- **`frontend/`** — a premium Next.js dashboard (dark glassmorphism, no Tailwind) to
  drive everything from the browser.
- **Supabase** — PostgreSQL database for contacts, keywords and settings.

> ⚠️ **Use a secondary WhatsApp number.** Automated/bulk messaging can trigger WhatsApp's
> spam filters. Broadcasts are randomly delayed to look human, but there is always a ban risk.

---

## Features

| # | Feature |
|---|---------|
| 1 | Connect a WhatsApp account by scanning a QR code in the dashboard |
| 2 | List groups and extract every participant's phone number |
| 3 | Capture each participant's **saved name**, **public name** and **"About"** status |
| 4 | Persist contacts in Supabase (deduped per group) |
| 5 | **Export** saved contacts to an **Excel** file (generated in the browser) |
| 6 | **One-Tap Quick Send** — text, video/image, or **native voice notes** to any contact |
| 7 | **Bulk broadcast** (text or media) to all saved contacts with random delays |
| 8 | **Auto-reply** to incoming messages by keyword |
| 9 | Toggle auto-reply **ON/OFF** from the dashboard |
| 10 | Add / edit / delete keyword-reply pairs |

---

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of
   [`backend/db/schema.sql`](backend/db/schema.sql), and **Run**.
3. Go to **Settings → API** and copy:
   - **Project URL**
   - **`service_role`** secret key (server-side only — never expose it to the browser).

## 2. Configure & install the backend

```bash
cd backend
cp .env.example .env      # then edit .env with your Supabase URL + service_role key
npm install               # small & fast — no Chromium download (Baileys is browserless)
npm start
```

The backend listens on **http://localhost:4000**.

## 3. Configure & install the frontend

```bash
cd frontend
cp .env.example .env.local   # NEXT_PUBLIC_API_URL defaults to http://localhost:4000
npm install
npm run dev
```

The dashboard runs at **http://localhost:3000**.

### Run both at once (optional)

From the project root:

```bash
npm install            # installs `concurrently`
npm run install:all    # installs backend + frontend deps
npm run dev            # runs backend and frontend together
```

---

## 4. Usage

1. Open the dashboard and wait for the **QR code** in the *Connection* card.
2. On your phone: **WhatsApp → Linked devices → Link a device**, scan it.
3. Once connected:
   - **Groups & Extraction** → *Load groups* → pick one → *Extract participants*.
   - **Saved Contacts** → *Export Excel*, or hit **⚡ Send** on any row for a one-tap message.
   - **One-Tap Quick Send** → message any number directly.
   - **Bulk Broadcast** → text or media/voice to every saved contact.
   - **Auto-Reply Keywords** → add keyword→reply pairs and flip the toggle ON.

---

## Architecture

```
whatsappapi/
├── backend/                  # Node.js bot service
│   ├── server.js             # Express REST API + Socket.io + multer uploads
│   ├── whatsapp-service.js   # Baileys client, extraction, sending, auto-reply
│   ├── supabase-client.js    # Supabase connection (service role)
│   └── db/schema.sql         # Supabase tables
└── frontend/                 # Next.js dashboard (App Router)
    └── src/
        ├── app/              # layout, page, globals.css (design system)
        ├── components/       # cards: connection, groups, contacts, quick-send, broadcast, keywords, logs
        └── lib/              # REST client + Socket.io client
```

The dashboard never touches Supabase directly — it talks only to the backend REST API,
so the `service_role` key stays server-side.

---

## Troubleshooting

- **QR never appears:** check the backend logs — Baileys logs `QR code generated`.
  No Chromium/system libraries are required (it's browserless).
- **"Supabase is not configured" warning:** fill in `backend/.env` and restart.
- **Contacts don't save:** confirm you ran `schema.sql` and used the **service_role** key.
- **Voice note plays as a file:** WhatsApp voice notes render best from an `.ogg/opus`
  file; other formats are sent as push-to-talk but may show as an audio clip.
- **Session lost on restart:** the session is cached in `backend/baileys_auth/`; deleting it
  (or an ephemeral host with no persistent disk) forces a fresh QR scan.
