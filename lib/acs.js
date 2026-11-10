/**
 * lib/acs.js — utilitários compartilhados das funções /api (ACS Conecta)
 * Substitui o conexao.php + as funções repetidas em cada .php.
 *
 * Variáveis de ambiente (configurar na Vercel):
 *   DATABASE_URL    string de conexão Postgres do Supabase (pooler, porta 6543)
 *   SESSION_SECRET  texto aleatório com 32+ caracteres (assina o cookie de sessão)
 */
const { Pool, types } = require('pg');
const crypto = require('crypto');

// DATE/TIME chegam como texto ('AAAA-MM-DD' / 'HH:MM:SS'), igual ao PDO do PHP
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1083, (v) => v);

const pool = global.__acsPool || (global.__acsPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
}));
pool.on('error', (e) => console.error('[ACS Conecta] pool:', e.message));

/** SELECT/INSERT/UPDATE simples. Retorna as linhas (com RETURNING também). */
async function q(sql, params = [], client = pool) {
  const r = await client.query(sql, params);
  return r.rows;
}

/** Transação: qualquer erro (inclusive resp()) faz ROLLBACK. */
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) { /* ignora */ }
    throw e;
  } finally {
    c.release();
  }
}

// ---------- Resposta JSON (equivale ao resp() do PHP: interrompe a execução) ----------
class Resp extends Error {
  constructor(data, code) { super('resp'); this.data = data; this.code = code; }
}
function resp(data, code = 200) { throw new Resp(data, code); }
function fail(erro, code = 422) { throw new Resp({ ok: false, erro }, code); }

/** Envolve o handler: só POST, corpo JSON, erros tratados, sem cache. */
function handler(nome, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido.' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};
    try {
      await fn(req, res, body);
    } catch (e) {
      if (e instanceof Resp) return res.status(e.code).json(e.data);
      console.error(`[ACS Conecta] ${nome}:`, e);
      return res.status(500).json({ ok: false, erro: 'Erro ao processar no servidor.' });
    }
  };
}

// ---------- Sessão em cookie assinado (substitui $_SESSION) ----------
const SESSAO_SEGUNDOS = 8 * 60 * 60;

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto (mínimo 32 caracteres).');
  return s;
}
function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}
function conferir(token) {
  if (!token || typeof token !== 'string') return null;
  const [corpo, sig] = token.split('.');
  if (!corpo || !sig) return null;
  const esperado = crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch (_) { return null; }
}
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return out;
}
function addCookie(res, valor) {
  const atual = res.getHeader('Set-Cookie');
  const lista = Array.isArray(atual) ? atual : atual ? [atual] : [];
  res.setHeader('Set-Cookie', [...lista, valor]);
}
function atributos(req, maxAge) {
  const https = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

/** Usuário logado {id, login, perfil} ou null. */
function getSessao(req) {
  const p = conferir(cookies(req).acs_sess);
  return p && p.usuario ? p.usuario : null;
}
function setSessao(req, res, usuario) {
  const token = assinar({ usuario, exp: Math.floor(Date.now() / 1000) + SESSAO_SEGUNDOS });
  addCookie(res, `acs_sess=${token}; ${atributos(req, SESSAO_SEGUNDOS)}`);
}
function limparSessao(req, res) {
  addCookie(res, `acs_sess=; ${atributos(req, 0)}`);
  addCookie(res, `acs_pend=; ${atributos(req, 0)}`);
}
/** Token do 2FA pendente (a tentativa fica no banco, não no cookie). */
function getPendente(req) { return cookies(req).acs_pend || null; }
function setPendente(req, res, token) { addCookie(res, `acs_pend=${token}; ${atributos(req, 600)}`); }
function limparPendente(req, res) { addCookie(res, `acs_pend=; ${atributos(req, 0)}`); }

/** Exige sessão ativa e um dos perfis informados. */
function exigir(req, perfis) {
  const s = getSessao(req);
  if (!s) fail('Sessão expirada. Faça login novamente.', 401);
  if (!perfis.includes(s.perfil)) fail('Sem permissão para esta ação.', 403);
  return s;
}

// ---------- Texto / datas ----------
function norm(v) {          // minúsculo e sem acento (como o norm() do PHP)
  return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function alnum(v) { return norm(v).replace(/[^a-z0-9]/g, ''); }
function len(s) { return [...String(s)].length; }         // equivale ao mb_strlen
function digitos(v) { return String(v ?? '').replace(/\D/g, ''); }

function dataReal(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** "AAAA-MM-DD" válida? */
function isoValida(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return !!m && dataReal(+m[1], +m[2], +m[3]);
}
/** "DD/MM/AAAA" ou "AAAA-MM-DD" -> "AAAA-MM-DD"; null se inválida. */
function dataParaIso(v) {
  v = String(v ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) return dataReal(+m[3], +m[2], +m[1]) ? `${m[3]}-${m[2]}-${m[1]}` : null;
  return isoValida(v) ? v : null;
}
function isoParaBr(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
function somarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** Data de hoje no fuso de São Paulo (o PHP usava America/Sao_Paulo). */
function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function iso(d) { return d ? new Date(d).toISOString() : null; }

function fmtCpf(c) {
  c = String(c ?? '');
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}` : c;
}
function fmtCep(c) {
  c = String(c ?? '');
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5, 8)}` : c;
}
const RE_TEL = /^\(\d{2}\)\s\d{5}-\d{4}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ip(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || (req.socket && req.socket.remoteAddress) || null);
}

module.exports = {
  pool, q, tx, Resp, resp, fail, handler,
  getSessao, setSessao, limparSessao, getPendente, setPendente, limparPendente, exigir,
  norm, alnum, len, digitos, isoValida, dataParaIso, isoParaBr, somarDias, hoje, iso,
  fmtCpf, fmtCep, RE_TEL, RE_EMAIL, ip,
};
