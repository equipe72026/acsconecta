<?php
/**
 * login.php — Autenticação do ACS Conecta (usuário + senha + 2FA do agente)
 * Recebe JSON via POST: { "acao": "login" | "2fa" | "sessao" | "logout", ... }
 */
require_once __DIR__ . '/conexao.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');

function resp(array $d, int $code = 200): void {
    http_response_code($code);
    echo json_encode($d);
    exit;
}
function norm(string $v): string {            // minúsculo e sem acento
    $v = mb_strtolower(trim($v), 'UTF-8');
    $t = iconv('UTF-8', 'ASCII//TRANSLIT', $v);
    return $t === false ? $v : $t;
}
function alnum(string $v): string { return preg_replace('/[^a-z0-9]/', '', norm($v)); }

/** Perfil do agente no formato que o painel-acs.html usa. Retorna null se não existir/estiver inativo. */
function perfilAgente(PDO $pdo, int $id): ?array {
    $q = $pdo->prepare(
        'SELECT a.nome, a.nome_mae, a.cpf, a.data_nascimento, a.sexo, a.telefone, a.cep, a.endereco, a.numero,
                a.email, a.unidade, a.equipe, a.area, u.login
           FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
          WHERE a.usuario_id = :id AND u.ativo = 1');
    $q->execute([':id' => $id]);
    $a = $q->fetch();
    if (!$a) return null;
    $nasc = new DateTime($a['data_nascimento']);
    return [
        'name' => $a['nome'], 'motherName' => $a['nome_mae'], 'cpf' => $a['cpf'],
        'birthdate' => $nasc->format('d/m/Y'), 'gender' => $a['sexo'], 'phone' => $a['telefone'],
        'cep' => $a['cep'], 'address' => $a['endereco'], 'numero' => $a['numero'], 'email' => $a['email'],
        'login' => $a['login'], 'unit' => $a['unidade'], 'team' => $a['equipe'], 'area' => $a['area'],
    ];
}

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

$perguntas = [
    'nome_mae'        => ['label' => 'Nome da mãe',        'texto' => 'Qual o nome da sua mãe?'],
    'data_nascimento' => ['label' => 'Data de nascimento', 'texto' => 'Qual a data do seu nascimento?'],
    'cep'             => ['label' => 'CEP',                'texto' => 'Qual o CEP do seu endereço?'],
];

// ---------- 1) Usuário + senha ----------
if ($acao === 'login') {
    $area = $in['area'] ?? 'agente';          // 'agente' (card principal) ou 'gerencia' (modal)
    $stmt = $pdo->prepare('SELECT id, login, senha_hash, perfil FROM usuarios WHERE login = :l AND ativo = 1');
    $stmt->execute([':l' => trim((string)($in['login'] ?? ''))]);
    $u = $stmt->fetch();

    $okSenha = $u && password_verify((string)($in['senha'] ?? ''), $u['senha_hash']);
    $okArea  = $u && ($area === 'gerencia' ? in_array($u['perfil'], ['admin', 'gerente'], true)
                                           : $u['perfil'] === 'agente');
    if (!$okSenha || !$okArea) {
        resp(['ok' => false, 'erro' => 'Usuário ou senha incorretos.'], 401);
    }

    if ($u['perfil'] !== 'agente') {          // admin / gerente entram direto
        session_regenerate_id(true);
        $_SESSION['usuario'] = ['id' => (int)$u['id'], 'login' => $u['login'], 'perfil' => $u['perfil']];
        resp(['ok' => true, 'destino' => 'gerencia.html']);
    }

    // agente: sorteia a pergunta e guarda só no servidor
    $campo = array_rand($perguntas);
    $_SESSION['pendente'] = ['id' => (int)$u['id'], 'campo' => $campo, 'tentativas' => 0];
    resp(['ok' => true, 'etapa' => '2fa', 'pergunta' => $perguntas[$campo]['texto']]);
}

// ---------- 2) Resposta do 2FA ----------
if ($acao === '2fa') {
    $p = $_SESSION['pendente'] ?? null;
    if (!$p) resp(['ok' => false, 'erro' => 'Faça o login novamente.', 'bloqueado' => true], 401);

    $stmt = $pdo->prepare(
        'SELECT a.nome, a.cpf, a.nome_mae, a.data_nascimento, a.sexo, a.telefone, a.cep, a.endereco, a.numero,
                a.email, a.unidade, a.equipe, a.area, u.login
           FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
          WHERE a.usuario_id = :id AND u.ativo = 1');
    $stmt->execute([':id' => $p['id']]);
    $a = $stmt->fetch();
    if (!$a) { unset($_SESSION['pendente']); resp(['ok' => false, 'erro' => 'Agente não encontrado.', 'bloqueado' => true], 401); }

    $resp = (string)($in['resposta'] ?? '');
    switch ($p['campo']) {
        case 'nome_mae':
            $acertou = norm($resp) === norm($a['nome_mae']);
            break;
        case 'cep':
            $acertou = alnum($resp) === alnum($a['cep']);
            break;
        default: // data: aceita 15/03/1990 ou 1990-03-15
            $d = new DateTime($a['data_nascimento']);
            $acertou = in_array(alnum($resp), [$d->format('dmY'), $d->format('Ymd')], true);
    }

    if ($acertou) {
        $pdo->prepare('INSERT INTO logs_autenticacao (usuario_id, nome, cpf, login, fator_2fa, ip)
                       VALUES (:u, :n, :c, :l, :f, :ip)')
            ->execute([
                ':u' => $p['id'], ':n' => $a['nome'], ':c' => $a['cpf'], ':l' => $a['login'],
                ':f' => $perguntas[$p['campo']]['label'], ':ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        unset($_SESSION['pendente']);
        session_regenerate_id(true);
        $_SESSION['usuario'] = ['id' => $p['id'], 'login' => $a['login'], 'perfil' => 'agente'];
        // Perfil do agente no formato que o painel-acs.html ainda usa (temporário, enquanto o painel
        // não foi migrado para o banco).
        $nasc = new DateTime($a['data_nascimento']);
        resp(['ok' => true, 'destino' => 'painel-acs.html', 'agente' => [
            'name' => $a['nome'], 'motherName' => $a['nome_mae'], 'cpf' => $a['cpf'],
            'birthdate' => $nasc->format('d/m/Y'), 'gender' => $a['sexo'], 'phone' => $a['telefone'],
            'cep' => $a['cep'], 'address' => $a['endereco'], 'numero' => $a['numero'], 'email' => $a['email'],
            'login' => $a['login'], 'unit' => $a['unidade'], 'team' => $a['equipe'], 'area' => $a['area'],
        ]]);
    }

    $_SESSION['pendente']['tentativas']++;
    $t = $_SESSION['pendente']['tentativas'];
    if ($t >= 3) {
        unset($_SESSION['pendente']);
        resp(['ok' => false, 'bloqueado' => true, 'erro' => '3 tentativas sem sucesso! Favor realizar Login novamente.'], 401);
    }
    resp(['ok' => false, 'tentativas' => $t, 'erro' => 'Resposta incorreta. Restam ' . (3 - $t) . ' tentativa(s).'], 401);
}

// ---------- 3) Quem está logado (para gerencia.html / painel-acs.html) ----------
if ($acao === 'sessao') {
    if (!isset($_SESSION['usuario'])) resp(['ok' => false], 401);
    $u = $_SESSION['usuario'];
    if ($u['perfil'] === 'agente') {
        $ag = perfilAgente($pdo, (int)$u['id']);
        if (!$ag) { $_SESSION = []; session_destroy(); resp(['ok' => false], 401); }   // agente desativado/excluído
        resp(['ok' => true, 'usuario' => $u, 'agente' => $ag]);
    }
    resp(['ok' => true, 'usuario' => $u]);
}

// ---------- 4) Sair ----------
if ($acao === 'logout') {
    $_SESSION = [];
    session_destroy();
    resp(['ok' => true]);
}

resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);
