'use strict';
// Planner assistant – Gemini proxy with per-user daily limits. No dependencies (Node 18+).
const http = require('http');
const crypto = require('crypto');

const env = process.env;
const PORT = +env.PORT || 10000;
const KEY = env.GEMINI_API_KEY || '';
const OWNER_CODE = env.OWNER_CODE || '';
const LIMIT = +env.LIMIT || 50;                       // user messages (turns) per device per day
const IP_LIMIT = +env.IP_LIMIT || 150;                // user messages per IP per day (backstop)
const MAX_PER_TURN = +env.MAX_PER_TURN || 5;          // Gemini requests per turn (transcribe + tool steps)
const DEVICE_REQ_CAP = +env.DEVICE_REQ_CAP || LIMIT * 4;
const IP_REQ_CAP = +env.IP_REQ_CAP || IP_LIMIT * 4;
const TZ = env.TZ_RESET || 'Asia/Jerusalem';
const MODELS = (env.MODELS || 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BODY = 12 * 1024 * 1024;
const ORIGINS = (env.ALLOWED_ORIGINS || 'https://planner-yqc2.onrender.com').split(',').map(s => s.trim()).filter(Boolean);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const API = env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta/models/';

if (!KEY) console.warn('WARNING: GEMINI_API_KEY is not set');
if (!OWNER_CODE) console.warn('WARNING: OWNER_CODE is not set – no unlimited user');

// ---------- daily counters (in memory, reset at midnight Asia/Jerusalem) ----------
const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let day = dayKey();
let devices = new Map(); // id -> {turns: Map(turnId -> requests), reqs}
let ips = new Map();     // ip -> {turns: Set(deviceId:turnId), reqs}
function roll() { const d = dayKey(); if (d !== day) { day = d; devices = new Map(); ips = new Map(); } }
const dev = id => { let x = devices.get(id); if (!x) { x = { turns: new Map(), reqs: 0 }; devices.set(id, x); } return x; };
const ipRec = ip => { let x = ips.get(ip); if (!x) { x = { turns: new Set(), reqs: 0 }; ips.set(ip, x); } return x; };

function isOwner(req) {
  const c = String(req.headers['x-owner-code'] || '');
  if (!OWNER_CODE || !c) return false;
  const a = crypto.createHash('sha256').update(c).digest(), b = crypto.createHash('sha256').update(OWNER_CODE).digest();
  return crypto.timingSafeEqual(a, b);
}
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
const idOk = s => /^[A-Za-z0-9_-]{8,80}$/.test(s || '');

// ---------- http helpers ----------
function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.includes(o) || LOCAL.test(o))) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Turn-Id, X-Owner-Code');
    res.setHeader('Access-Control-Expose-Headers', 'X-Remaining, X-Limit, X-Owner');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}
function send(res, status, obj, headers = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function quotaHeaders(owner, d) {
  return owner ? { 'X-Remaining': 'unlimited', 'X-Limit': String(LIMIT), 'X-Owner': '1' }
    : { 'X-Remaining': String(Math.max(0, LIMIT - (d ? d.turns.size : 0))), 'X-Limit': String(LIMIT) };
}

// ---------- Gemini ----------
async function callGemini(payload) {
  let last = null;
  // one quick second pass when every model was just overloaded (503 spikes are usually short)
  for (const model of [...MODELS, '__wait__', MODELS[0]]) {
    if (model === '__wait__') { if (!last || last.status !== 503) break; await new Promise(r => setTimeout(r, 1500)); continue; }
    let r, text;
    try {
      r = await fetch(API + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(90000),
      });
      text = await r.text();
    } catch (e) { last = { status: 504, text: JSON.stringify({ error: { message: 'timeout/network' } }) }; continue; }
    if (r.ok) return { status: 200, text, model };
    last = { status: r.status, text };
    // try the next model only when this one is overloaded / out of quota / missing
    if (![429, 500, 503, 404].includes(r.status)) break;
  }
  return last;
}
const ALLOWED_FIELDS = ['contents', 'systemInstruction', 'tools', 'toolConfig', 'generationConfig'];

async function handleGemini(req, res) {
  roll();
  const owner = isOwner(req);
  const ip = clientIp(req);
  const devId = idOk(req.headers['x-device-id']) ? String(req.headers['x-device-id']) : 'ip-' + ip;
  const turnId = idOk(req.headers['x-turn-id']) ? String(req.headers['x-turn-id']) : crypto.randomUUID();

  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'too_big' : 'bad_json' }); }
  if (!body || !Array.isArray(body.contents) || !body.contents.length) return send(res, 400, { error: 'bad_request' });
  const payload = {}; for (const k of ALLOWED_FIELDS) if (body[k] !== undefined) payload[k] = body[k];

  const d = dev(devId), ipr = ipRec(ip);
  let newTurn = false;
  if (!owner) {
    const turnReqs = d.turns.get(turnId);
    if (turnReqs === undefined) {
      if (d.turns.size >= LIMIT || ipr.turns.size >= IP_LIMIT) return send(res, 429, { error: 'limit', limit: LIMIT }, quotaHeaders(false, d));
      newTurn = true;
    } else if (turnReqs >= MAX_PER_TURN) return send(res, 429, { error: 'turn', limit: LIMIT }, quotaHeaders(false, d));
    if (d.reqs >= DEVICE_REQ_CAP || ipr.reqs >= IP_REQ_CAP) return send(res, 429, { error: 'limit', limit: LIMIT }, quotaHeaders(false, d));
    d.turns.set(turnId, (turnReqs || 0) + 1); ipr.turns.add(devId + ':' + turnId); d.reqs++; ipr.reqs++;
  }

  const out = await callGemini(payload);
  if (out.status !== 200 && !owner) {
    // upstream failure: don't charge the user for it
    const n = d.turns.get(turnId);
    if (newTurn) { d.turns.delete(turnId); ipr.turns.delete(devId + ':' + turnId); } else if (n) d.turns.set(turnId, n - 1);
  }
  const qh = quotaHeaders(owner, d);
  if (out.status === 200) return send(res, 200, out.text, qh);
  let msg = ''; try { msg = JSON.parse(out.text).error.message || ''; } catch (e) {}
  console.warn('gemini error', out.status, msg.slice(0, 200));
  if ([429, 500, 503, 504].includes(out.status)) return send(res, 503, { error: 'busy' }, qh);
  return send(res, 502, { error: 'upstream', status: out.status, message: msg.slice(0, 300) }, qh);
}

function handleQuota(req, res) {
  roll();
  const owner = isOwner(req);
  const devId = idOk(req.headers['x-device-id']) ? String(req.headers['x-device-id']) : 'ip-' + clientIp(req);
  const d = devices.get(devId);
  const used = d ? d.turns.size : 0;
  send(res, 200, { owner, limit: LIMIT, used, remaining: owner ? null : Math.max(0, LIMIT - used) }, quotaHeaders(owner, d));
}

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    const path = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (path === '/healthz' || path === '/') return send(res, 200, { ok: true, model: MODELS[0], keySet: !!KEY });
    if (path === '/api/gemini' && req.method === 'POST') return await handleGemini(req, res);
    if (path === '/api/quota' && req.method === 'GET') return handleQuota(req, res);
    send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'server' });
  }
});
server.requestTimeout = 120000;
server.listen(PORT, () => console.log(`planner-ai listening on ${PORT} (models: ${MODELS.join(', ')}, limit ${LIMIT}/day)`));
