/**
 * WASI Intelligence — Secure Claude AI Proxy Server
 * Hides the Anthropic API key from the browser.
 * Deploy on Render.com (free tier).
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Environment variables (set in Render dashboard) ───────────────────────
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;   // sk-ant-...
const WASI_ACCESS_TOKENS = (process.env.WASI_ACCESS_TOKENS || 'WASI-DEMO-2026')
  .split(',').map(t => t.trim()).filter(Boolean);
const CLAUDE_MODEL       = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const ALLOWED_ORIGINS    = (process.env.ALLOWED_ORIGINS || 'https://atarawendesidkabore-hash.github.io')
  .split(',').map(o => o.trim());

if (!ANTHROPIC_API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY is not set. Add it in Render environment variables.');
  process.exit(1);
}

// ── CORS — only allow your GitHub Pages domain ────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, Render healthcheck)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return callback(null, true);
    callback(new Error('CORS: origin not allowed — ' + origin));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wasi-token']
}));

app.use(express.json({ limit: '32kb' }));

// ── Audit logging — structured, token-safe (hashed, never plaintext) ─────
function auditLog(event) {
  const entry = {
    ts:       new Date().toISOString(),
    event:    event.event,
    // Token hash (first 8 chars of SHA-256) — identifies user without exposing token
    tok:      event.token
              ? crypto.createHash('sha256').update(event.token).digest('hex').slice(0, 8)
              : 'anonymous',
    endpoint: event.endpoint || '',
    status:   event.status   || 0,
    ms:       event.ms       || 0,
    ip:       event.ip       || '',
    // Message stats (no content — just metadata)
    msg_count:  event.msg_count  || 0,
    sys_len:    event.sys_len    || 0,
    tokens_in:  event.tokens_in  || 0,
    tokens_out: event.tokens_out || 0,
  };
  // Structured JSON log — parse with DataDog / Logtail / Papertrail
  console.log(JSON.stringify(entry));
}

// ── Rate limiting — 30 requests per user per minute ──────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.headers['x-wasi-token'] || req.ip,
  message: { error: 'Trop de requêtes. Attendez 1 minute.' }
});
app.use('/api/', limiter);

// ── Token authentication middleware ──────────────────────────────────────
function requireToken(req, res, next) {
  const token = req.headers['x-wasi-token'] || req.body?.wasi_token;
  if (!token || !WASI_ACCESS_TOKENS.includes(token)) {
    auditLog({ event: 'auth_fail', token, endpoint: req.path, status: 401,
               ip: req.headers['x-forwarded-for'] || req.ip });
    return res.status(401).json({ error: 'Token WASI invalide ou manquant.' });
  }
  // Attach token to request for downstream audit logging
  req.wasiToken = token;
  next();
}

// ── Health check ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'WASI AI Proxy',
    status:  'online',
    version: '1.0.0',
    model:   CLAUDE_MODEL
  });
});

// ── Main proxy endpoint ───────────────────────────────────────────────────
app.post('/api/chat', requireToken, async (req, res) => {
  const { messages, system, max_tokens } = req.body;
  const t0 = Date.now();

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] requis.' });
  }

  // Sanitize — only pass role + content strings, no injected fields
  const cleanMessages = messages.map(m => ({
    role:    m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 8000)
  }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: Math.min(max_tokens || 1800, 2000),
        system:     String(system || '').slice(0, 20000),
        messages:   cleanMessages
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      auditLog({ event: 'chat_error', token: req.wasiToken, endpoint: '/api/chat',
                 status: response.status, ms: Date.now()-t0,
                 ip: req.headers['x-forwarded-for'] || req.ip,
                 msg_count: cleanMessages.length, sys_len: (system||'').length });
      return res.status(response.status).json({
        error: err?.error?.message || 'Erreur API Anthropic ' + response.status
      });
    }

    const data = await response.json();
    const reply = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim() || 'Réponse indisponible.';

    // Audit successful chat request (no message content — metadata only)
    auditLog({
      event:      'chat_ok',
      token:      req.wasiToken,
      endpoint:   '/api/chat',
      status:     200,
      ms:         Date.now() - t0,
      ip:         req.headers['x-forwarded-for'] || req.ip,
      msg_count:  cleanMessages.length,
      sys_len:    (system || '').length,
      tokens_in:  data.usage?.input_tokens  || 0,
      tokens_out: data.usage?.output_tokens || 0,
    });

    res.json({ reply, model: data.model, usage: data.usage });

  } catch (err) {
    auditLog({ event: 'chat_exception', token: req.wasiToken, endpoint: '/api/chat',
               status: 500, ms: Date.now()-t0,
               ip: req.headers['x-forwarded-for'] || req.ip });
    res.status(500).json({ error: 'Erreur serveur proxy: ' + err.message });
  }
});

// ── Token validation endpoint (called on login) ───────────────────────────
app.post('/api/auth', (req, res) => {
  const { token } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.ip;
  if (!token || !WASI_ACCESS_TOKENS.includes(token)) {
    auditLog({ event: 'login_fail', token, endpoint: '/api/auth', status: 401, ip });
    return res.status(401).json({ valid: false, message: 'Token invalide.' });
  }
  auditLog({ event: 'login_ok', token, endpoint: '/api/auth', status: 200, ip });
  res.json({ valid: true, message: 'Accès autorisé — WASI Intelligence.' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 WASI AI Proxy running on port ${PORT}`);
  console.log(`   Model  : ${CLAUDE_MODEL}`);
  console.log(`   Tokens : ${WASI_ACCESS_TOKENS.length} token(s) configured`);
  console.log(`   CORS   : ${ALLOWED_ORIGINS.join(', ')}\n`);
});
