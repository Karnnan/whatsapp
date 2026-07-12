# WhatsApp Auto-Reply & Group Broadcast Bot

This plan outlines the development of a custom application to automate WhatsApp interactions. Based on your feedback, we will upgrade the tech stack to use **Next.js** for a premium frontend, **Node.js** for the persistent WhatsApp bot, and **Supabase** for a scalable database.

## Goal
Build a dynamic WhatsApp automation tool with a web dashboard that can:
1. Connect to a secondary WhatsApp account via QR code.
2. Fetch groups and extract participant phone numbers dynamically.
3. When extracting, fetch their **Saved Name** (or public pushname) and their **"About"** status.
4. Save all these extracted contacts persistently into the Supabase database.
5. Provide a button on the dashboard to **Export** the saved contacts to an **Excel file**.
6. **[NEW] Provide "One-Tap" Quick Send buttons on the UI:** Easily send text, videos, or **Voice Notes** (which will appear as native WhatsApp voice messages) to contacts directly from the dashboard with a single click.
7. Send bulk broadcast messages (text and media uploaded from the UI) to extracted numbers.
8. Automatically reply to incoming messages based on customizable keywords stored in the database.
9. Allow toggling the auto-reply feature ON/OFF from the dashboard.
10. Provide a UI to add/edit/delete keyword-reply pairs.

## User Review Required
> [!WARNING]
> **Account Ban Risk:** Sending unsolicited automated messages can trigger WhatsApp's spam filters. We will add random delays between broadcast messages to mimic human behavior. Always use a secondary number for this bot.

> [!IMPORTANT]
> **Tech Stack Decision:** 
> - A pure Next.js application isn't ideal for the WhatsApp bot itself because `whatsapp-web.js` requires a persistent, long-running Node.js process (running Puppeteer). Next.js API routes (especially serverless) are not designed for this.
> - A pure Python application lacks a reliable, free equivalent to `whatsapp-web.js`.
> - **The Optimal Solution:** We will split the architecture. We'll use a **Node.js Express backend** purely to run the WhatsApp bot, and a **Next.js frontend** for a stunning, responsive dashboard. We will use **Supabase** for the database as you suggested, which is excellent for real-time updates and scalability.
> 
> **Project Location:** 
> Let's build the project right here in your current workspace: `C:\Users\risha\Downloads\whatsappapi`. We will create two folders: `backend` and `frontend`.

## Proposed Architecture

We will build a two-part application backed by Supabase.

### 1. Backend (Node.js + Express)
- `whatsapp-web.js`: Core library for interacting with WhatsApp.
- `@supabase/supabase-js`: To connect to the Supabase PostgreSQL database.
- `express` & `socket.io`: To communicate with the Next.js frontend (sending QR codes, live logs).
- `multer`: For handling media uploads.

### 2. Frontend (Next.js)
- `Next.js` (React): For building a premium, dynamic web dashboard.
- `Vanilla CSS / CSS Modules`: For sleek, rich aesthetics (dark mode, glassmorphism, micro-animations) without Tailwind, as per guidelines.
- `socket.io-client`: To receive real-time QR codes and progress updates from the backend.
- `exceljs`: To generate downloadable Excel files directly in the browser.

### 3. Database (Supabase)
Tables to create in Supabase:
- `keywords` (id, keyword string, reply string)
- `settings` (id, auto_reply_enabled boolean)
- `contacts` (id, phone_number, name, pushname, about_text, group_id)

### File Structure
```
whatsappapi/
├── backend/                  # Node.js Bot Service
│   ├── package.json
│   ├── server.js             # Express API & Socket.io server
│   ├── whatsapp-service.js   # whatsapp-web.js logic
│   └── supabase-client.js    # Supabase connection
└── frontend/                 # Next.js Dashboard
    ├── package.json
    ├── next.config.mjs
    ├── src/
    │   ├── app/              # Next.js App Router pages
    │   │   ├── page.js       # Main Dashboard
    │   │   ├── layout.js
    │   │   └── globals.css   # Premium styling
    │   └── components/       # Reusable UI components
    └── public/               # Static assets
```

## Verification Plan

### Automated Tests
- Run Next.js build (`npm run build`) to ensure the frontend compiles without errors.
- Start the Node.js backend to verify Supabase connectivity.

### Manual Verification
- We will require you to scan the QR code and test the extraction/auto-reply features on a secondary WhatsApp account.
