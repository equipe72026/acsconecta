/**
 * /api/familias — Fichas territoriais (famílias + membros) (ACS Conecta)
 * { "acao": "listar" | "prontuario" | "salvar" | "excluir" | "todas", ... }
 * Agente: só as PRÓPRIAS famílias; "todas" é só leitura para admin/gerente.
 * Prontuário = 'AA.NNN' (área + sequencial). Porta do familias.php.
 */
const L = require('../lib/acs');

async function exigirAgente(req) {
  const s = L.getSessao(req);
  if (!s) L.fail('Sessão expirada. Faça login novamente.', 401);
  if (s.perfil !== 'agente') L.fail('Apenas agentes podem acessar as fichas territoriais.', 403);
  const [a] = await L.q(
    `SELECT u.id, u.login, a.area FROM usuarios u JOIN agentes a ON a.usuario_id = u.id WHERE u.id = $1 AND u.ativo = 1`,
    [s.id]);
  if (!a) L.fail('Sessão expirada. Faça login novamente.', 401);
  return a;
}

/** Condições clínicas do membro: chave usada no painel -> coluna (smallint 0/1) em `membros`. */
const CONDICOES = [
  ['hipertenso', 'hipertenso'], ['diabetico', 'diabetico'], ['gestante', 'gestante'],
  ['vacinaAtrasada', 'vacina_atrasada'], ['tuberculose', 'tuberculose'], ['hanseniase', 'hanseniase'],
  ['deficienteFisico', 'deficiente_fisico'],
  ['tea', 'tea'], ['deficienciaIntelectual', 'deficiencia_intelectual'], ['tdah', 'tdah'],
  ['defVisual', 'def_visual'], ['defAuditiva', 'def_auditiva'], ['defMultipla', 'def_multipla'],
  ['cardiovascular', 'cardiovascular'], ['renalGrave', 'renal_grave'], ['respiratoria', 'respiratoria'],
  ['neoplasia', 'neoplasia'], ['avc', 'avc'], ['obesidade', 'obesidade'],
  ['saudeMental', 'saude_mental'], ['alcool', 'alcool'], ['outrasDrogas', 'outras_drogas'],
  ['puerpera', 'puerpera'], ['idosoFragilizado', 'idoso_fragilizado'],
  ['situacaoRua', 'situacao_rua'], ['programaSocial', 'programa_social'],
];

/** Área do agente com 2 dígitos ("1" -> "01"). */
function areaDoAgente(ag) {
  const n = L.digitos(ag.area);
  return n === '' ? '00' : n.slice(0, 2).padStart(2, '0');
}

function dataValida(v) {
  return L.isoValida(v) && v <= L.hoje() && v >= '1900-01-01';
}

/** Famílias com membros, no formato do painel. ag = null lista as de todos. */
async function listarFamilias(ag) {
  const sql = `SELECT f.id, f.prontuario, f.cep, f.logradouro, f.num_casa, f.complemento, f.bairro, f.cidade, f.uf, u.login
                 FROM familias f JOIN usuarios u ON u.id = f.agente_id`;
  const familias = ag !== null
    ? await L.q(`${sql} WHERE f.agente_id = $1 ORDER BY f.area, f.sequencial`, [ag.id])
    : await L.q(`${sql} ORDER BY f.area, f.sequencial`);
  if (!familias.length) return [];

  const ms = await L.q(
    'SELECT * FROM membros WHERE familia_id = ANY($1::int[]) ORDER BY familia_id, eh_responsavel DESC, id',
    [familias.map((f) => f.id)]);
  const porFamilia = {};
  for (const m of ms) {
    const membro = {
      id: Number(m.id), nome: m.nome, nascimento: m.data_nascimento, cpf: m.cpf, sus: m.cartao_sus,
      sexo: m.sexo, telefone: m.telefone ?? '',
    };
    for (const [chave, coluna] of CONDICOES) membro[chave] = !!m[coluna];
    (porFamilia[m.familia_id] = porFamilia[m.familia_id] || []).push(membro);
  }
  return familias.map((f) => {
    const membros = porFamilia[f.id] || [];
    return {
      id: Number(f.id), agenteLogin: f.login, prontuario: f.prontuario,
      responsavel: membros[0] ? membros[0].nome : '',
      cep: L.fmtCep(f.cep), logradouro: f.logradouro, numCasa: f.num_casa, complemento: f.complemento ?? '',
      bairro: f.bairro, cidade: f.cidade, uf: f.uf, membros,
    };
  });
}

/** Valida o formulário. Retorna [dadosDaFamilia, listaDeMembros]. */
function validarFicha(inp) {
  const f = {
    cep: L.digitos(inp.cep),
    logradouro: String(inp.logradouro ?? '').trim(),
    num_casa: String(inp.numCasa ?? '').trim(),
    complemento: String(inp.complemento ?? '').trim(),
    bairro: String(inp.bairro ?? '').trim(),
    cidade: String(inp.cidade ?? '').trim(),
    uf: String(inp.uf ?? '').trim().toUpperCase(),
  };
  if (f.cep.length !== 8) L.fail('CEP inválido.');
  if (f.logradouro === '' || L.len(f.logradouro) > 200) L.fail('Informe o logradouro.');
  if (f.num_casa === '' || L.len(f.num_casa) > 15) L.fail('Informe o número da casa.');
  if (L.len(f.complemento) > 100) L.fail('Complemento muito longo.');
  if (f.bairro === '' || L.len(f.bairro) > 100) L.fail('Informe o bairro.');
  if (f.cidade === '' || L.len(f.cidade) > 100) L.fail('Informe a cidade.');
  if (!/^[A-Z]{2}$/.test(f.uf)) L.fail('UF inválida.');
  if (f.complemento === '') f.complemento = null;

  const brutos = inp.membros;
  if (!Array.isArray(brutos) || brutos.length < 1) L.fail('Cadastre ao menos um membro (o responsável).');
  if (brutos.length > 30) L.fail('Número de membros acima do permitido.');

  const membros = brutos.map((m, i) => {
    m = m && typeof m === 'object' ? m : {};
    const n = i + 1;
    const tel = String(m.telefone ?? '').trim();
    const x = {
      id: parseInt(m.id, 10) || 0,             // 0 = membro novo
      nome: String(m.nome ?? '').trim(),
      nasc: String(m.nascimento ?? '').trim(),
      cpf: L.digitos(m.cpf),
      sus: L.digitos(m.sus),
      sexo: String(m.sexo ?? '').trim(),
      tel: tel === '' ? null : tel,
      cond: CONDICOES.map(([chave]) => (m[chave] ? 1 : 0)),   // mesma ordem de CONDICOES
    };
    if (x.nome === '' || L.len(x.nome) > 120) L.fail(`Membro ${n}: informe o nome.`);
    if (!dataValida(x.nasc)) L.fail(`Membro ${n}: data de nascimento inválida.`);
    if (x.cpf.length !== 11) L.fail(`Membro ${n}: CPF inválido.`);
    if (x.sus === '' || x.sus.length > 15) L.fail(`Membro ${n}: informe o cartão SUS.`);
    if (!['M', 'F', 'O'].includes(x.sexo)) L.fail(`Membro ${n}: selecione o sexo.`);
    if (x.tel !== null && !L.RE_TEL.test(x.tel)) L.fail(`Membro ${n}: telefone inválido.`);
    return x;
  });
  return [f, membros];
}

async function buscarFamilia(ag, prontuario) {
  const [r] = await L.q(
    'SELECT id, area, sequencial, prontuario FROM familias WHERE prontuario = $1 AND agente_id = $2', [prontuario, ag.id]);
  return r || null;
}

/** Campos do membro na ordem usada nos INSERT/UPDATE: 7 dados pessoais + as condições de CONDICOES. */
function camposMembro(x) {
  return [x.nome, x.nasc, x.cpf, x.sus, x.sexo, x.tel, ...x.cond];
}
const COLUNAS_COND = CONDICOES.map(([, coluna]) => coluna);
// INSERT: $1 familia_id, $2 eh_responsavel, $3..$8 dados pessoais, $9.. condições
const SQL_INS_MEMBRO =
  `INSERT INTO membros (familia_id, eh_responsavel, nome, data_nascimento, cpf, cartao_sus, sexo, telefone,
                        ${COLUNAS_COND.join(', ')})
   VALUES (${Array.from({ length: 8 + COLUNAS_COND.length }, (_, i) => `$${i + 1}`).join(', ')})`;
// UPDATE: $1 eh_responsavel, $2..$7 dados pessoais, $8.. condições, depois id e familia_id
const SQL_UPD_MEMBRO =
  `UPDATE membros SET eh_responsavel = $1, nome = $2, data_nascimento = $3, cpf = $4, cartao_sus = $5, sexo = $6,
          telefone = $7, ${COLUNAS_COND.map((col, i) => `${col} = $${i + 8}`).join(', ')}
    WHERE id = $${COLUNAS_COND.length + 8} AND familia_id = $${COLUNAS_COND.length + 9}`;

/** Cria a família com novo prontuário. Repete se dois cadastros simultâneos colidirem. */
async function criarFamilia(ag, f, membros) {
  const area = areaDoAgente(ag);
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      return await L.tx(async (c) => {
        // trava por área: evita que dois cadastros peguem o mesmo sequencial
        await L.q('SELECT pg_advisory_xact_lock(hashtext($1))', [`familias_area_${area}`], c);
        const [{ seq }] = await L.q('SELECT COALESCE(MAX(sequencial), 0) + 1 AS seq FROM familias WHERE area = $1', [area], c);
        if (Number(seq) > 999) L.fail('Limite de 999 famílias por área atingido.', 409);
        const prontuario = `${area}.${String(seq).padStart(3, '0')}`;

        const [fam] = await L.q(
          `INSERT INTO familias (agente_id, area, sequencial, prontuario, cep, logradouro, num_casa, complemento, bairro, cidade, uf)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [ag.id, area, seq, prontuario, f.cep, f.logradouro, f.num_casa, f.complemento, f.bairro, f.cidade, f.uf], c);
        for (let i = 0; i < membros.length; i++) {
          await L.q(SQL_INS_MEMBRO, [fam.id, i === 0 ? 1 : 0, ...camposMembro(membros[i])], c);
        }
        return prontuario;
      });
    } catch (e) {
      const repetir = e && (e.code === '23505' || e.code === '40P01');   // chave duplicada / deadlock
      if (!repetir || tentativa === 4) throw e;
    }
  }
  throw new Error('Não foi possível gerar o prontuário.');
}

/**
 * Atualiza a família e os membros. Membro com id existente -> atualiza (mantém o id e as consultas);
 * sem id -> insere; membro que saiu do formulário -> removido (e suas consultas, por CASCADE).
 * O 1º membro do formulário é o responsável.
 */
async function atualizarFamilia(fam, f, membros) {
  await L.tx(async (c) => {
    await L.q(
      `UPDATE familias SET cep = $1, logradouro = $2, num_casa = $3, complemento = $4,
              bairro = $5, cidade = $6, uf = $7 WHERE id = $8`,
      [f.cep, f.logradouro, f.num_casa, f.complemento, f.bairro, f.cidade, f.uf, fam.id], c);

    const existentes = (await L.q('SELECT id FROM membros WHERE familia_id = $1', [fam.id], c)).map((r) => Number(r.id));
    const mantidos = new Set();
    for (let i = 0; i < membros.length; i++) {
      const x = membros[i];
      const resp = i === 0 ? 1 : 0;
      if (x.id > 0 && existentes.includes(x.id) && !mantidos.has(x.id)) {
        await L.q(SQL_UPD_MEMBRO, [resp, ...camposMembro(x), x.id, fam.id], c);
        mantidos.add(x.id);
      } else {
        await L.q(SQL_INS_MEMBRO, [fam.id, resp, ...camposMembro(x)], c);
      }
    }
    for (const id of existentes) {
      if (!mantidos.has(id)) await L.q('DELETE FROM membros WHERE id = $1 AND familia_id = $2', [id, fam.id], c);
    }
  });
}

module.exports = L.handler('familias', async (req, res, body) => {
  const acao = body.acao || '';

  // ---------- Admin/gerente: todas as famílias (relatórios) ----------
  if (acao === 'todas') {
    L.exigir(req, ['admin', 'gerente']);
    L.resp({ ok: true, familias: await listarFamilias(null) });
  }

  const ag = await exigirAgente(req);

  if (acao === 'listar') L.resp({ ok: true, familias: await listarFamilias(ag) });

  // ---------- Prévia do próximo prontuário (o definitivo é gerado ao salvar) ----------
  if (acao === 'prontuario') {
    const area = areaDoAgente(ag);
    const [{ seq }] = await L.q('SELECT COALESCE(MAX(sequencial), 0) + 1 AS seq FROM familias WHERE area = $1', [area]);
    L.resp({ ok: true, prontuario: `${area}.${String(seq).padStart(3, '0')}` });
  }

  // ---------- Cadastrar / atualizar ficha ----------
  if (acao === 'salvar') {
    const [f, membros] = validarFicha(body);
    const prontuarioEdit = String(body.prontuario ?? '').trim();
    let prontuario, criada;
    if (prontuarioEdit !== '') {
      const fam = await buscarFamilia(ag, prontuarioEdit);
      if (!fam) L.fail('Família não encontrada.', 404);
      await atualizarFamilia(fam, f, membros);
      prontuario = fam.prontuario;
      criada = false;
    } else {
      prontuario = await criarFamilia(ag, f, membros);
      criada = true;
    }
    L.resp({ ok: true, prontuario, criada, familias: await listarFamilias(ag) });
  }

  // ---------- Excluir ficha (membros e visitas saem junto, por CASCADE) ----------
  if (acao === 'excluir') {
    const fam = await buscarFamilia(ag, String(body.prontuario ?? '').trim());
    if (!fam) L.fail('Família não encontrada.', 404);
    await L.q('DELETE FROM familias WHERE id = $1 AND agente_id = $2', [fam.id, ag.id]);
    L.resp({ ok: true, familias: await listarFamilias(ag) });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
