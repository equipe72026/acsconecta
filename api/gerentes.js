/**
 * /api/gerentes — Cadastro de gerentes (ACS Conecta)
 * { "acao": "listar" | "salvar" | "excluir" | "meus_dados" | "salvar_meus_dados" | "senha_admin", ... }
 * Porta do gerentes.php.
 */
const bcrypt = require('bcryptjs');
const L = require('../lib/acs');

function validarDados(inp) {
  const d = {
    nome: String(inp.nome ?? '').trim(),
    cpf: L.digitos(inp.cpf),
    birthdate: String(inp.birthdate ?? '').trim(),
    gender: String(inp.gender ?? '').trim(),
    phone: String(inp.phone ?? '').trim(),
    cep: L.digitos(inp.cep),
    address: String(inp.address ?? '').trim(),
    numero: String(inp.numero ?? '').trim(),
    email: String(inp.email ?? '').trim(),
    login: String(inp.login ?? '').trim(),
  };
  if (d.nome === '') L.fail('Informe o nome.');
  if (d.cpf.length !== 11) L.fail('CPF inválido.');
  if (!['M', 'F', 'O'].includes(d.gender)) L.fail('Selecione o sexo.');
  if (!L.RE_TEL.test(d.phone)) L.fail('Telefone inválido.');
  const iso = L.dataParaIso(d.birthdate);
  if (iso === null || iso > L.hoje() || iso < '1900-01-01') L.fail('Data de nascimento inválida. Use o formato DD/MM/AAAA.');
  d.birthdate = iso;
  if (d.cep.length !== 8) L.fail('CEP inválido.');
  if (d.address === '' || d.numero === '') L.fail('Informe o endereço e o número.');
  if (d.email === '' || !L.RE_EMAIL.test(d.email)) L.fail('Informe um e-mail válido.');
  if (d.login === '') L.fail('Informe o nome de usuário.');
  if (d.login.toLowerCase() === 'admin') L.fail('Este nome de usuário é reservado para o admin.');
  return d;
}

function formatarSaida(g) {
  return { ...g, cpf: L.fmtCpf(g.cpf), birthdate: g.birthdate ? L.isoParaBr(g.birthdate) : g.birthdate, cep: L.fmtCep(g.cep) };
}

const SELECT_GERENTE =
  `SELECT u.id, u.login, g.nome, g.cpf, g.data_nascimento AS birthdate, g.sexo AS gender,
          g.telefone AS phone, g.cep, g.endereco AS address, g.numero, g.email
     FROM usuarios u LEFT JOIN gerentes g ON g.usuario_id = u.id`;

/** Insere ou atualiza o gerente (usuarios + gerentes). Retorna o id do usuário. */
async function gravarGerente(usuarioId, d, senha) {
  const [dupLogin] = await L.q('SELECT id FROM usuarios WHERE login = $1 AND id <> $2', [d.login, usuarioId ?? 0]);
  if (dupLogin) L.fail('Este nome de usuário já está em uso.', 409);
  const [dupCpf] = await L.q('SELECT usuario_id FROM gerentes WHERE cpf = $1 AND usuario_id <> $2', [d.cpf, usuarioId ?? 0]);
  if (dupCpf) L.fail('Já existe um gerente com este CPF.', 409);

  const hash = senha !== '' ? await bcrypt.hash(senha, 10) : null;
  const vals = [d.nome, d.cpf, d.birthdate, d.gender, d.phone, d.cep, d.address, d.numero, d.email];

  return L.tx(async (c) => {
    if (usuarioId === null) {
      const [u] = await L.q(
        `INSERT INTO usuarios (login, senha_hash, perfil, ativo) VALUES ($1, $2, 'gerente', 1) RETURNING id`,
        [d.login, hash], c);
      await L.q(
        `INSERT INTO gerentes (usuario_id, nome, cpf, data_nascimento, sexo, telefone, cep, endereco, numero, email)
         VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9)`, [...vals, u.id], c);
      return u.id;
    }
    await L.q('UPDATE usuarios SET login = $1 WHERE id = $2', [d.login, usuarioId], c);
    if (hash) await L.q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, usuarioId], c);
    await L.q(
      `UPDATE gerentes SET nome = $1, cpf = $2, data_nascimento = $3, sexo = $4, telefone = $5,
              cep = $6, endereco = $7, numero = $8, email = $9
        WHERE usuario_id = $10`, [...vals, usuarioId], c);
    return usuarioId;
  });
}

module.exports = L.handler('gerentes', async (req, res, body) => {
  const acao = body.acao || '';

  // ---------- Admin: listar gerentes ----------
  if (acao === 'listar') {
    L.exigir(req, ['admin']);
    const rows = await L.q(`${SELECT_GERENTE} WHERE u.perfil = 'gerente' AND u.ativo = 1 ORDER BY g.nome, u.login`);
    L.resp({ ok: true, gerentes: rows.map(formatarSaida) });
  }

  // ---------- Admin: cadastrar / editar gerente ----------
  if (acao === 'salvar') {
    L.exigir(req, ['admin']);
    const id = body.id !== undefined && body.id !== null && body.id !== '' ? parseInt(body.id, 10) || 0 : null;
    const d = validarDados(body);
    const senha = String(body.senha ?? '');

    if (id === null && senha.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    if (senha !== '' && senha.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    if (id !== null) {
      const [ex] = await L.q(`SELECT id FROM usuarios WHERE id = $1 AND perfil = 'gerente'`, [id]);
      if (!ex) L.fail('Gerente não encontrado.', 404);
    }
    try {
      L.resp({ ok: true, id: await gravarGerente(id, d, senha) });
    } catch (e) {
      if (e && e.code === '23505') L.fail('Já existe um cadastro com este login ou CPF.', 409);
      throw e;
    }
  }

  // ---------- Admin: excluir gerente ----------
  if (acao === 'excluir') {
    L.exigir(req, ['admin']);
    const id = parseInt(body.id, 10) || 0;
    await L.tx(async (c) => {
      await L.q('DELETE FROM gerentes WHERE usuario_id = $1', [id], c);
      await L.q(`DELETE FROM usuarios WHERE id = $1 AND perfil = 'gerente'`, [id], c);
    });
    L.resp({ ok: true });
  }

  // ---------- Gerente: ler os próprios dados ----------
  if (acao === 'meus_dados') {
    const s = L.exigir(req, ['gerente']);
    const [g] = await L.q(`${SELECT_GERENTE} WHERE u.id = $1 AND u.perfil = 'gerente'`, [s.id]);
    if (!g) L.fail('Cadastro não encontrado.', 404);
    L.resp({ ok: true, gerente: formatarSaida(g) });
  }

  // ---------- Gerente: atualizar os próprios dados ----------
  if (acao === 'salvar_meus_dados') {
    const s = L.exigir(req, ['gerente']);
    const d = validarDados(body);
    const senha = String(body.senha ?? '');
    if (senha !== '' && senha.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    try {
      await gravarGerente(s.id, d, senha);
    } catch (e) {
      if (e && e.code === '23505') L.fail('Já existe um cadastro com este login ou CPF.', 409);
      throw e;
    }
    L.setSessao(req, res, { id: s.id, login: d.login, perfil: 'gerente' });   // mantém a sessão válida se o login mudou
    L.resp({ ok: true, login: d.login });
  }

  // ---------- Admin: trocar a própria senha ----------
  if (acao === 'senha_admin') {
    const s = L.exigir(req, ['admin']);
    const nova = String(body.senha ?? '');
    if (nova.length < 6) L.fail('A senha deve ter no mínimo 6 caracteres.');
    await L.q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [await bcrypt.hash(nova, 10), s.id]);
    L.resp({ ok: true });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
