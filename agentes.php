<?php
/**
 * agentes.php — Cadastro de agentes comunitários de saúde no MySQL (ACS Conecta)
 * Recebe JSON via POST: { "acao": "listar" | "salvar" | "excluir" | "senha" | "logs" |
 *                                 "minha_conta" | "minha_senha", ... }
 *
 * Cada agente = 1 linha em `usuarios` (login, senha_hash, perfil='agente')
 *             + 1 linha em `agentes` (dados pessoais, equipe/área; CPF/CEP só com dígitos).
 * Acesso: admin e gerente (o gerente tem acesso total ao painel, exceto cadastrar gerentes).
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

/** "DD/MM/AAAA" (formulário) ou "AAAA-MM-DD" -> "AAAA-MM-DD" (banco). null se inválida. */
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

function fmtCpf(string $c): string {
    return strlen($c) === 11 ? substr($c, 0, 3) . '.' . substr($c, 3, 3) . '.' . substr($c, 6, 3) . '-' . substr($c, 9, 2) : $c;
}
function fmtCep(string $c): string {
    return strlen($c) === 8 ? substr($c, 0, 5) . '-' . substr($c, 5, 3) : $c;
}

/** Valida e normaliza os dados do formulário (CPF/CEP só dígitos, data em AAAA-MM-DD). */
function validarDados(array $in): array {
    $d = [
        'nome'     => trim((string)($in['name'] ?? '')),
        'nome_mae' => trim((string)($in['motherName'] ?? '')),
        'cpf'      => preg_replace('/\D/', '', (string)($in['cpf'] ?? '')),
        'nasc'     => trim((string)($in['birthdate'] ?? '')),
        'sexo'     => trim((string)($in['gender'] ?? '')),
        'tel'      => trim((string)($in['phone'] ?? '')),
        'cep'      => preg_replace('/\D/', '', (string)($in['cep'] ?? '')),
        'endereco' => trim((string)($in['address'] ?? '')),
        'numero'   => trim((string)($in['numero'] ?? '')),
        'email'    => trim((string)($in['email'] ?? '')),
        'login'    => trim((string)($in['login'] ?? '')),
        'unidade'  => trim((string)($in['unit'] ?? '')),
        'equipe'   => trim((string)($in['team'] ?? '')),
        'area'     => trim((string)($in['area'] ?? '')),
    ];
    if ($d['nome'] === '')                                   resp(['ok' => false, 'erro' => 'Informe o nome.'], 422);
    if ($d['nome_mae'] === '' || mb_strlen($d['nome_mae']) > 60) resp(['ok' => false, 'erro' => 'Informe o primeiro nome da mãe.'], 422);
    if (strlen($d['cpf']) !== 11)                            resp(['ok' => false, 'erro' => 'CPF inválido.'], 422);
    if (!in_array($d['sexo'], ['M', 'F', 'O'], true))        resp(['ok' => false, 'erro' => 'Selecione o sexo.'], 422);
    if (!preg_match('/^\(\d{2}\)\s\d{5}-\d{4}$/', $d['tel'])) resp(['ok' => false, 'erro' => 'Telefone inválido.'], 422);
    $iso = dataParaIso($d['nasc']);
    if ($iso === null || $iso > date('Y-m-d') || $iso < '1900-01-01') resp(['ok' => false, 'erro' => 'Data de nascimento inválida. Use o formato DD/MM/AAAA.'], 422);
    $d['nasc'] = $iso;
    if (strlen($d['cep']) !== 8)                             resp(['ok' => false, 'erro' => 'CEP inválido.'], 422);
    if ($d['endereco'] === '' || $d['numero'] === '')        resp(['ok' => false, 'erro' => 'Informe o endereço e o número.'], 422);
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL))     resp(['ok' => false, 'erro' => 'Informe um e-mail válido.'], 422);
    if ($d['login'] === '' || mb_strlen($d['login']) > 50)   resp(['ok' => false, 'erro' => 'Informe o nome de usuário (até 50 caracteres).'], 422);
    if (mb_strtolower($d['login'], 'UTF-8') === 'admin')     resp(['ok' => false, 'erro' => 'Este nome de usuário é reservado para o admin.'], 422);
    if ($d['unidade'] === '')                                $d['unidade'] = 'CMS Adão Pereira Nunes';
    if ($d['equipe'] === '' || mb_strlen($d['equipe']) > 60) resp(['ok' => false, 'erro' => 'Selecione a equipe.'], 422);
    if (!preg_match('/^\d{2}$/', $d['area']))                resp(['ok' => false, 'erro' => 'Selecione a área.'], 422);
    return $d;
}

/** Colunas devolvidas ao front, com os nomes que o gerencia.html já usa. */
const SELECT_AGENTE =
    'SELECT u.id, u.login, a.nome AS name, a.nome_mae AS motherName, a.cpf,
            a.data_nascimento AS birthdate, a.sexo AS gender, a.telefone AS phone, a.cep,
            a.endereco AS address, a.numero, a.email, a.unidade AS unit, a.equipe AS team, a.area,
            r.familias, r.visitas, r.consultas
       FROM usuarios u
       JOIN agentes a ON a.usuario_id = u.id
       JOIN vw_agentes_resumo r ON r.usuario_id = u.id';

/** CPF, CEP e data formatados para os campos com máscara da tela. */
function formatarSaida(array $a): array {
    $a['cpf'] = fmtCpf((string)$a['cpf']);
    $a['cep'] = fmtCep((string)$a['cep']);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string)$a['birthdate'], $m)) {
        $a['birthdate'] = "$m[3]/$m[2]/$m[1]";
    }
    foreach (['id', 'familias', 'visitas', 'consultas'] as $k) $a[$k] = (int)$a[$k];
    return $a;
}

/** Insere ou atualiza o agente (usuarios + agentes). Retorna o id do usuário. */
function gravarAgente(PDO $pdo, ?int $id, array $d, string $senha): int {
    // login único entre TODOS os usuários (admin, gerentes e agentes)
    $q = $pdo->prepare('SELECT id FROM usuarios WHERE login = :l AND id <> :id');
    $q->execute([':l' => $d['login'], ':id' => $id ?? 0]);
    if ($q->fetch()) resp(['ok' => false, 'erro' => 'Este nome de usuário (login) já está em uso.'], 409);

    // CPF único entre os agentes
    $q = $pdo->prepare('SELECT u.ativo FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
                         WHERE a.cpf = :c AND a.usuario_id <> :id');
    $q->execute([':c' => $d['cpf'], ':id' => $id ?? 0]);
    if ($x = $q->fetch()) {
        resp(['ok' => false, 'erro' => $x['ativo'] ? 'Já existe um agente com este CPF.'
                                                   : 'Este CPF pertence a um agente desativado.'], 409);
    }

    $pdo->beginTransaction();
    try {
        if ($id === null) {
            $pdo->prepare("INSERT INTO usuarios (login, senha_hash, perfil, ativo) VALUES (:l, :h, 'agente', 1)")
                ->execute([':l' => $d['login'], ':h' => password_hash($senha, PASSWORD_DEFAULT)]);
            $id = (int)$pdo->lastInsertId();
            $pdo->prepare(
                'INSERT INTO agentes (usuario_id, nome, nome_mae, cpf, data_nascimento, sexo, telefone, cep,
                                      endereco, numero, email, unidade, equipe, area)
                 VALUES (:u, :nome, :mae, :cpf, :nasc, :sexo, :tel, :cep, :end, :num, :email, :uni, :eq, :area)'
            )->execute([
                ':u' => $id, ':nome' => $d['nome'], ':mae' => $d['nome_mae'], ':cpf' => $d['cpf'], ':nasc' => $d['nasc'],
                ':sexo' => $d['sexo'], ':tel' => $d['tel'], ':cep' => $d['cep'], ':end' => $d['endereco'],
                ':num' => $d['numero'], ':email' => $d['email'], ':uni' => $d['unidade'], ':eq' => $d['equipe'],
                ':area' => $d['area'],
            ]);
        } else {
            $pdo->prepare('UPDATE usuarios SET login = :l WHERE id = :id')
                ->execute([':l' => $d['login'], ':id' => $id]);
            if ($senha !== '') {
                $pdo->prepare('UPDATE usuarios SET senha_hash = :h WHERE id = :id')
                    ->execute([':h' => password_hash($senha, PASSWORD_DEFAULT), ':id' => $id]);
            }
            $pdo->prepare(
                'UPDATE agentes SET nome = :nome, nome_mae = :mae, cpf = :cpf, data_nascimento = :nasc, sexo = :sexo,
                        telefone = :tel, cep = :cep, endereco = :end, numero = :num, email = :email,
                        unidade = :uni, equipe = :eq, area = :area
                  WHERE usuario_id = :u'
            )->execute([
                ':nome' => $d['nome'], ':mae' => $d['nome_mae'], ':cpf' => $d['cpf'], ':nasc' => $d['nasc'],
                ':sexo' => $d['sexo'], ':tel' => $d['tel'], ':cep' => $d['cep'], ':end' => $d['endereco'],
                ':num' => $d['numero'], ':email' => $d['email'], ':uni' => $d['unidade'], ':eq' => $d['equipe'],
                ':area' => $d['area'], ':u' => $id,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return $id;
}

/** Confere que o id informado é de um agente existente e ativo. */
function agenteExiste(PDO $pdo, int $id): bool {
    $q = $pdo->prepare("SELECT 1 FROM usuarios WHERE id = :id AND perfil = 'agente' AND ativo = 1");
    $q->execute([':id' => $id]);
    return (bool)$q->fetch();
}

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

try {
    // ---------- Listar agentes (com totais de famílias/visitas/consultas) ----------
    if ($acao === 'listar') {
        exigir(['admin', 'gerente']);
        $rows = $pdo->query(SELECT_AGENTE . " WHERE u.perfil = 'agente' AND u.ativo = 1 ORDER BY a.nome, u.login")->fetchAll();
        resp(['ok' => true, 'agentes' => array_map('formatarSaida', $rows)]);
    }

    // ---------- Cadastrar / editar agente ----------
    if ($acao === 'salvar') {
        exigir(['admin', 'gerente']);
        $id    = isset($in['id']) && $in['id'] !== null && $in['id'] !== '' ? (int)$in['id'] : null;
        $d     = validarDados($in);
        $senha = (string)($in['senha'] ?? '');

        if ($id === null && strlen($senha) < 6)  resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
        if ($senha !== '' && strlen($senha) < 6) resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
        if ($id !== null && !agenteExiste($pdo, $id)) resp(['ok' => false, 'erro' => 'Agente não encontrado.'], 404);

        resp(['ok' => true, 'id' => gravarAgente($pdo, $id, $d, $senha)]);
    }

    // ---------- Excluir agente ----------
    // Sem nenhum registro vinculado: exclui de vez.
    // Com famílias/visitas/consultas: DESATIVA (não consegue mais entrar, mas o histórico é preservado).
    if ($acao === 'excluir') {
        exigir(['admin', 'gerente']);
        $id = (int)($in['id'] ?? 0);
        if (!agenteExiste($pdo, $id)) resp(['ok' => false, 'erro' => 'Agente não encontrado.'], 404);

        $q = $pdo->prepare('SELECT
            (SELECT COUNT(*) FROM familias  WHERE agente_id = :a1) +
            (SELECT COUNT(*) FROM visitas   WHERE agente_id = :a2) +
            (SELECT COUNT(*) FROM consultas WHERE agente_id = :a3)');
        $q->execute([':a1' => $id, ':a2' => $id, ':a3' => $id]);
        $vinculos = (int)$q->fetchColumn();

        if ($vinculos > 0) {
            $pdo->prepare("UPDATE usuarios SET ativo = 0 WHERE id = :id AND perfil = 'agente'")->execute([':id' => $id]);
            resp(['ok' => true, 'desativado' => true]);
        }
        $pdo->prepare("DELETE FROM usuarios WHERE id = :id AND perfil = 'agente'")->execute([':id' => $id]);
        resp(['ok' => true, 'desativado' => false]);
    }

    // ---------- Trocar apenas a senha de um agente ----------
    if ($acao === 'senha') {
        exigir(['admin', 'gerente']);
        $id   = (int)($in['id'] ?? 0);
        $nova = (string)($in['senha'] ?? '');
        if (strlen($nova) < 6) resp(['ok' => false, 'erro' => 'A senha deve ter no mínimo 6 caracteres.'], 422);
        if (!agenteExiste($pdo, $id)) resp(['ok' => false, 'erro' => 'Agente não encontrado.'], 404);
        $pdo->prepare('UPDATE usuarios SET senha_hash = :h WHERE id = :id')
            ->execute([':h' => password_hash($nova, PASSWORD_DEFAULT), ':id' => $id]);
        resp(['ok' => true]);
    }

    // ---------- Logs de autenticação (2FA) ----------
    if ($acao === 'logs') {
        exigir(['admin', 'gerente']);
        $rows = $pdo->query('SELECT data_hora, nome, cpf, fator_2fa FROM logs_autenticacao
                              ORDER BY data_hora DESC, id DESC LIMIT 2000')->fetchAll();
        $logs = array_map(fn($r) => [
            'dataHora' => (new DateTime($r['data_hora']))->format('c'),
            'nome'     => $r['nome'],
            'cpf'      => fmtCpf((string)$r['cpf']),
            'fator2FA' => $r['fator_2fa'],
        ], $rows);
        resp(['ok' => true, 'logs' => $logs]);
    }

    // ---------- Agente logado: atualizar o próprio telefone/e-mail (o nome só a gerência altera) ----------
    if ($acao === 'minha_conta') {
        $s    = exigir(['agente']);
        $tel  = trim((string)($in['phone'] ?? ''));
        $mail = trim((string)($in['email'] ?? ''));
        if (!preg_match('/^\(\d{2}\)\s\d{5}-\d{4}$/', $tel)) resp(['ok' => false, 'erro' => 'Formato inválido: (XX) XXXXX-XXXX'], 422);
        if (!filter_var($mail, FILTER_VALIDATE_EMAIL))         resp(['ok' => false, 'erro' => 'Informe um e-mail válido.'], 422);
        $pdo->prepare('UPDATE agentes SET telefone = :t, email = :e WHERE usuario_id = :id')
            ->execute([':t' => $tel, ':e' => $mail, ':id' => $s['id']]);
        resp(['ok' => true]);
    }

    // ---------- Agente logado: trocar a própria senha (exige a senha atual) ----------
    if ($acao === 'minha_senha') {
        $s     = exigir(['agente']);
        $atual = (string)($in['atual'] ?? '');
        $nova  = (string)($in['nova'] ?? '');
        $q = $pdo->prepare('SELECT senha_hash FROM usuarios WHERE id = :id');
        $q->execute([':id' => $s['id']]);
        $h = $q->fetchColumn();
        if (!$h || !password_verify($atual, $h)) resp(['ok' => false, 'erro' => 'Senha atual incorreta.'], 422);
        if (strlen($nova) < 6)                   resp(['ok' => false, 'erro' => 'A nova senha deve ter no mínimo 6 caracteres.'], 422);
        $pdo->prepare('UPDATE usuarios SET senha_hash = :h WHERE id = :id')
            ->execute([':h' => password_hash($nova, PASSWORD_DEFAULT), ':id' => $s['id']]);
        resp(['ok' => true]);
    }

    resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[ACS Conecta] agentes.php: ' . $e->getMessage());
    resp(['ok' => false, 'erro' => 'Erro ao processar no servidor.'], 500);
}
