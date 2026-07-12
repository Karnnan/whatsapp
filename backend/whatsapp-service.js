const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');
const { supabase } = require('./supabase-client');
const { memSnapshot } = require('./mem');

const AUTH_DIR = path.join(__dirname, 'baileys_auth');
const logger = pino({ level: 'silent' });

/**
 * WhatsApp engine built on Baileys — it speaks WhatsApp's multi-device protocol
 * directly over WebSocket (NO browser/Chromium), so it runs in ~100 MB and fits
 * a 512 MB host. Same public interface the server + rest of the app expect.
 */
class WhatsAppService {
  constructor() {
    this.sock = null;
    this.io = null;
    this.status = 'INITIALIZING'; // INITIALIZING | QR | AUTHENTICATED | READY | DISCONNECTED
    this.lastQr = null;
    this.me = null; // { pushname, number }
    this.broadcasting = false;
    this.extracting = false;
    this.cancelExtractFlag = false;
    this.connecting = false;
    this.recentIncomingIds = new Set();
    this.contacts = new Map(); // jid -> { name, notify, verifiedName }
  }

  attachIo(io) { this.io = io; }
  emit(event, payload) { if (this.io) this.io.emit(event, payload); }

  log(message, level = 'info') {
    // eslint-disable-next-line no-console
    console.log(`[WA:${level}] ${message}`);
    this.emit('log', { message, level, time: new Date().toISOString() });
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.status === 'QR' ? this.lastQr : null,
      me: this.me,
      broadcasting: this.broadcasting,
      extracting: this.extracting,
    };
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', this.getStatus());
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize() {
    if (this.connecting) return;
    this.connecting = true;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['WhatsApp Control', 'Chrome', '121.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });
      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', (u) => this.onConnectionUpdate(u));
      sock.ev.on('messages.upsert', (m) => this.onMessagesUpsert(m));
      sock.ev.on('contacts.upsert', (list) => this.mergeContacts(list));
      sock.ev.on('contacts.update', (list) => this.mergeContacts(list));
      sock.ev.on('messaging-history.set', ({ contacts }) => this.mergeContacts(contacts));

      this.log('Starting WhatsApp (Baileys) client…');
    } catch (e) {
      this.log(`Init error: ${e.message} [${memSnapshot()}]`, 'error');
      this.setStatus('DISCONNECTED');
      setTimeout(() => this.initialize().catch(() => {}), 4000);
    } finally {
      this.connecting = false;
    }
  }

  onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode
        .toDataURL(qr, { margin: 1, width: 320 })
        .then((url) => {
          this.lastQr = url;
          this.setStatus('QR');
          this.emit('qr', url);
          this.log('QR code generated — scan it with WhatsApp on your phone.');
        })
        .catch(() => {});
    }

    if (connection === 'connecting' && this.status !== 'QR') {
      this.setStatus('INITIALIZING');
    }

    if (connection === 'open') {
      const id = (this.sock && this.sock.user && this.sock.user.id) || '';
      const normalized = id ? jidNormalizedUser(id) : '';
      this.me = {
        pushname: (this.sock && this.sock.user && this.sock.user.name) || null,
        number: normalized ? normalized.split('@')[0] : null,
      };
      this.lastQr = null;
      this.setStatus('READY');
      this.log(`WhatsApp is ready. Connected as ${this.me.pushname || this.me.number || 'unknown'}. [${memSnapshot()}]`, 'success');
    }

    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const loggedOut = code === DisconnectReason.loggedOut;
      this.me = null;
      this.sock = null;

      if (loggedOut) {
        this.log(`Logged out. Clearing session… [${memSnapshot()}]`, 'error');
        this.clearAuth();
        this.setStatus('INITIALIZING');
        setTimeout(() => this.initialize().catch(() => {}), 1500);
      } else {
        this.log(`Connection closed (code ${code}) — reconnecting… [${memSnapshot()}]`, 'error');
        this.setStatus('DISCONNECTED');
        setTimeout(() => this.initialize().catch(() => {}), 2500);
      }
    }
  }

  clearAuth() {
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }

  async logout() {
    try {
      if (this.sock) await this.sock.logout();
    } catch (_) { /* ignore */ }
    this.sock = null;
    this.me = null;
    this.lastQr = null;
    this.clearAuth();
    this.setStatus('INITIALIZING');
    setTimeout(() => this.initialize().catch(() => {}), 1500);
  }

  ensureReady() {
    if (this.status !== 'READY' || !this.sock) {
      const err = new Error('WhatsApp is not connected yet. Scan the QR code first.');
      err.statusCode = 409;
      throw err;
    }
  }

  mergeContacts(list) {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || !c.id) continue;
      const prev = this.contacts.get(c.id) || {};
      this.contacts.set(c.id, {
        name: c.name || prev.name || null,
        notify: c.notify || prev.notify || null,
        verifiedName: c.verifiedName || prev.verifiedName || null,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Groups & extraction
  // ---------------------------------------------------------------------------

  requestCancelExtract() {
    if (!this.extracting) return false;
    this.cancelExtractFlag = true;
    this.log('Cancellation requested — stopping after the current contact…', 'warn');
    return true;
  }

  async getGroups() {
    this.ensureReady();
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups || {})
      .map((g) => ({
        id: g.id,
        name: g.subject || 'Unnamed group',
        participantCount: Array.isArray(g.participants) ? g.participants.length : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async extractGroup(groupId) {
    this.ensureReady();
    if (this.extracting) {
      const err = new Error('An extraction is already running.');
      err.statusCode = 409;
      throw err;
    }
    this.extracting = true;
    this.cancelExtractFlag = false;
    this.emit('status', this.getStatus());

    const records = [];
    let processed = 0;
    let cancelled = false;
    let saved = 0;
    let total = 0;
    let groupName = 'Unnamed group';

    try {
      const meta = await this.sock.groupMetadata(groupId);
      const participants = (meta && meta.participants) || [];
      total = participants.length;
      groupName = (meta && meta.subject) || 'Unnamed group';
      this.log(`Extracting ${total} participants from "${groupName}"…`);

      for (const p of participants) {
        if (this.cancelExtractFlag) {
          cancelled = true;
          this.log('Extraction cancelled — saving contacts collected so far…', 'warn');
          break;
        }

        const pjid = p.id;
        const number = String(pjid || '').split('@')[0];
        const contact = this.contacts.get(pjid) || {};
        const name = contact.name || null;
        const pushname = contact.notify || contact.verifiedName || null;
        let about = null;
        try {
          about = pickStatus(await this.sock.fetchStatus(pjid));
        } catch (_) { /* privacy / rate limit — leave null */ }

        records.push({
          phone_number: number,
          name,
          pushname,
          about_text: about,
          group_id: groupId,
          group_name: groupName,
        });

        processed += 1;
        this.emit('extract-progress', { processed, total, number, groupName, cancelled: false });
        await sleep(300);
      }

      for (const batch of chunk(records, 200)) {
        if (batch.length === 0) continue;
        const { error } = await supabase.from('contacts').upsert(batch, { onConflict: 'phone_number,group_id' });
        if (error) {
          this.log(`Supabase upsert error: ${error.message}`, 'error');
          const err = new Error(`Failed to save contacts: ${error.message}`);
          err.statusCode = 500;
          throw err;
        }
        saved += batch.length;
      }
    } finally {
      this.extracting = false;
      this.cancelExtractFlag = false;
      this.emit('status', this.getStatus());
    }

    this.emit('extract-progress', { processed, total, groupName, cancelled, done: true });
    this.log(
      `Extraction ${cancelled ? 'cancelled' : 'complete'} — saved ${saved} contacts from "${groupName}".`,
      cancelled ? 'warn' : 'success'
    );
    return { total, saved, groupName, cancelled, contacts: records };
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  toChatId(number) {
    const digits = String(number).replace(/\D/g, '');
    if (!digits) {
      const err = new Error('Invalid phone number.');
      err.statusCode = 400;
      throw err;
    }
    return `${digits}@s.whatsapp.net`;
  }

  async sendText(number, text) {
    this.ensureReady();
    if (!text || !text.trim()) {
      const err = new Error('Message text is empty.');
      err.statusCode = 400;
      throw err;
    }
    const jid = this.toChatId(number);
    const sent = await this.sock.sendMessage(jid, { text });
    await this.recordSent(number, text, 'text', sent);
    this.log(`Text sent to ${number}.`, 'success');
  }

  // Build a Baileys media message content object from a file + options.
  buildMediaContent(buffer, { asVoice = false, caption = '', viewOnce = false, mimetype = '', fileName = 'file' } = {}) {
    const mt = String(mimetype || '');
    if (asVoice) {
      return { audio: buffer, mimetype: mt || 'audio/ogg; codecs=opus', ptt: true };
    }
    if (mt.startsWith('image')) {
      return { image: buffer, mimetype: mt, caption: caption || undefined, viewOnce: viewOnce || undefined };
    }
    if (mt.startsWith('video')) {
      return { video: buffer, mimetype: mt, caption: caption || undefined, viewOnce: viewOnce || undefined };
    }
    if (mt.startsWith('audio')) {
      return { audio: buffer, mimetype: mt, ptt: false };
    }
    return { document: buffer, mimetype: mt || 'application/octet-stream', fileName, caption: caption || undefined };
  }

  async sendMediaFile(number, filePath, { asVoice = false, caption = '', viewOnce = false, mimetype = '' } = {}) {
    this.ensureReady();
    const jid = this.toChatId(number);
    const buffer = fs.readFileSync(filePath);
    const content = this.buildMediaContent(buffer, {
      asVoice, caption, viewOnce, mimetype, fileName: path.basename(filePath),
    });
    const sent = await this.sock.sendMessage(jid, content);
    const kind = asVoice ? 'voice' : 'media';
    await this.recordSent(number, caption || '', kind, sent);
    this.log(`${asVoice ? 'Voice note' : 'Media'} sent to ${number}${viewOnce ? ' (view once)' : ''}.`, 'success');
  }

  async broadcast(numbers, { text = '', filePath = null, mimetype = '', asVoice = false, caption = '', viewOnce = false } = {}) {
    this.ensureReady();
    if (this.broadcasting) {
      const err = new Error('A broadcast is already in progress.');
      err.statusCode = 409;
      throw err;
    }
    if (!Array.isArray(numbers) || numbers.length === 0) {
      const err = new Error('No recipients to broadcast to.');
      err.statusCode = 400;
      throw err;
    }
    const hasText = typeof text === 'string' && text.trim().length > 0;
    if (!hasText && !filePath) {
      const err = new Error('Broadcast has no content — provide a message or a file.');
      err.statusCode = 400;
      throw err;
    }

    // Dedupe by normalized chat id.
    const seen = new Set();
    numbers = numbers.filter((number) => {
      let jid;
      try { jid = this.toChatId(number); } catch (_) { return true; }
      if (seen.has(jid)) return false;
      seen.add(jid);
      return true;
    });

    const minDelay = Number(process.env.BROADCAST_MIN_DELAY || 4000);
    const maxDelay = Number(process.env.BROADCAST_MAX_DELAY || 9000);

    this.broadcasting = true;
    this.emit('status', this.getStatus());
    this.log(`Starting broadcast to ${numbers.length} recipients…`);

    let sent = 0;
    let failed = 0;
    const total = numbers.length;

    try {
      let buffer = null;
      if (filePath) buffer = fs.readFileSync(filePath);
      const mediaContent = buffer
        ? this.buildMediaContent(buffer, { asVoice, caption: caption || text, viewOnce, mimetype, fileName: path.basename(filePath) })
        : null;

      for (let i = 0; i < numbers.length; i += 1) {
        const number = numbers[i];
        try {
          const jid = this.toChatId(number);
          const content = mediaContent || { text };
          const msg = await this.sock.sendMessage(jid, content);
          await this.recordSent(
            number,
            mediaContent ? (caption || text || '') : text,
            mediaContent ? (asVoice ? 'voice' : 'media') : 'text',
            msg
          );
          sent += 1;
        } catch (e) {
          failed += 1;
          this.log(`Failed to send to ${number}: ${e.message}`, 'error');
        }

        this.emit('broadcast-progress', { processed: i + 1, total, sent, failed, number });
        if (i < numbers.length - 1) await sleep(randomBetween(minDelay, maxDelay));
      }
    } finally {
      this.broadcasting = false;
      this.emit('status', this.getStatus());
    }

    this.log(`Broadcast finished — ${sent} sent, ${failed} failed.`, 'success');
    return { total, sent, failed };
  }

  // ---------------------------------------------------------------------------
  // Incoming messages: inbox + auto-reply
  // ---------------------------------------------------------------------------

  onMessagesUpsert({ messages, type }) {
    if (type !== 'notify' || !Array.isArray(messages)) return;
    for (const msg of messages) {
      this.handleIncomingMessage(msg).catch((e) => this.log(`Incoming message error: ${e.message}`, 'error'));
    }
  }

  async handleIncomingMessage(msg) {
    if (!msg || !msg.message || !msg.key) return;
    if (msg.key.fromMe) return;
    const jid = msg.key.remoteJid || '';
    // Only 1:1 chats — skip groups (@g.us), status broadcasts and newsletters.
    if (!(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) return;

    await this.recordIncoming(msg, jid);
    await this.maybeAutoReply(msg, jid);
  }

  async recordIncoming(msg, jid) {
    try {
      const wid = msg.key.id;
      if (wid && this.recentIncomingIds.has(wid)) return;

      const number = String(jid).split('@')[0];
      const contact = this.contacts.get(jid) || {};
      const senderName = msg.pushName || contact.name || contact.notify || null;
      const text = messageText(msg);
      const body = text || (hasMedia(msg) ? `[${mediaKind(msg)}]` : '');

      const { data, error } = await supabase
        .from('received_messages')
        .insert({
          sender_number: number,
          sender_name: senderName,
          message_body: body,
          wa_message_id: wid || null,
          is_read: false,
        })
        .select()
        .single();
      if (error) {
        this.log(`Inbox save failed: ${error.message}`, 'error');
        return;
      }

      if (wid) {
        this.recentIncomingIds.add(wid);
        if (this.recentIncomingIds.size > 1000) {
          this.recentIncomingIds = new Set(Array.from(this.recentIncomingIds).slice(-500));
        }
      }
      this.log(`Inbox: message from ${senderName || `+${number}`}.`);
      this.emit('new-message', data);
    } catch (e) {
      this.log(`Inbox error: ${e.message}`, 'error');
    }
  }

  async maybeAutoReply(msg, jid) {
    const { data: settingsRow, error: settingsError } = await supabase
      .from('settings')
      .select('auto_reply_enabled')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (settingsError) return;
    if (!settingsRow || !settingsRow.auto_reply_enabled) return;

    const body = (messageText(msg) || '').toLowerCase().trim();
    if (!body) return;

    const { data: keywords, error: kwError } = await supabase.from('keywords').select('keyword, reply');
    if (kwError || !keywords || keywords.length === 0) return;

    const match = keywords.find((k) => matchesKeyword(body, (k.keyword || '').toLowerCase()));
    if (!match) return;

    await this.sock.sendMessage(jid, { text: match.reply }, { quoted: msg });
    this.log(`Auto-replied to ${jid} (matched "${match.keyword}").`, 'success');
  }

  // ---------------------------------------------------------------------------
  // Sent history + revoke
  // ---------------------------------------------------------------------------

  async recordSent(number, body, mediaType, sentMsg) {
    try {
      const waId = sentMsg && sentMsg.key ? sentMsg.key.id : null;
      await supabase.from('sent_messages').insert({
        recipient_number: String(number).replace(/\D/g, ''),
        message_body: body || null,
        media_type: mediaType || 'text',
        whatsapp_message_id: waId,
      });
    } catch (_) { /* history is non-critical */ }
  }

  async revokeMessage(waMessageId) {
    this.ensureReady();
    if (!waMessageId) {
      const err = new Error('Missing WhatsApp message id.');
      err.statusCode = 400;
      throw err;
    }
    // Reconstruct the message key from the stored recipient.
    const { data, error } = await supabase
      .from('sent_messages')
      .select('recipient_number')
      .eq('whatsapp_message_id', waMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      const err = new Error(error.message);
      err.statusCode = 500;
      throw err;
    }
    if (!data || !data.recipient_number) {
      const err = new Error('Original message not found in history — cannot delete.');
      err.statusCode = 404;
      throw err;
    }

    const jid = this.toChatId(data.recipient_number);
    await this.sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: true, id: waMessageId } });
    try {
      await supabase.from('sent_messages').update({ revoked: true }).eq('whatsapp_message_id', waMessageId);
    } catch (_) { /* ignore */ }
    this.log('Message deleted for everyone.', 'success');
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Whole-word keyword match so "hi" doesn't fire on "this". Both pre-lowercased.
function matchesKeyword(body, keyword) {
  if (!keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, 'u').test(body);
}

// Extract readable text from a Baileys message.
function messageText(m) {
  const msg = (m && m.message) || {};
  return (
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    (msg.videoMessage && msg.videoMessage.caption) ||
    (msg.documentMessage && msg.documentMessage.caption) ||
    (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedDisplayText) ||
    (msg.listResponseMessage && msg.listResponseMessage.title) ||
    (msg.ephemeralMessage && messageText({ message: msg.ephemeralMessage.message })) ||
    (msg.viewOnceMessage && messageText({ message: msg.viewOnceMessage.message })) ||
    ''
  );
}
function hasMedia(m) {
  const msg = (m && m.message) || {};
  return !!(msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage || msg.stickerMessage);
}
function mediaKind(m) {
  const msg = (m && m.message) || {};
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return msg.audioMessage.ptt ? 'voice' : 'audio';
  if (msg.documentMessage) return 'document';
  if (msg.stickerMessage) return 'sticker';
  return 'media';
}
// fetchStatus() return shape varies across Baileys versions — normalize it.
function pickStatus(res) {
  if (!res) return null;
  if (typeof res === 'string') return res || null;
  if (Array.isArray(res)) return pickStatus(res[0]);
  if (res.status) {
    if (typeof res.status === 'string') return res.status || null;
    if (typeof res.status === 'object') return pickStatus(res.status);
  }
  return null;
}

module.exports = new WhatsAppService();
