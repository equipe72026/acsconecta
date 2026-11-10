/**
 * /api/visitas — Visitas domiciliares (ACS Conecta)
 * { "acao": "listar" | "salvar" | "excluir" | "todas", ... }
 * Agente: só as PRÓPRIAS visitas. Admin/gerente: "todas" (somente leitura). Porta do visitas.php.
 */
const L = require('../lib/acs');

async function exigirAgente(req) {
  const s = L.getSessao(req);
  if (!s) L.fail('Sessão expirada. Faça login novamente.', 401);
  if (s.perfil !== 'agente') L.fail('Apenas agentes podem registrar visitas.', 403);
  const [a] = await L.q(`SELECT id, login FROM usuarios WHERE id = $1 AND perfil = 'agente' AND ativo = 1`, [s.id]);
  if (!a) L.fail('Sessão expirada. Faça login novamente.', 401);
  return a;
}

/** Visitas em ordem de registro. agenteId = null lista as de todos. */
async function listarVisitas(agenteId) {
  const sql = `SELECT v.id, u.login, f.prontuario, v.data_visita, v.motivo, v.desfecho, v.notas
                 FROM visitas v
                 JOIN familias f ON f.id = v.familia_id
                 JOIN usuarios u ON u.id = v.agente_id`;
  const rows = agenteId !== null
    ? await L.q(`${sql} WHERE v.agente_id = $1 ORDER BY v.id`, [agenteId])
    : await L.q(`${sql} ORDER BY v.id`);
  return rows.map((v) => ({
    id: Number(v.id), agenteLogin: v.login, prontuario: v.prontuario,
    data: v.data_visita, motivo: v.motivo, desfecho: v.desfecho, notas: v.notas ?? '',
  }));
}

/** Aceita até "amanhã" para tolerar diferença de fuso do navegador. */
function dataVisitaValida(v) {
  return L.isoValida(v) && v >= '2000-01-01' && v <= L.somarDias(L.hoje(), 1);
}

module.exports = L.handler('visitas', async (req, res, body) => {
  const acao = body.acao || '';

  if (acao === 'todas') {
    L.exigir(req, ['admin', 'gerente']);
    L.resp({ ok: true, visitas: await listarVisitas(null) });
  }

  const ag = await exigirAgente(req);

  if (acao === 'listar') L.resp({ ok: true, visitas: await listarVisitas(ag.id) });

  if (acao === 'salvar') {
    const prontuario = String(body.prontuario ?? '').trim();
    const data = String(body.data ?? '').trim();
    const motivo = String(body.motivo ?? '').trim();
    const desfecho = String(body.desfecho ?? '').trim();
    const notas = String(body.notas ?? '').trim();

    if (!dataVisitaValida(data)) L.fail('Data da visita inválida.');
    if (motivo === '' || L.len(motivo) > 80) L.fail('Informe o motivo da visita.');
    if (!['Realizada', 'Recusada', 'Ausente'].includes(desfecho)) L.fail('Desfecho inválido.');
    if (L.len(notas) > 5000) L.fail('As anotações estão muito longas.');

    // a família precisa ser do próprio agente
    const [fam] = await L.q('SELECT id FROM familias WHERE prontuario = $1 AND agente_id = $2', [prontuario, ag.id]);
    if (!fam) L.fail('Família não encontrada.', 404);

    await L.q(
      `INSERT INTO visitas (agente_id, familia_id, data_visita, motivo, desfecho, notas)
       VALUES ($1, $2, $3, $4, $5, $6)`, [ag.id, fam.id, data, motivo, desfecho, notas === '' ? null : notas]);
    L.resp({ ok: true, visitas: await listarVisitas(ag.id) });
  }

  if (acao === 'excluir') {
    const id = parseInt(body.id, 10) || 0;
    const r = await L.pool.query('DELETE FROM visitas WHERE id = $1 AND agente_id = $2', [id, ag.id]);
    if (r.rowCount === 0) L.fail('Visita não encontrada.', 404);
    L.resp({ ok: true, visitas: await listarVisitas(ag.id) });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
