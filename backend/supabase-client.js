// @supabase/supabase-js's realtime client needs a global WebSocket. Node < 22
// (and some slim Docker images) don't provide one, which crashes
// @supabase/realtime-js at startup with "native WebSocket not found". Polyfill
// from 'ws' when it's missing — must run BEFORE requiring supabase-js.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    // eslint-disable-next-line global-require
    globalThis.WebSocket = require('ws');
  } catch (_) {
    /* ws only needed on older Node; ignore if unavailable */
  }
}

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const isConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isConfigured) {
  console.warn(
    '⚠️  Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env\n' +
    '   The server will start, but database features (contacts, keywords, settings) will fail until you do.'
  );
}

// Fall back to a syntactically valid placeholder so createClient does not throw
// when credentials are missing; actual queries will error clearly instead.
const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseKey || 'public-anon-placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

module.exports = { supabase, isConfigured };
