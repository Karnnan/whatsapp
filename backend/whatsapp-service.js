const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { supabase } = require('./supabase-client');

/**
 * Wraps a single whatsapp-web.js client and exposes high-level operations
 * (extraction, sending, broadcasting, auto-reply) plus real-time events that
 * are streamed to the dashboard over Socket.io.
 */
class WhatsAppService {
  constructor() {
    this.client = null;
    this.io = null;
    // INITIALIZING | QR | AUTHENTICATED | READY | DISCONNECTED
    this.status = 'INITIALIZING';
    this.lastQr = null;      // data-URL of the current QR code
    this.me = null;          // { pushname, number } once ready
    this.broadcasting = false;
    this.extracting = false;
    this.cancelExtractFlag = false;
    this.recentIncomingIds = new Set(); // de-dupe re-delivered 'message' events
  }

  attachIo(io) {
    this.io = io;
  }

  emit(event, payload) {
    if (this.io) this.io.emit(event, payload);
  }

  log(message, level = 'info') {
    const entry = { message, level, time: new Date().toISOString() };
    // eslint-disable-next-line no-console
    console.log(`[WA:${level}] ${message}`);
    this.emit('log', entry);
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

  initialize() {
    if (this.client) return;

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
      puppeteer: {
        headless: true,
        // Use a system-installed Chromium when provided (e.g. in Docker/hosting).
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.client.on('qr', async (qr) => {
      try {
        this.lastQr = await qrcode.toDataURL(qr, { margin: 1, width: 320 });
      } catch (e) {
        this.lastQr = null;
      }
      this.setStatus('QR');
      this.log('QR code generated — scan it with WhatsApp on your phone.', 'info');
      this.emit('qr', this.lastQr);
    });

    this.client.on('authenticated', () => {
      this.setStatus('AUTHENTICATED');
      this.log('Authenticated. Finishing sync…', 'success');
    });

    this.client.on('auth_failure', (msg) => {
      this.setStatus('DISCONNECTED');
      this.log(`Authentication failure: ${msg}`, 'error');
    });

    this.client.on('ready', () => {
      const info = this.client.info || {};
      this.me = {
        pushname: info.pushname || null,
        number: info.wid ? info.wid.user : null,
      };
      this.lastQr = null;
      this.setStatus('READY');
      this.log(`WhatsApp is ready. Connected as ${this.me.pushname || this.me.number || 'unknown'}.`, 'success');
    });

    this.client.on('disconnected', (reason) => {
      this.me = null;
      this.setStatus('DISCONNECTED');
      this.log(`Client disconnected: ${reason}`, 'error');
    });

    this.client.on('message', (msg) => this.handleIncomingMessage(msg));

    this.setStatus('INITIALIZING');
    this.log('Starting WhatsApp client…', 'info');
    this.client.initialize().catch((e) => {
      this.log(`Failed to initialize client: ${e.message}`, 'error');
      this.setStatus('DISCONNECTED');
    });
  }

  async logout() {
    if (!this.client) return;
    try {
      await this.client.logout();
      this.log('Logged out. Destroying session…', 'info');
    } catch (e) {
      this.log(`Logout error: ${e.message}`, 'error');
    }
    try {
      await this.client.destroy();
    } catch (_) { /* ignore */ }
    this.client = null;
    this.me = null;
    this.lastQr = null;
    this.setStatus('INITIALIZING');
    // Re-initialize so a fresh QR is produced.
    setTimeout(() => this.initialize(), 1500);
  }

  ensureReady() {
    if (this.status !== 'READY' || !this.client) {
      const err = new Error('WhatsApp is not connected yet. Scan the QR code first.');
      err.statusCode = 409;
      throw err;
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
    const chats = await this.client.getChats();
    return chats
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name || 'Unnamed group',
        participantCount: Array.isArray(c.participants) ? c.participants.length : (c.groupMetadata?.participants?.length || 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract every participant of a group: phone number, saved name, pushname
   * and "About" status. Progress is streamed via the `extract-progress` event.
   * Results are upserted into the Supabase `contacts` table.
   */
  async extractGroup(groupId) {
    this.ensureReady();
    if (this.extracting) {
      const err = new Error('An extraction is already running.');
      err.statusCode = 409;
      throw err;
    }
    // Claim the flag synchronously — with no await between the guard above and
    // this assignment, a concurrent extract call is reliably rejected. The flag
    // stays held (finally below) through the whole save, so a re-click during
    // the DB upsert can't start a second run.
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
      const chat = await this.client.getChatById(groupId);
      if (!chat || !chat.isGroup) {
        const err = new Error('That chat is not a group or could not be found.');
        err.statusCode = 400;
        throw err;
      }

      const participants = chat.participants || (chat.groupMetadata && chat.groupMetadata.participants) || [];
      total = participants.length;
      groupName = chat.name || 'Unnamed group';
      this.log(`Extracting ${total} participants from "${groupName}"…`, 'info');

      for (const p of participants) {
        if (this.cancelExtractFlag) {
          cancelled = true;
          this.log('Extraction cancelled — saving contacts collected so far…', 'warn');
          break;
        }

        const serialized = p.id._serialized;
        const number = p.id.user;
        let name = null;
        let pushname = null;
        let about = null;

        try {
          const contact = await this.client.getContactById(serialized);
          name = contact.name || null;                          // saved name (only if number is in your contacts)
          pushname = contact.pushname || contact.verifiedName || null; // public display name
          about = await this.fetchAbout(contact);
        } catch (_) {
          // Contact lookup can fail for some numbers; keep what we have.
        }

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

        // Gentle pacing to avoid hammering the WhatsApp web client.
        await sleep(250);
      }

      // Upsert in chunks while still holding the extracting flag.
      for (const batch of chunk(records, 200)) {
        if (batch.length === 0) continue;
        const { error } = await supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'phone_number,group_id' });
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

  /**
   * Best-effort fetch of a contact's "About" text. WhatsApp frequently returns
   * null for privacy reasons; we retry once on a transient failure and degrade
   * to null rather than letting it abort the whole contact.
   */
  async fetchAbout(contact) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const about = await contact.getAbout();
        return about === undefined ? null : about;
      } catch (_) {
        if (attempt === 0) await sleep(400);
      }
    }
    return null;
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
    return `${digits}@c.us`;
  }

  async sendText(number, text) {
    this.ensureReady();
    if (!text || !text.trim()) {
      const err = new Error('Message text is empty.');
      err.statusCode = 400;
      throw err;
    }
    const chatId = this.toChatId(number);
    const sentMsg = await this.client.sendMessage(chatId, text);
    await this.recordSent(number, text, 'text', sentMsg);
    this.log(`Text sent to ${number}.`, 'success');
  }

  /**
   * Send a media file. When `asVoice` is true the audio is delivered as a
   * native WhatsApp voice note (PTT) rather than an attached audio file.
   */
  async sendMediaFile(number, filePath, { asVoice = false, caption = '', viewOnce = false } = {}) {
    this.ensureReady();
    const chatId = this.toChatId(number);
    const media = MessageMedia.fromFilePath(filePath);
    const options = {};
    if (asVoice) options.sendAudioAsVoice = true;
    if (viewOnce) options.isViewOnce = true;
    if (caption) options.caption = caption;
    const sentMsg = await this.client.sendMessage(chatId, media, options);
    await this.recordSent(number, caption || '', asVoice ? 'voice' : 'media', sentMsg);
    this.log(`${asVoice ? 'Voice note' : 'Media'} sent to ${number}${viewOnce ? ' (view once)' : ''}.`, 'success');
  }

  /**
   * Broadcast to a list of numbers with randomized human-like delays.
   * Progress streamed via `broadcast-progress`.
   */
  async broadcast(numbers, { text = '', filePath = null, asVoice = false, caption = '', viewOnce = false } = {}) {
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

    // Deduplicate by normalized chat id so the same person supplied twice (in
    // any format, e.g. "+1 415…" and "1415…") is only messaged once.
    const seenChatIds = new Set();
    numbers = numbers.filter((number) => {
      let chatId;
      try {
        chatId = this.toChatId(number);
      } catch (_) {
        return true; // keep invalid entries so the send loop reports the error
      }
      if (seenChatIds.has(chatId)) return false;
      seenChatIds.add(chatId);
      return true;
    });

    const minDelay = Number(process.env.BROADCAST_MIN_DELAY || 4000);
    const maxDelay = Number(process.env.BROADCAST_MAX_DELAY || 9000);

    this.broadcasting = true;
    this.emit('status', this.getStatus());
    this.log(`Starting broadcast to ${numbers.length} recipients…`, 'info');

    let sent = 0;
    let failed = 0;
    const total = numbers.length;

    try {
      // Pre-load media once so we don't read the file for every recipient.
      // Kept inside try so a bad file path can't wedge the broadcasting flag.
      let media = null;
      if (filePath) media = MessageMedia.fromFilePath(filePath);

      for (let i = 0; i < numbers.length; i += 1) {
        const number = numbers[i];
        try {
          const chatId = this.toChatId(number);
          let sentMsg;
          if (media) {
            const options = {};
            if (asVoice) options.sendAudioAsVoice = true;
            if (viewOnce) options.isViewOnce = true;
            if (caption || text) options.caption = caption || text;
            sentMsg = await this.client.sendMessage(chatId, media, options);
          } else {
            sentMsg = await this.client.sendMessage(chatId, text);
          }
          await this.recordSent(
            number,
            media ? (caption || text || '') : text,
            media ? (asVoice ? 'voice' : 'media') : 'text',
            sentMsg
          );
          sent += 1;
        } catch (e) {
          failed += 1;
          this.log(`Failed to send to ${number}: ${e.message}`, 'error');
        }

        this.emit('broadcast-progress', { processed: i + 1, total, sent, failed, number });

        // Random delay between messages (skip after the last one).
        if (i < numbers.length - 1) {
          const delay = randomBetween(minDelay, maxDelay);
          await sleep(delay);
        }
      }
    } finally {
      this.broadcasting = false;
      this.emit('status', this.getStatus());
    }

    this.log(`Broadcast finished — ${sent} sent, ${failed} failed.`, 'success');
    return { total, sent, failed };
  }

  // ---------------------------------------------------------------------------
  // Auto-reply
  // ---------------------------------------------------------------------------

  async handleIncomingMessage(msg) {
    try {
      if (msg.fromMe) return;
      const from = msg.from || '';
      // Skip groups (@g.us), status broadcasts and newsletters. Keep 1:1 chats —
      // which modern WhatsApp may address as @c.us OR the newer @lid scheme, so
      // we exclude the non-1:1 types rather than requiring @c.us.
      if (
        !from ||
        from.endsWith('@g.us') ||
        from.endsWith('@newsletter') ||
        from.endsWith('@broadcast') ||
        from === 'status@broadcast'
      ) return;

      await this.recordIncoming(msg);
      await this.maybeAutoReply(msg);
    } catch (e) {
      this.log(`Incoming message error: ${e.message}`, 'error');
    }
  }

  // Save an incoming direct message to the inbox and alert the dashboard.
  async recordIncoming(msg) {
    try {
      const wid = msg.id ? msg.id._serialized : null;
      // Guard against whatsapp-web.js occasionally re-emitting the same message.
      if (wid && this.recentIncomingIds.has(wid)) return;

      let number = String(msg.from || '').split('@')[0];
      let senderName = null;
      try {
        const contact = await msg.getContact();
        senderName = contact.name || contact.pushname || null;
        if (contact.number) number = contact.number; // real phone even under @lid
      } catch (_) { /* best effort */ }

      const body = msg.body && msg.body.trim()
        ? msg.body
        : (msg.hasMedia ? `[${msg.type || 'media'}]` : '');

      const { data, error } = await supabase
        .from('received_messages')
        .insert({
          sender_number: number,
          sender_name: senderName,
          message_body: body,
          wa_message_id: wid,
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
      this.log(`Inbox: message from ${senderName || `+${number}`}.`, 'info');
      this.emit('new-message', data);
    } catch (e) {
      this.log(`Inbox error: ${e.message}`, 'error');
    }
  }

  async maybeAutoReply(msg) {
    const { data: settingsRow, error: settingsError } = await supabase
      .from('settings')
      .select('auto_reply_enabled')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (settingsError) return;
    if (!settingsRow || !settingsRow.auto_reply_enabled) return;

    const body = (msg.body || '').toLowerCase().trim();
    if (!body) return;

    const { data: keywords, error: kwError } = await supabase
      .from('keywords')
      .select('keyword, reply');
    if (kwError || !keywords || keywords.length === 0) return;

    const match = keywords.find((k) => matchesKeyword(body, (k.keyword || '').toLowerCase()));
    if (!match) return;

    await msg.reply(match.reply);
    this.log(`Auto-replied to ${msg.from} (matched "${match.keyword}").`, 'success');
  }

  // Record a message we sent, so it can later be revoked ("delete for everyone").
  async recordSent(number, body, mediaType, sentMsg) {
    try {
      await supabase.from('sent_messages').insert({
        recipient_number: String(number).replace(/\D/g, ''),
        message_body: body || null,
        media_type: mediaType || 'text',
        whatsapp_message_id: sentMsg && sentMsg.id ? sentMsg.id._serialized : null,
      });
    } catch (_) { /* history is non-critical; never fail a send over it */ }
  }

  // Delete a previously-sent message for everyone.
  async revokeMessage(waMessageId) {
    this.ensureReady();
    if (!waMessageId) {
      const err = new Error('Missing WhatsApp message id.');
      err.statusCode = 400;
      throw err;
    }
    let msg = null;
    try {
      msg = await this.client.getMessageById(waMessageId);
    } catch (_) {
      msg = null;
    }
    if (!msg) {
      const err = new Error('Message not found on WhatsApp — it may be too old to delete.');
      err.statusCode = 404;
      throw err;
    }
    await msg.delete(true); // true = delete for everyone
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

// Whole-word (boundary) match so a keyword like "hi" doesn't fire on "this".
// Both arguments are expected to already be lower-cased.
function matchesKeyword(body, keyword) {
  if (!keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, 'u').test(body);
}

module.exports = new WhatsAppService();
