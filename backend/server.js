require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Server } = require('socket.io');

const { supabase, isConfigured } = require('./supabase-client');
const wa = require('./whatsapp-service');

const PORT = process.env.PORT || 4000;
// FRONTEND_URL may be a comma-separated list so the same backend can serve a
// local dashboard AND a deployed one (e.g. http://localhost:3000,https://your-site.netlify.app).
const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Allow requests with no Origin (curl/health checks) and any listed origin.
const corsOrigin = (origin, cb) => cb(null, !origin || FRONTEND_URLS.includes(origin));

// --- Uploads ---------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } }); // 64 MB

// --- App / server / socket -------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_URLS, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

wa.attachIo(io);

// --- Auth: in-memory session tokens (cleared on restart -> users re-login) ---
const activeTokens = new Map(); // token -> { username, at }

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token && activeTokens.has(token)) return next();
  return next(new Error('unauthorized'));
});

io.on('connection', (socket) => {
  // Send the current state to a freshly connected dashboard.
  socket.emit('status', wa.getStatus());
  if (wa.getStatus().qr) socket.emit('qr', wa.getStatus().qr);
});

// Small helper to wrap async route handlers and forward errors.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Remove an uploaded temp file without throwing.
const cleanup = (file) => {
  if (file && file.path) fs.unlink(file.path, () => {});
};

// Stable group id for manually-added / imported ("custom") groups, derived
// from the name so re-adding to the same-named group merges instead of dupes.
const customGroupId = (name) => {
  const norm = String(name || '').trim().toLowerCase();
  const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug) return `custom:${slug}`;
  if (!norm) return 'custom:group';
  // Non-Latin / emoji-only names have an empty slug — hash the normalized name
  // so distinct names get distinct ids (and re-imports of the same name merge).
  const hash = crypto.createHash('sha1').update(norm, 'utf8').digest('hex').slice(0, 12);
  return `custom:${hash}`;
};

const chunkArr = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ===========================================================================
// Auth gate — every /api route except health + login requires a Bearer token.
// ===========================================================================
const PUBLIC_API = new Set(['/api/health', '/api/auth/login']);
app.use((req, res, next) => {
  // Normalize case + trailing slash to match Express's default routing
  // (case-INsensitive, non-strict). Without this, /API/contacts or
  // /api/contacts/ would slip past the gate while still hitting the route.
  const p = req.path.toLowerCase().replace(/\/+$/, '') || '/';
  if (!p.startsWith('/api/') || PUBLIC_API.has(p)) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && activeTokens.has(token)) return next();
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
});

// ===========================================================================
// Health & auth
// ===========================================================================
app.get('/api/health', (req, res) => {
  res.json({ ok: true, supabaseConfigured: isConfigured });
});

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const { data, error } = await supabase
    .from('users')
    .select('username, password')
    .eq('username', username)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      return res.status(503).json({ error: 'Login is not set up yet — run the users table SQL in Supabase.' });
    }
    return res.status(500).json({ error: error.message });
  }
  // NOTE: plaintext comparison per request. Hash (bcrypt) for real security.
  if (!data || data.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  activeTokens.set(token, { username: data.username, at: Date.now() });
  res.json({ ok: true, token, username: data.username });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) activeTokens.delete(token);
  res.json({ ok: true });
}));

app.get('/api/status', (req, res) => {
  res.json(wa.getStatus());
});

app.post('/api/logout', wrap(async (req, res) => {
  await wa.logout();
  res.json({ ok: true });
}));

// ===========================================================================
// Groups & extraction
// ===========================================================================
app.get('/api/groups', wrap(async (req, res) => {
  const groups = await wa.getGroups();
  res.json({ groups });
}));

app.post('/api/extract', wrap(async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId is required.' });
  const result = await wa.extractGroup(groupId);
  res.json(result);
}));

app.post('/api/extract/cancel', wrap(async (req, res) => {
  const cancelling = wa.requestCancelExtract();
  res.json({ ok: true, cancelling });
}));

// ===========================================================================
// Contacts (backed by Supabase)
// ===========================================================================
app.get('/api/contacts', wrap(async (req, res) => {
  const { groupId } = req.query;
  let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
  if (groupId) query = query.eq('group_id', groupId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contacts: data || [] });
}));

app.delete('/api/contacts/:id', wrap(async (req, res) => {
  const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

app.delete('/api/contacts', wrap(async (req, res) => {
  // Delete a group's contacts, or ALL contacts only with an explicit ?all=true.
  // A missing groupId must never silently mean "delete everything".
  const { groupId, all } = req.query;
  if (!groupId && all !== 'true') {
    return res.status(400).json({ error: 'Refusing to delete all contacts without an explicit ?all=true.' });
  }
  let query = supabase.from('contacts').delete();
  query = groupId ? query.eq('group_id', groupId) : query.neq('id', -1);
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

app.post('/api/contacts/delete', wrap(async (req, res) => {
  // Bulk delete a specific set of contact ids.
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required.' });
  }
  const { error } = await supabase.from('contacts').delete().in('id', ids);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, deleted: ids.length });
}));

// Manual entry / Excel import — upsert contacts into a custom group.
// Each contact may carry its own group_name; otherwise the body `groupName`
// (or "Imported") is used. Numbers are normalized to digits only.
app.post('/api/contacts/add', wrap(async (req, res) => {
  const { groupName, contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'contacts array is required.' });
  }
  const fallbackName = (groupName && String(groupName).trim()) || 'Imported';

  const records = [];
  let skipped = 0;
  for (const c of contacts) {
    const digits = String(c.phone_number ?? c.phone ?? '').replace(/\D/g, '');
    if (!digits) { skipped += 1; continue; }
    const gName = (c.group_name && String(c.group_name).trim()) || fallbackName;
    records.push({
      phone_number: digits,
      name: c.name ? String(c.name).trim() : null,
      pushname: c.pushname ? String(c.pushname).trim() : null,
      about_text: c.about_text != null && String(c.about_text).trim() ? String(c.about_text).trim() : null,
      group_id: customGroupId(gName),
      group_name: gName,
    });
  }
  if (!records.length) return res.status(400).json({ error: 'No valid phone numbers found.' });

  // Dedupe within the payload so one INSERT can't touch the same (phone, group)
  // twice (which Postgres ON CONFLICT rejects).
  const seen = new Set();
  const deduped = records.filter((r) => {
    const key = `${r.phone_number}|${r.group_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let added = 0;
  for (const batch of chunkArr(deduped, 200)) {
    const { error } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'phone_number,group_id' });
    if (error) return res.status(500).json({ error: error.message });
    added += batch.length;
  }
  res.json({ ok: true, added, skipped });
}));

// ===========================================================================
// Quick send (one contact) — text, media or voice note
// ===========================================================================
app.post('/api/send', upload.single('file'), wrap(async (req, res) => {
  const { number, type, text, caption } = req.body;
  const viewOnce = req.body.viewOnce === 'true' || req.body.viewOnce === true;
  try {
    if (!number) return res.status(400).json({ error: 'number is required.' });

    if (type === 'text') {
      await wa.sendText(number, text);
    } else if (type === 'voice') {
      if (!req.file) return res.status(400).json({ error: 'An audio file is required for a voice note.' });
      await wa.sendMediaFile(number, req.file.path, { asVoice: true, caption });
    } else {
      // media (image/video/document/audio-as-file)
      if (!req.file) return res.status(400).json({ error: 'A file is required.' });
      await wa.sendMediaFile(number, req.file.path, { asVoice: false, caption, viewOnce });
    }
    res.json({ ok: true });
  } finally {
    cleanup(req.file);
  }
}));

// ===========================================================================
// Broadcast (many contacts)
// ===========================================================================
app.post('/api/broadcast', upload.single('file'), wrap(async (req, res) => {
  try {
    const asVoice = req.body.asVoice === 'true' || req.body.asVoice === true;
    const viewOnce = req.body.viewOnce === 'true' || req.body.viewOnce === true;
    const text = req.body.text || '';
    const caption = req.body.caption || '';

    // Validate while we can still return a real status code — this handler
    // responds 200 before the broadcast runs asynchronously.
    wa.ensureReady();
    if (wa.broadcasting) {
      cleanup(req.file);
      return res.status(409).json({ error: 'A broadcast is already in progress.' });
    }
    if (!text.trim() && !req.file) {
      cleanup(req.file);
      return res.status(400).json({ error: 'Provide a message or a file to broadcast.' });
    }

    // Recipients: either an explicit JSON array of numbers, or "all saved contacts".
    let numbers = [];
    if (req.body.numbers) {
      try {
        numbers = JSON.parse(req.body.numbers);
      } catch (_) {
        numbers = String(req.body.numbers).split(',').map((n) => n.trim()).filter(Boolean);
      }
    } else {
      const { groupId } = req.body;
      let query = supabase.from('contacts').select('phone_number');
      if (groupId) query = query.eq('group_id', groupId);
      const { data, error } = await query;
      if (error) { cleanup(req.file); return res.status(500).json({ error: error.message }); }
      numbers = [...new Set((data || []).map((c) => c.phone_number))];
    }

    if (!numbers.length) { cleanup(req.file); return res.status(400).json({ error: 'No recipients found.' }); }

    // Respond immediately; progress is streamed over Socket.io.
    res.json({ ok: true, started: true, recipients: numbers.length });

    wa.broadcast(numbers, {
      text,
      caption,
      asVoice,
      viewOnce,
      filePath: req.file ? req.file.path : null,
    })
      .catch((e) => wa.log(`Broadcast error: ${e.message}`, 'error'))
      .finally(() => cleanup(req.file));
  } catch (e) {
    cleanup(req.file);
    throw e;
  }
}));

// ===========================================================================
// Keywords CRUD
// ===========================================================================
app.get('/api/keywords', wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ keywords: data || [] });
}));

app.post('/api/keywords', wrap(async (req, res) => {
  const { keyword, reply } = req.body;
  if (!keyword || !reply) return res.status(400).json({ error: 'keyword and reply are required.' });
  const { data, error } = await supabase
    .from('keywords')
    .insert({ keyword: keyword.trim(), reply })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ keyword: data });
}));

app.put('/api/keywords/:id', wrap(async (req, res) => {
  const { keyword, reply } = req.body;
  const { data, error } = await supabase
    .from('keywords')
    .update({ keyword: keyword?.trim(), reply })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ keyword: data });
}));

app.delete('/api/keywords/:id', wrap(async (req, res) => {
  const { error } = await supabase.from('keywords').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

// ===========================================================================
// Settings (auto-reply toggle)
// ===========================================================================
app.get('/api/settings', wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .order('id', { ascending: true })
    .limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ settings: data && data[0] ? data[0] : { auto_reply_enabled: false } });
}));

app.put('/api/settings', wrap(async (req, res) => {
  const { auto_reply_enabled } = req.body;

  // Ensure a single settings row exists, then update it. Do NOT swallow the
  // read error — a transient failure must not fall through to an INSERT that
  // would create a duplicate settings row.
  const { data: existing, error: readError } = await supabase
    .from('settings')
    .select('id')
    .order('id', { ascending: true })
    .limit(1);
  if (readError) return res.status(500).json({ error: readError.message });
  if (existing && existing[0]) {
    const { data, error } = await supabase
      .from('settings')
      .update({ auto_reply_enabled: !!auto_reply_enabled, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data });
  }

  const { data, error } = await supabase
    .from('settings')
    .insert({ auto_reply_enabled: !!auto_reply_enabled })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ settings: data });
}));

// ===========================================================================
// Messages: inbox (received) & sent history / revoke
// ===========================================================================
// True when a Supabase error means the table hasn't been created yet.
// Covers direct Postgres (42P01) and PostgREST schema-cache misses (PGRST205).
const isMissingTable = (error) =>
  error &&
  (error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|could not find the table|schema cache/i.test(error.message || ''));

app.get('/api/messages/received', wrap(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  let query = supabase
    .from('received_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (unreadOnly) query = query.eq('is_read', false);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return res.json({ messages: [], needsSetup: true });
    return res.status(500).json({ error: error.message });
  }
  res.json({ messages: data || [] });
}));

app.post('/api/messages/received/read', wrap(async (req, res) => {
  const { ids } = req.body || {};
  let query = supabase.from('received_messages').update({ is_read: true });
  query = Array.isArray(ids) && ids.length ? query.in('id', ids) : query.eq('is_read', false);
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}));

app.get('/api/messages/sent', wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('sent_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTable(error)) return res.json({ messages: [], needsSetup: true });
    return res.status(500).json({ error: error.message });
  }
  res.json({ messages: data || [] });
}));

app.post('/api/messages/delete', wrap(async (req, res) => {
  const { whatsapp_message_id } = req.body || {};
  if (!whatsapp_message_id) return res.status(400).json({ error: 'whatsapp_message_id is required.' });
  await wa.revokeMessage(whatsapp_message_id);
  res.json({ ok: true });
}));

app.post('/api/messages/delete-bulk', wrap(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required.' });
  }
  wa.ensureReady();
  let revoked = 0;
  let failed = 0;
  for (const id of ids) {
    if (!id) { failed += 1; continue; }
    try {
      await wa.revokeMessage(id);
      revoked += 1;
    } catch (_) {
      failed += 1;
    }
  }
  res.json({ ok: true, revoked, failed });
}));

// ===========================================================================
// Error handler
// ===========================================================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  // eslint-disable-next-line no-console
  console.error(`[HTTP ${status}] ${err.message}`);
  res.status(status).json({ error: err.message });
});

// --- Boot ------------------------------------------------------------------
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`\n🚀 Backend listening on http://localhost:${PORT}`);
  console.log(`   Accepting the dashboard from ${FRONTEND_URLS.join(', ')}\n`);
  wa.initialize();
});
