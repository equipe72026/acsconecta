<?php
/**
 * gerentes.php — Cadastro de gerentes no MySQL (ACS Conecta)
 * Recebe JSON via POST: { "acao": "listar" | "salvar" | "excluir" |
 *                                 "meus_dados" | "salvar_meus_dados" | "senha_admin", ... }
 *
 * Cada gerente = 1 linha em `usuarios` (login, senha_hash, perfil='gerente')
 *              + 1 linha em `gerentes` (dados pessoais; CPF/CEP só com dígitos).
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

/** Exige sessão ativa e um dos perfis informados. */
function exigir(array $perfis): array {
    $s = $_SESSION['usuario'] ?? null;
    if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    if (!in_array($s['perfil'], $perfis, true)) resp(['ok' => false, 'erro' => 'Sem permissão para esta ação.'], 403);
    return $s;
}

/** Converte "DD/MM/AAAA" (formulário) ou "AAAA-MM-DD" para "AAAA-MM-DD" (banco). Retorna null se inválida. */
function dataParaIso(string $v): ?string {
    $v = trim($v);
    foreach (['d/m/Y', 'Y-m-d'] as $fmt) {
        $dt = DateTime::createFromFormat('!' . $fmt, $v);
        $erros = DateTime::getLastErrors();
        if ($dt && $v === $dt->format($fmt) && (!$erros || ($erros['warning_count'] + $erros['error_count']) === 0)) {
            return $dt->format('Y-m-d');
        }
    }
    return null;
}

/** Valida e normaliza os dados vindos do formulário (CPF e CEP ficam só com dígitos, como no schema). */
function validarDados(array $in): array {
    $d = [
        'nome'      => trim((string)($in['nome'] ?? '')),
        'cpf'       => preg_replace('/\D/', '', (string)($in['cpf'] ?? '')),
        'birthdate' => trim((string)($in['birthdate'] ?? '')),
        'gender'    => trim((string)($in['gender'] ?? '')),
        'phone'     => trim((string)($in['phone'] ?? '')),
        'cep'       => preg_replace('/\D/', '', (string)($in['cep'] ?? '')),
        'address'   => trim((string)($in['address'] ?? '')),
        'numero'    => trim((string)($in['numero'] ?? '')),
        'email'     => trim((string)($in['email'] ?? '')),
        'login'     => trim((string)($in['login'] ?? '')),
    ];
    if ($d['nome'] === '')                                   resp(['ok' => false, 'erro' => 'Informe o nome.'], 422);
    if (strlen($d['cpf']) !== 11)                            resp(['ok' => false, 'erro' => 'CPF inválido.'], 422);
    if (!in_array($d['gender'], ['M', 'F', 'O'], true))      resp(['ok' => false, 'erro' => 'Selecione o sexo.'], 422);
    if (!preg_match('/^\(\d{2}\)\s\d{5}-\d{4}$/', $d['phone'])) resp(['ok' => false, 'erro' => 'Telefone inválido.'], 422);
    $iso = dataParaIso($d['birthdate']);
    if ($iso === null || $iso > date('Y-m-d') || $iso < '1900-01-01') resp(['ok' => false, 'erro' => 'Data de nascimento inválida. Use o formato DD/MM/AAAA.'], 422);
    $d['birthdate'] = $iso;   // a partir daqui, sempre AAAA-MM-DD para o banco
    if (strlen($d['cep']) !== 8)                             resp(['ok' => false, 'erro' => 'CEP inválido.'], 422);
    if ($d['address'] === '' || $d['numero'] === '')         resp(['ok' => false, 'erro' => 'Informe o endereço e o número.'], 422);
    if ($d['email'] === '' || !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) resp(['ok' => false, 'erro' => 'Informe um e-mail válido.'], 422);
    if ($d['login'] === '')                                  resp(['ok' => false, 'erro' => 'Informe o nome de usuário.'], 422);
    if (mb_strtolower($d['login'], 'UTF-8') === 'admin')     resp(['ok' => false, 'erro' => 'Este nome de usuário é reservado para o admin.'], 422);
    return $d;
}

/** Devolve CPF, CEP e data formatados para exibir nos campos com máscara. */
function formatarSaida(array $g): array {
    if (!empty($g['cpf']) && strlen($g['cpf']) === 11) {
        $g['cpf'] = substr($g['cpf'], 0, 3) . '.' . substr($g['cpf'], 3, 3) . '.' . substr($g['cpf'], 6, 3) . '-' . substr($g['cpf'], 9, 2);
    }
    if (!empty($g['birthdate']) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $g['birthdate'], $m)) {
        $g['birthdate'] = "$m[3]/$m[2]/$m[1]";   // banco AAAA-MM-DD -> tela DD/MM/AAAA
    }
    if (!empty($g['cep']) && strlen($g['cep']) === 8) {
        $g['cep'] = substr($g['cep'], 0, 5) . '-' . substr($g['cep'], 5, 3);
    }
    return $g;
}

/** Insere ou atualiza o gerente (usuarios + gerentes). Retorna o id do usuário. */
function gravarGerente(PDO $pdo, ?int $usuarioId, array $d, string $senha): int {
    // login único entre TODOS os usuários (admin, gerentes e agentes)
    $q = $pdo->prepare('SELECT id FROM usuarios WHERE login = :l AND id <> :id');
    $q->execute([':l' => $d['login'], ':id' => $usuarioId ?? 0]);
    if ($q->fetch()) resp(['ok' => false, 'erro' => 'Este nome de usuário já está em uso.'], 409);

    // CPF único entre os gerentes
    $q = $pdo->prepare('SELECT usuario_id FROM gerentes WHERE cpf = :c AND usuario_id <> :id');
    $q->execute([':c' => $d['cpf'], ':id' => $usuarioId ?? 0]);
    if ($q->fetch()) resp(['ok' => false, 'erro' => 'Já existe um gerente com este CPF.'], 409);

    $pdo->beginTransaction();
    try {
        if ($usuarioId === null) {
            $pdo->prepare("INSERT INTO usuarios (login, senha_hash, perfil, ativo) VALUES (:l, :h, 'gerente', 1)")
                ->execute([':l' => $d['login'], ':h' => password_hash($senha, PASSWORD_DEFAULT)]);
            $usuarioId = (int)$pdo->lastInsertId();
            $pdo->prepare(
                'INSERT INTO gerentes (usuario_id, nome, cpf, data_nascimento, sexo, telefone, cep, endereco, numero, email)
                 VALUES (:u, :nome, :cpf, :nasc, :sexo, :tel, :cep, :end, :num, :email)'
            )->execute([
                ':u' => $usuarioId, ':nome' => $d['nome'], ':cpf' => $d['cpf'], ':nasc' => $d['birthdate'],
                ':sexo' => $d['gender'], ':tel' => $d['phone'], ':cep' => $d['cep'], ':end' => $d['address'],
                ':num' => $d['numero'], ':email' => $d['email'],
            ]);
        } else {
            $pdo->prepare('UPDATE usuarios SET login = :l WHERE id = :id')
                ->execute([':l' => $d['login'], ':id' => $usuarioId]);
            if ($senha !== '') {
                $pdo->prepare('UPDATE usuarios SET senha_hash = :h WHERE id = :id')
                    ->execute([':h' => password_hash($senha, PASSWORD_DEFAULT), ':id' => $usuarioId]);
            }
            $pdo->prepare(
                'UPDATE gerentes SET nome = :nome, cpf = :cpf, data_nascimento = :nasc, sexo = :sexo,
                        telefone = :tel, cep = :cep, endereco = :end, numero = :num, email = :email
                  WHERE usuario_id = :u'
            )->execute([
                ':nome' => $d['nome'], ':cpf' => $d['cpf'], ':nasc' => $d['birthdate'], ':sexo' => $d['gender'],
                ':tel' => $d['phone'], ':cep' => $d['cep'], ':end' => $d['address'], ':num' => $d['numero'],
                ':email' => $d['email'], ':u' => $usuarioId,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return $usuarioId;
}

/** Colunas devolvidas ao front, já com os nomes que o gerencia.html usa. */
const SELECT_GERENTE =
    'SELECT u.id, u.login, g.nome, g.cpf, g.data_nascimento AS birthdate, g.sexo AS gender,
            g.telefone AS phone, g.cep, g.endereco AS address, g.numero, g.email
       FROM usuarios u LEFT JOIN gerentes g ON g.usuario_id = u.id';

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

try {
    // ---------- Admin: listar gerentes ----------
    if ($acao === 'listar') {
        exigir(['admin']);
        $rows = $pdo->query(SELECT_GERENTE . " WHERE u.perfil = 'gerente' AND u.ativo = 1 ORDER BY g.nome, u.login")->fetchAll();
        resp(['ok' => true, 'gerentes' => array_map('formatarSaida', $rows)]);
    }

    // ---------- Admin: cadastrar / editar gerente ----------
    if ($acao === 'salvar') {
        exigir(['admin']);
        $id    = isset($in['id']) && $in['id'] !== null && $in['id'] !== '' ? (int)$in['id'] : null;
        $d     = validarDados($in);
        $senha = (string)($in['senha'] ?? '');

        if ($id === null && strlen($senha) < 6)       resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
        if ($senha !== '' && strlen($senha) < 6)      resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);

        if ($id !== null) {
            $q = $pdo->prepare("SELECT id FROM usuarios WHERE id = :id AND perfil = 'gerente'");
            $q->execute([':id' => $id]);
            if (!$q->fetch()) resp(['ok' => false, 'erro' => 'Gerente não encontrado.'], 404);
        }
        $novoId = gravarGerente($pdo, $id, $d, $senha);
        resp(['ok' => true, 'id' => $novoId]);
    }

    // ---------- Admin: excluir gerente ----------
    if ($acao === 'excluir') {
        exigir(['admin']);
        $id = (int)($in['id'] ?? 0);
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM gerentes WHERE usuario_id = :id')->execute([':id' => $id]);
        $pdo->prepare("DELETE FROM usuarios WHERE id = :id AND perfil = 'gerente'")->execute([':id' => $id]);
        $pdo->commit();
        resp(['ok' => true]);
    }

    // ---------- Gerente: ler os próprios dados ----------
    if ($acao === 'meus_dados') {
        $s = exigir(['gerente']);
        $q = $pdo->prepare(SELECT_GERENTE . " WHERE u.id = :id AND u.perfil = 'gerente'");
        $q->execute([':id' => $s['id']]);
        $g = $q->fetch();
        $g ? resp(['ok' => true, 'gerente' => formatarSaida($g)]) : resp(['ok' => false, 'erro' => 'Cadastro não encontrado.'], 404);
    }

    // ---------- Gerente: atualizar os próprios dados ----------
    if ($acao === 'salvar_meus_dados') {
        $s     = exigir(['gerente']);
        $d     = validarDados($in);
        $senha = (string)($in['senha'] ?? '');
        if ($senha !== '' && strlen($senha) < 6) resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);

        gravarGerente($pdo, (int)$s['id'], $d, $senha);
        $_SESSION['usuario']['login'] = $d['login'];   // mantém a sessão válida se o login mudou
        resp(['ok' => true, 'login' => $d['login']]);
    }

    // ---------- Admin: trocar a própria senha ----------
    if ($acao === 'senha_admin') {
        $s    = exigir(['admin']);
        $nova = (string)($in['senha'] ?? '');
        if (strlen($nova) < 6) resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
        $pdo->prepare('UPDATE usuarios SET senha_hash = :h WHERE id = :id')
            ->execute([':h' => password_hash($nova, PASSWORD_DEFAULT), ':id' => $s['id']]);
        resp(['ok' => true]);
    }

    resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[ACS Conecta] gerentes.php: ' . $e->getMessage());
    resp(['ok' => false, 'erro' => 'Erro ao processar no servidor.'], 500);
}
