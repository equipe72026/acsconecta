/**
 * /api/consultas — Agenda de consultas (ACS Conecta)
 * { "acao": "listar" | "salvar" | "cancelar" | "avisado" | "presenca" | "desfazer_presenca" | "todas", ... }
 * arquivado_em IS NULL = consulta atual (no máximo UMA por paciente); NOT NULL = histórico.
 * O paciente é identificado por prontuario + membroIdx (responsável primeiro). Porta do consultas.php.
 */
const L = require('../lib/acs');

async function exigirAgente(req) {
  const s = L.getSessao(req);
  if (!s) L.fail('Sessão expirada. Faça login novamente.', 401);
  if (s.perfil !== 'agente') L.fail('Apenas agentes podem gerenciar consultas.', 403);
  const [a] = await L.q(`SELECT id, login FROM usuarios WHERE id = $1 AND perfil = 'agente' AND ativo = 1`, [s.id]);
  if (!a) L.fail('Sessão expirada. Faça login novamente.', 401);
  return a;
}

/** Consultas no formato do painel, separadas em agenda (atuais) e histórico. agenteId = null: todos. */
async function listarConsultas(agenteId) {
  const sql =
    `SELECT c.id, c.status, c.data_consulta, c.hora, c.tipo, c."local", c.obs, c.presenca, c.presenca_em,
            c.avisado, c.criado_em, c.arquivado_em, u.login, f.prontuario, m.nome AS paciente,
            (SELECT COUNT(*) FROM membros x
              WHERE x.familia_id = m.familia_id
                AND (x.eh_responsavel > m.eh_responsavel
                     OR (x.eh_responsavel = m.eh_responsavel AND x.id < m.id)))::int AS idx
       FROM consultas c
       JOIN membros  m ON m.id = c.membro_id
       JOIN familias f ON f.id = m.familia_id
       JOIN usuarios u ON u.id = c.agente_id`;
  const rows = agenteId !== null
    ? await L.q(`${sql} WHERE c.agente_id = $1 ORDER BY c.id`, [agenteId])
    : await L.q(`${sql} ORDER BY c.id`);

  const agenda = [];
  const historico = [];
  for (const c of rows) {
    const r = {
      id: Number(c.id), agenteLogin: c.login, prontuario: c.prontuario, membroIdx: Number(c.idx),
      paciente: c.paciente, status: c.status, data: c.data_consulta ?? '',
      hora: c.hora ? String(c.hora).slice(0, 5) : '', tipo: c.tipo, local: c.local ?? '', obs: c.obs ?? '',
      criadoEm: L.iso(c.criado_em), avisado: !!c.avisado,
    };
    if (c.presenca !== null) {
      r.presenca = c.presenca;
      r.presencaEm = c.presenca_em ? L.iso(c.presenca_em) : null;
    }
    if (c.arquivado_em !== null) {
      r.arquivadoEm = L.iso(c.arquivado_em);
      historico.push(r);
    } else {
      agenda.push(r);
    }
  }
  return { consultas: agenda, historico };
}

/** Localiza o paciente (membro) numa família do agente: prontuário + posição. */
async function resolverMembro(ag, prontuario, idx) {
  const [fam] = await L.q('SELECT id FROM familias WHERE prontuario = $1 AND agente_id = $2', [prontuario, ag.id]);
  if (!fam) L.fail('Família não encontrada.', 404);
  const membros = await L.q('SELECT id, nome FROM membros WHERE familia_id = $1 ORDER BY eh_responsavel DESC, id', [fam.id]);
  if (!Number.isInteger(idx) || idx < 0 || !membros[idx]) L.fail('Paciente não encontrado.', 404);
  return membros[idx];
}

async function consultaAtual(membroId, c = L.pool, travar = false) {
  const [r] = await L.q(
    `SELECT * FROM consultas WHERE membro_id = $1 AND arquivado_em IS NULL${travar ? ' FOR UPDATE' : ''}`, [membroId], c);
  return r || null;
}

function dataConsultaValida(v) {
  if (!L.isoValida(v)) return false;
  const h = L.hoje();
  const limite = `${Number(h.slice(0, 4)) + 5}${h.slice(4)}`;
  return v >= '2000-01-01' && v <= limite;
}

const paciente = async (ag, body) =>
  resolverMembro(ag, String(body.prontuario ?? '').trim(), parseInt(body.membroIdx ?? -1, 10));

module.exports = L.handler('consultas', async (req, res, body) => {
  const acao = body.acao || '';

  // ---------- Admin/gerente: todas as consultas (relatórios) ----------
  if (acao === 'todas') {
    L.exigir(req, ['admin', 'gerente']);
    L.resp({ ok: true, ...(await listarConsultas(null)) });
  }

  const ag = await exigirAgente(req);

  if (acao === 'listar') L.resp({ ok: true, ...(await listarConsultas(ag.id)) });

  // ---------- Agendar / reagendar / marcar como "a agendar" ----------
  if (acao === 'salvar') {
    const membro = await paciente(ag, body);
    const status = String(body.status ?? '').trim();
    let data = String(body.data ?? '').trim();
    let hora = String(body.hora ?? '').trim();
    const tipo = String(body.tipo ?? '').trim();
    const local = String(body.local ?? '').trim();
    const obs = String(body.obs ?? '').trim();

    if (!['agendado', 'agendar'].includes(status)) L.fail('Status inválido.');
    if (status === 'agendado') {
      if (!dataConsultaValida(data)) L.fail('Informe uma data de consulta válida.');
      if (hora !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) L.fail('Hora inválida.');
    } else { data = ''; hora = ''; }
    if (tipo === '' || L.len(tipo) > 60) L.fail('Informe o tipo da consulta.');
    if (L.len(local) > 120) L.fail('O local está muito longo.');
    if (L.len(obs) > 5000) L.fail('As observações estão muito longas.');

    const p = [status, data === '' ? null : data, hora === '' ? null : hora, tipo, local === '' ? null : local, obs === '' ? null : obs];

    await L.tx(async (c) => {
      const atual = await consultaAtual(membro.id, c, true);
      let inserir = true;
      if (atual && atual.presenca !== null) {
        // preserva o histórico de comparecimento/falta
        await L.q('UPDATE consultas SET arquivado_em = now() WHERE id = $1', [atual.id], c);
      } else if (atual) {
        await L.q(
          `UPDATE consultas SET status = $1, data_consulta = $2, hora = $3, tipo = $4, "local" = $5, obs = $6,
                  avisado = 0, presenca = NULL, presenca_em = NULL, criado_em = now(), agente_id = $7
            WHERE id = $8`, [...p, ag.id, atual.id], c);
        inserir = false;
      }
      if (inserir) {
        await L.q(
          `INSERT INTO consultas (agente_id, membro_id, status, data_consulta, hora, tipo, "local", obs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [ag.id, membro.id, ...p], c);
      }
    });
    L.resp({ ok: true, ...(await listarConsultas(ag.id)) });
  }

  // ---------- Cancelar agendamento (o paciente volta para "Agendar") ----------
  if (acao === 'cancelar') {
    const membro = await paciente(ag, body);
    const r = await L.pool.query('DELETE FROM consultas WHERE membro_id = $1 AND arquivado_em IS NULL', [membro.id]);
    if (r.rowCount === 0) L.fail('Consulta não encontrada.', 404);
    L.resp({ ok: true, ...(await listarConsultas(ag.id)) });
  }

  // ---------- Marcar paciente como avisado (D-1) ----------
  if (acao === 'avisado') {
    const membro = await paciente(ag, body);
    await L.q('UPDATE consultas SET avisado = 1 WHERE membro_id = $1 AND arquivado_em IS NULL', [membro.id]);
    L.resp({ ok: true, ...(await listarConsultas(ag.id)) });
  }

  // ---------- Registrar presença (compareceu / faltou) ----------
  if (acao === 'presenca') {
    const valor = String(body.valor ?? '').trim();
    if (!['compareceu', 'faltou'].includes(valor)) L.fail('Valor de presença inválido.');
    const membro = await paciente(ag, body);
    const atual = await consultaAtual(membro.id);
    if (!atual || atual.data_consulta === null) L.fail('Consulta não encontrada.', 404);
    if (atual.data_consulta > L.hoje()) L.fail('A presença só pode ser registrada a partir do dia da consulta.');
    await L.q('UPDATE consultas SET presenca = $1, presenca_em = now() WHERE id = $2', [valor, atual.id]);
    L.resp({ ok: true, ...(await listarConsultas(ag.id)) });
  }

  // ---------- Desfazer o registro de presença ----------
  if (acao === 'desfazer_presenca') {
    const membro = await paciente(ag, body);
    await L.q('UPDATE consultas SET presenca = NULL, presenca_em = NULL WHERE membro_id = $1 AND arquivado_em IS NULL', [membro.id]);
    L.resp({ ok: true, ...(await listarConsultas(ag.id)) });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
