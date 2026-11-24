/**
 * /api/reset-senha — Pedidos de reset de senha dos agentes (ACS Conecta)
 * { "acao": "solicitar" | "listar" | "resolver", ... }
 *
 *  solicitar -> PÚBLICA (tela de login): o ACS informa o próprio login.
 *  listar    -> admin/gerente: pedidos pendentes.
 *  resolver  -> admin/gerente: marca como "resolvida" ou "dispensada".
 *
 * Este endpoint NÃO troca senha: quem troca é o gerente, pela ação 'senha' de /api/agentes.
 */
const L = require('../lib/acs');

// Cria a tabela sozinha na primeira chamada (o SQL equivalente está em reset-senha.sql)
let tabelaPronta;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      await L.q(`CREATE TABLE IF NOT EXISTS solicitacoes_reset_senha (
        id            BIGSERIAL PRIMARY KEY,
        usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        status        TEXT NOT NULL DEFAULT 'pendente',
        criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolvido_em  TIMESTAMPTZ,
        resolvido_por TEXT,
        ip            TEXT
      )`);
      await L.q(`CREATE UNIQUE INDEX IF NOT EXISTS ux_reset_senha_pendente
                 ON solicitacoes_reset_senha (usuario_id) WHERE status = 'pendente'`);
    })().catch((e) => { tabelaPronta = null; throw e; });
  }
  return tabelaPronta;
}

module.exports = L.handler('reset-senha', async (req, res, body) => {
  const acao = body.acao || '';
  await garantirTabela();

  // ---------- Pública: o ACS pede o reset ----------
  if (acao === 'solicitar') {
    const login = String(body.login ?? '').trim();
    if (login === '' || L.len(login) > 50) L.fail('Digite o seu usuário para continuar.');

    // trava contra spam: no máximo 5 pedidos por IP por hora
    const ip = L.ip(req);
    const [{ n }] = await L.q(
      `SELECT COUNT(*)::int AS n FROM solicitacoes_reset_senha
        WHERE ip = $1 AND criado_em > now() - interval '1 hour'`, [ip]);
    if (n >= 5) L.fail('Muitos pedidos seguidos. Procure o seu gerente.', 429);

    const [u] = await L.q(
      `SELECT id FROM usuarios WHERE login = $1 AND perfil = 'agente' AND ativo = 1`, [login]);
    if (u) {
      await L.q(
        `INSERT INTO solicitacoes_reset_senha (usuario_id, ip) VALUES ($1, $2)
         ON CONFLICT (usuario_id) WHERE status = 'pendente' DO NOTHING`, [u.id, ip]);
    }
    // resposta idêntica exista o login ou não (não revela quais logins são válidos)
    L.resp({ ok: true });
  }

  // ---------- Admin/gerente: pedidos pendentes ----------
  if (acao === 'listar') {
    L.exigir(req, ['admin', 'gerente']);
    const rows = await L.q(
      `SELECT s.id, s.usuario_id, s.criado_em, u.login, a.nome, a.unidade
         FROM solicitacoes_reset_senha s
         JOIN usuarios u ON u.id = s.usuario_id
         JOIN agentes  a ON a.usuario_id = u.id
        WHERE s.status = 'pendente' AND u.ativo = 1
        ORDER BY s.criado_em`);
    L.resp({
      ok: true,
      solicitacoes: rows.map((r) => ({
        id: Number(r.id), usuarioId: Number(r.usuario_id), login: r.login,
        nome: r.nome, unidade: r.unidade, criado_em: L.iso(r.criado_em),
      })),
    });
  }

  // ---------- Admin/gerente: fechar o pedido ----------
  if (acao === 'resolver') {
    const s = L.exigir(req, ['admin', 'gerente']);
    const id = parseInt(body.id, 10) || 0;
    const status = body.status === 'dispensada' ? 'dispensada' : 'resolvida';
    const r = await L.pool.query(
      `UPDATE solicitacoes_reset_senha SET status = $1, resolvido_em = now(), resolvido_por = $2
        WHERE id = $3 AND status = 'pendente'`, [status, s.login, id]);
    if (r.rowCount === 0) L.fail('Pedido não encontrado.', 404);
    L.resp({ ok: true });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
