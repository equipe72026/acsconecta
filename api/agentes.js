/**
 * /api/agentes — Cadastro de agentes comunitários de saúde (ACS Conecta)
 * { "acao": "listar" | "salvar" | "excluir" | "senha" | "logs" | "minha_conta" | "minha_senha", ... }
 * Cada agente = 1 linha em `usuarios` + 1 linha em `agentes`. Porta do agentes.php.
 */
const bcrypt = require('bcryptjs');
const L = require('../lib/acs');

function validarDados(inp) {
  const d = {
    nome: String(inp.name ?? '').trim(),
    nome_mae: String(inp.motherName ?? '').trim(),
    cpf: L.digitos(inp.cpf),
    nasc: String(inp.birthdate ?? '').trim(),
    sexo: String(inp.gender ?? '').trim(),
    tel: String(inp.phone ?? '').trim(),
    cep: L.digitos(inp.cep),
    endereco: String(inp.address ?? '').trim(),
    numero: String(inp.numero ?? '').trim(),
    email: String(inp.email ?? '').trim(),
    login: String(inp.login ?? '').trim(),
    unidade: String(inp.unit ?? '').trim(),
    equipe: String(inp.team ?? '').trim(),
    area: String(inp.area ?? '').trim(),
  };
  if (d.nome === '') L.fail('Informe o nome.');
  if (d.nome_mae === '' || L.len(d.nome_mae) > 60) L.fail('Informe o primeiro nome da mãe.');
  if (d.cpf.length !== 11) L.fail('CPF inválido.');
  if (!['M', 'F', 'O'].includes(d.sexo)) L.fail('Selecione o sexo.');
  if (!L.RE_TEL.test(d.tel)) L.fail('Telefone inválido.');
  const iso = L.dataParaIso(d.nasc);
  if (iso === null || iso > L.hoje() || iso < '1900-01-01') L.fail('Data de nascimento inválida. Use o formato DD/MM/AAAA.');
  d.nasc = iso;
  if (d.cep.length !== 8) L.fail('CEP inválido.');
  if (d.endereco === '' || d.numero === '') L.fail('Informe o endereço e o número.');
  if (!L.RE_EMAIL.test(d.email)) L.fail('Informe um e-mail válido.');
  if (d.login === '' || L.len(d.login) > 50) L.fail('Informe o nome de usuário (até 50 caracteres).');
  if (d.login.toLowerCase() === 'admin') L.fail('Este nome de usuário é reservado para o admin.');
  if (d.unidade === '') d.unidade = 'CMS Adão Pereira Nunes';
  if (d.equipe === '' || L.len(d.equipe) > 60) L.fail('Selecione a equipe.');
  if (!/^\d{2}$/.test(d.area)) L.fail('Selecione a área.');
  return d;
}

/** Nomes das colunas = os que o gerencia.html já usa (aliases camelCase entre aspas). */
const SELECT_AGENTE =
  `SELECT u.id, u.login, a.nome AS name, a.nome_mae AS "motherName", a.cpf,
          a.data_nascimento AS birthdate, a.sexo AS gender, a.telefone AS phone, a.cep,
          a.endereco AS address, a.numero, a.email, a.unidade AS unit, a.equipe AS team, a.area,
          r.familias, r.visitas, r.consultas
     FROM usuarios u
     JOIN agentes a ON a.usuario_id = u.id
     JOIN vw_agentes_resumo r ON r.usuario_id = u.id`;

function formatarSaida(a) {
  return {
    ...a,
    id: Number(a.id),
    cpf: L.fmtCpf(a.cpf),
    cep: L.fmtCep(a.cep),
    birthdate: L.isoParaBr(a.birthdate),
    familias: Number(a.familias), visitas: Number(a.visitas), consultas: Number(a.consultas),
  };
}

/** Insere ou atualiza o agente (usuarios + agentes). Retorna o id do usuário. */
async function gravarAgente(id, d, senha) {
  // login único entre TODOS os usuários (admin, gerentes e agentes)
  const [dupLogin] = await L.q('SELECT id FROM usuarios WHERE login = $1 AND id <> $2', [d.login, id ?? 0]);
  if (dupLogin) L.fail('Este nome de usuário (login) já está em uso.', 409);

  // CPF único entre os agentes
  const [dupCpf] = await L.q(
    `SELECT u.ativo FROM agentes a JOIN usuarios u ON u.id = a.usuario_id WHERE a.cpf = $1 AND a.usuario_id <> $2`,
    [d.cpf, id ?? 0]);
  if (dupCpf) L.fail(dupCpf.ativo ? 'Já existe um agente com este CPF.' : 'Este CPF pertence a um agente desativado.', 409);

  const hash = senha !== '' ? await bcrypt.hash(senha, 10) : null;
  const vals = [d.nome, d.nome_mae, d.cpf, d.nasc, d.sexo, d.tel, d.cep, d.endereco, d.numero, d.email, d.unidade, d.equipe, d.area];

  return L.tx(async (c) => {
    if (id === null) {
      const [u] = await L.q(
        `INSERT INTO usuarios (login, senha_hash, perfil, ativo) VALUES ($1, $2, 'agente', 1) RETURNING id`,
        [d.login, hash], c);
      await L.q(
        `INSERT INTO agentes (usuario_id, nome, nome_mae, cpf, data_nascimento, sexo, telefone, cep,
                              endereco, numero, email, unidade, equipe, area)
         VALUES ($14, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [...vals, u.id], c);
      return u.id;
    }
    await L.q('UPDATE usuarios SET login = $1 WHERE id = $2', [d.login, id], c);
    if (hash) await L.q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, id], c);
    await L.q(
      `UPDATE agentes SET nome = $1, nome_mae = $2, cpf = $3, data_nascimento = $4, sexo = $5, telefone = $6,
              cep = $7, endereco = $8, numero = $9, email = $10, unidade = $11, equipe = $12, area = $13
        WHERE usuario_id = $14`, [...vals, id], c);
    return id;
  });
}

async function agenteExiste(id) {
  const [r] = await L.q(`SELECT 1 AS x FROM usuarios WHERE id = $1 AND perfil = 'agente' AND ativo = 1`, [id]);
  return !!r;
}

module.exports = L.handler('agentes', async (req, res, body) => {
  const acao = body.acao || '';

  // ---------- Listar agentes (com totais de famílias/visitas/consultas) ----------
  if (acao === 'listar') {
    L.exigir(req, ['admin', 'gerente']);
    const rows = await L.q(`${SELECT_AGENTE} WHERE u.perfil = 'agente' AND u.ativo = 1 ORDER BY a.nome, u.login`);
    L.resp({ ok: true, agentes: rows.map(formatarSaida) });
  }

  // ---------- Cadastrar / editar agente ----------
  if (acao === 'salvar') {
    L.exigir(req, ['admin', 'gerente']);
    const id = body.id !== undefined && body.id !== null && body.id !== '' ? parseInt(body.id, 10) || 0 : null;
    const d = validarDados(body);
    const senha = String(body.senha ?? '');

    if (id === null && senha.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    if (senha !== '' && senha.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    if (id !== null && !(await agenteExiste(id))) L.fail('Agente não encontrado.', 404);

    try {
      L.resp({ ok: true, id: await gravarAgente(id, d, senha) });
    } catch (e) {
      if (e && e.code === '23505') L.fail('Já existe um cadastro com este login ou CPF.', 409);
      throw e;
    }
  }

  // ---------- Excluir agente ----------
  // Sem vínculos: exclui. Com famílias/visitas/consultas: DESATIVA (histórico preservado).
  if (acao === 'excluir') {
    L.exigir(req, ['admin', 'gerente']);
    const id = parseInt(body.id, 10) || 0;
    if (!(await agenteExiste(id))) L.fail('Agente não encontrado.', 404);

    const [{ n }] = await L.q(
      `SELECT (SELECT COUNT(*) FROM familias WHERE agente_id = $1) +
              (SELECT COUNT(*) FROM visitas WHERE agente_id = $1) +
              (SELECT COUNT(*) FROM consultas WHERE agente_id = $1) AS n`, [id]);
    if (Number(n) > 0) {
      await L.q(`UPDATE usuarios SET ativo = 0 WHERE id = $1 AND perfil = 'agente'`, [id]);
      L.resp({ ok: true, desativado: true });
    }
    await L.q(`DELETE FROM usuarios WHERE id = $1 AND perfil = 'agente'`, [id]);
    L.resp({ ok: true, desativado: false });
  }

  // ---------- Trocar apenas a senha de um agente ----------
  if (acao === 'senha') {
    L.exigir(req, ['admin', 'gerente']);
    const id = parseInt(body.id, 10) || 0;
    const nova = String(body.senha ?? '');
    if (nova.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    if (!(await agenteExiste(id))) L.fail('Agente não encontrado.', 404);
    await L.q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(nova, 10), id]);
    L.resp({ ok: true });
  }

  // ---------- Logs de autenticação (2FA) ----------
  if (acao === 'logs') {
    L.exigir(req, ['admin', 'gerente']);
    const rows = await L.q(
      `SELECT data_hora, nome, cpf, fator_2fa FROM logs_autenticacao ORDER BY data_hora DESC, id DESC LIMIT 2000`);
    L.resp({
      ok: true,
      logs: rows.map((r) => ({ dataHora: L.iso(r.data_hora), nome: r.nome, cpf: L.fmtCpf(r.cpf), fator2FA: r.fator_2fa })),
    });
  }

  // ---------- Agente logado: atualizar o próprio telefone/e-mail ----------
  if (acao === 'minha_conta') {
    const s = L.exigir(req, ['agente']);
    const tel = String(body.phone ?? '').trim();
    const mail = String(body.email ?? '').trim();
    if (!L.RE_TEL.test(tel)) L.fail('Formato inválido: (XX) XXXXX-XXXX');
    if (!L.RE_EMAIL.test(mail)) L.fail('Informe um e-mail válido.');
    await L.q('UPDATE agentes SET telefone = $1, email = $2 WHERE usuario_id = $3', [tel, mail, s.id]);
    L.resp({ ok: true });
  }

  // ---------- Agente logado: trocar a própria senha (exige a senha atual) ----------
  if (acao === 'minha_senha') {
    const s = L.exigir(req, ['agente']);
    const atual = String(body.atual ?? '');
    const nova = String(body.nova ?? '');
    const [u] = await L.q('SELECT senha_hash FROM usuarios WHERE id = $1', [s.id]);
    if (!u || !(await bcrypt.compare(atual, u.senha_hash))) L.fail('Senha atual incorreta.');
    if (nova.length < 6) L.fail('A nova senha deve ter no mínimo 6 caracteres.');
    await L.q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(nova, 10), s.id]);
    L.resp({ ok: true });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
