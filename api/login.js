/**
 * /api/login — Autenticação do ACS Conecta (usuário + senha + 2FA do agente)
 * Recebe JSON via POST: { "acao": "login" | "2fa" | "sessao" | "logout", ... }
 * Porta do login.php.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const L = require('../lib/acs');

const PERGUNTAS = {
  nome_mae:        { label: 'Nome da mãe',        texto: 'Qual o nome da sua mãe?' },
  data_nascimento: { label: 'Data de nascimento', texto: 'Qual a data do seu nascimento?' },
  cep:             { label: 'CEP',                texto: 'Qual o CEP do seu endereço?' },
};
// hash fictício: gasta o mesmo tempo quando o usuário não existe
const HASH_FALSO = bcrypt.hashSync('nao-existe', 10);

const SQL_AGENTE =
  `SELECT a.nome, a.nome_mae, a.cpf, a.data_nascimento, a.sexo, a.telefone, a.cep, a.endereco, a.numero,
          a.email, a.unidade, a.equipe, a.area, u.login
     FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.usuario_id = $1 AND u.ativo = 1`;

/** Perfil do agente no formato que o painel-acs.html usa. */
function formatoPainel(a) {
  return {
    name: a.nome, motherName: a.nome_mae, cpf: a.cpf,
    birthdate: L.isoParaBr(a.data_nascimento), gender: a.sexo, phone: a.telefone,
    cep: a.cep, address: a.endereco, numero: a.numero, email: a.email,
    login: a.login, unit: a.unidade, team: a.equipe, area: a.area,
  };
}

module.exports = L.handler('login', async (req, res, body) => {
  const acao = body.acao || '';

  // ---------- 1) Usuário + senha ----------
  if (acao === 'login') {
    const area = body.area || 'agente';   // 'agente' (card principal) ou 'gerencia' (modal)
    const [u] = await L.q('SELECT id, login, senha_hash, perfil FROM usuarios WHERE login = $1 AND ativo = 1',
      [String(body.login ?? '').trim()]);

    const okSenha = await bcrypt.compare(String(body.senha ?? ''), u ? u.senha_hash : HASH_FALSO) && !!u;
    const okArea = !!u && (area === 'gerencia' ? ['admin', 'gerente'].includes(u.perfil) : u.perfil === 'agente');
    if (!okSenha || !okArea) L.fail('Usuário ou senha incorretos.', 401);

    if (u.perfil !== 'agente') {          // admin / gerente entram direto
      L.setSessao(req, res, { id: u.id, login: u.login, perfil: u.perfil });
      L.resp({ ok: true, destino: 'gerencia.html' });
    }

    // agente: sorteia a pergunta; tentativas ficam no banco
    const chaves = Object.keys(PERGUNTAS);
    const campo = chaves[crypto.randomInt(chaves.length)];
    const token = crypto.randomUUID();
    await L.q(`DELETE FROM login_pendentes WHERE criado_em < now() - interval '15 minutes' OR usuario_id = $1`, [u.id]);
    await L.q('INSERT INTO login_pendentes (token, usuario_id, campo) VALUES ($1, $2, $3)', [token, u.id, campo]);
    L.setPendente(req, res, token);
    L.resp({ ok: true, etapa: '2fa', pergunta: PERGUNTAS[campo].texto });
  }

  // ---------- 2) Resposta do 2FA ----------
  if (acao === '2fa') {
    const token = L.getPendente(req);
    const uuid = /^[0-9a-f-]{36}$/i.test(token || '') ? token : null;
    const [p] = uuid ? await L.q(
      `SELECT token, usuario_id, campo, tentativas FROM login_pendentes
        WHERE token = $1 AND criado_em > now() - interval '10 minutes'`, [uuid]) : [];
    if (!p) { L.limparPendente(req, res); L.resp({ ok: false, erro: 'Faça o login novamente.', bloqueado: true }, 401); }

    const [a] = await L.q(SQL_AGENTE, [p.usuario_id]);
    if (!a) {
      await L.q('DELETE FROM login_pendentes WHERE token = $1', [p.token]);
      L.limparPendente(req, res);
      L.resp({ ok: false, erro: 'Agente não encontrado.', bloqueado: true }, 401);
    }

    const resposta = String(body.resposta ?? '');
    let acertou;
    if (p.campo === 'nome_mae') {
      acertou = L.norm(resposta) === L.norm(a.nome_mae);
    } else if (p.campo === 'cep') {
      acertou = L.alnum(resposta) === L.alnum(a.cep);
    } else {                               // data: aceita 15/03/1990 ou 1990-03-15
      const [y, m, d] = a.data_nascimento.split('-');
      acertou = [`${d}${m}${y}`, `${y}${m}${d}`].includes(L.alnum(resposta));
    }

    if (acertou) {
      await L.q(`INSERT INTO logs_autenticacao (usuario_id, nome, cpf, login, fator_2fa, ip)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.usuario_id, a.nome, a.cpf, a.login, PERGUNTAS[p.campo].label, L.ip(req)]);
      await L.q('DELETE FROM login_pendentes WHERE token = $1', [p.token]);
      L.limparPendente(req, res);
      L.setSessao(req, res, { id: p.usuario_id, login: a.login, perfil: 'agente' });
      L.resp({ ok: true, destino: 'painel-acs.html', agente: { ...formatoPainel(a), cpf: a.cpf } });
    }

    const [{ tentativas }] = await L.q(
      'UPDATE login_pendentes SET tentativas = tentativas + 1 WHERE token = $1 RETURNING tentativas', [p.token]);
    if (tentativas >= 3) {
      await L.q('DELETE FROM login_pendentes WHERE token = $1', [p.token]);
      L.limparPendente(req, res);
      L.resp({ ok: false, bloqueado: true, erro: '3 tentativas sem sucesso! Favor realizar Login novamente.' }, 401);
    }
    L.resp({ ok: false, tentativas, erro: `Resposta incorreta. Restam ${3 - tentativas} tentativa(s).` }, 401);
  }

  // ---------- 3) Quem está logado (gerencia.html / painel-acs.html) ----------
  if (acao === 'sessao') {
    const u = L.getSessao(req);
    if (!u) L.resp({ ok: false }, 401);
    if (u.perfil === 'agente') {
      const [a] = await L.q(SQL_AGENTE, [u.id]);
      if (!a) { L.limparSessao(req, res); L.resp({ ok: false }, 401); }   // agente desativado/excluído
      L.resp({ ok: true, usuario: u, agente: formatoPainel(a) });
    }
    L.resp({ ok: true, usuario: u });
  }

  // ---------- 4) Sair ----------
  if (acao === 'logout') {
    L.limparSessao(req, res);
    L.resp({ ok: true });
  }

  L.resp({ ok: false, erro: 'Ação inválida.' }, 400);
});
