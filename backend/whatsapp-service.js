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
    const chat = await this.client.getChatById(groupId);
    if (!chat || !chat.isGroup) {
      const err = new Error('That chat is not a group or could not be found.');
      err.statusCode = 400;
      throw err;
    }

    const participants = chat.participants || (chat.groupMetadata && chat.groupMetadata.participants) || [];
    const total = participants.length;
    const groupName = chat.name || 'Unnamed group';
    this.log(`Extracting ${total} participants from "${groupName}"…`, 'info');

    const records = [];
    let processed = 0;

    for (const p of participants) {
      const serialized = p.id._serialized;
      const number = p.id.user;
      let name = null;
      let pushname = null;
      let about = null;

      try {
        const contact = await this.client.getContactById(serialized);
        name = contact.name || null;         // saved name (only if number is in your contacts)
        pushname = contact.pushname || null; // public display name
        try {
          about = await contact.getAbout();
        } catch (_) {
          about = null;
        }
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
      this.emit('extract-progress', { processed, total, number, groupName });

      // Gentle pacing to avoid hammering the WhatsApp web client.
      await sleep(250);
    }

    // Upsert in chunks to stay well under payload limits.
    let saved = 0;
    for (const batch of chunk(records, 200)) {
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

    this.log(`Extraction complete — saved ${saved} contacts from "${groupName}".`, 'success');
    return { total, saved, groupName, contacts: records };
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
    await this.client.sendMessage(chatId, text);
    this.log(`Text sent to ${number}.`, 'success');
  }

  /**
   * Send a media file. When `asVoice` is true the audio is delivered as a
   * native WhatsApp voice note (PTT) rather than an attached audio file.
   */
  async sendMediaFile(number, filePath, { asVoice = false, caption = '' } = {}) {
    this.ensureReady();
    const chatId = this.toChatId(number);
    const media = MessageMedia.fromFilePath(filePath);
    const options = {};
    if (asVoice) options.sendAudioAsVoice = true;
    if (caption) options.caption = caption;
    await this.client.sendMessage(chatId, media, options);
    this.log(`${asVoice ? 'Voice note' : 'Media'} sent to ${number}.`, 'success');
  }

  /**
   * Broadcast to a list of numbers with randomized human-like delays.
   * Progress streamed via `broadcast-progress`.
   */
  async broadcast(numbers, { text = '', filePath = null, asVoice = false, caption = '' } = {}) {
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
          if (media) {
            const options = {};
            if (asVoice) options.sendAudioAsVoice = true;
            if (caption || text) options.caption = caption || text;
            await this.client.sendMessage(chatId, media, options);
          } else {
            await this.client.sendMessage(chatId, text);
          }
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

      // Only auto-reply to 1:1 chats — never groups (@g.us), status
      // broadcasts (status@broadcast) or newsletters (@newsletter).
      if (!msg.from || !msg.from.endsWith('@c.us')) return;

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
    } catch (e) {
      this.log(`Auto-reply error: ${e.message}`, 'error');
    }
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
