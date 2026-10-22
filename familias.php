<?php
/**
 * familias.php — Fichas territoriais (famílias + membros) no MySQL (ACS Conecta)
 * Recebe JSON via POST: { "acao": "listar" | "prontuario" | "salvar" | "excluir" | "todas", ... }
 *
 * Acesso: agente logado (só as PRÓPRIAS famílias); a ação "todas" é só leitura para admin/gerente.
 * Prontuário = 'AA.NNN' (área do agente + sequencial), gerado com MAX()+1 dentro de transação.
 *
 * As respostas usam os nomes de campo que o painel-acs.html já utiliza
 * (numCasa, nascimento, sus, vacinaAtrasada, deficienteFisico...).
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

/** Exige sessão de agente ativo. Retorna ['id', 'login', 'area']. */
function exigirAgente(PDO $pdo): array {
    $s = $_SESSION['usuario'] ?? null;
    if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    if ($s['perfil'] !== 'agente') resp(['ok' => false, 'erro' => 'Apenas agentes podem acessar as fichas territoriais.'], 403);

    $q = $pdo->prepare('SELECT u.id, u.login, a.area FROM usuarios u JOIN agentes a ON a.usuario_id = u.id
                         WHERE u.id = :id AND u.ativo = 1');
    $q->execute([':id' => $s['id']]);
    $a = $q->fetch();
    if (!$a) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    $a['id'] = (int)$a['id'];
    return $a;
}

/** Área do agente com 2 dígitos ("1" -> "01"). */
function areaDoAgente(array $ag): string {
    $n = preg_replace('/\D/', '', (string)$ag['area']);
    return $n === '' ? '00' : str_pad(substr($n, 0, 2), 2, '0', STR_PAD_LEFT);
}

function fmtCep(string $c): string {
    return strlen($c) === 8 ? substr($c, 0, 5) . '-' . substr($c, 5, 3) : $c;
}

/** Data AAAA-MM-DD válida? */
function dataValida(string $v): bool {
    $dt = DateTime::createFromFormat('!Y-m-d', $v);
    return $dt && $dt->format('Y-m-d') === $v && $v <= date('Y-m-d') && $v >= '1900-01-01';
}

/** Lista as famílias com os membros, no formato usado pelo painel. $ag = null lista as de todos os agentes. */
function listarFamilias(PDO $pdo, ?array $ag): array {
    $sql = 'SELECT f.id, f.prontuario, f.cep, f.logradouro, f.num_casa, f.complemento, f.bairro, f.cidade, f.uf, u.login
              FROM familias f JOIN usuarios u ON u.id = f.agente_id';
    if ($ag !== null) {
        $q = $pdo->prepare($sql . ' WHERE f.agente_id = :a ORDER BY f.area, f.sequencial');
        $q->execute([':a' => $ag['id']]);
    } else {
        $q = $pdo->query($sql . ' ORDER BY f.area, f.sequencial');
    }
    $familias = $q->fetchAll();
    if (!$familias) return [];

    $ids = array_column($familias, 'id');
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $q = $pdo->prepare("SELECT * FROM membros WHERE familia_id IN ($in) ORDER BY familia_id, eh_responsavel DESC, id");
    $q->execute($ids);
    $porFamilia = [];
    foreach ($q->fetchAll() as $m) {
        $porFamilia[$m['familia_id']][] = [
            'id'               => (int)$m['id'],
            'nome'             => $m['nome'],
            'nascimento'       => $m['data_nascimento'],          // AAAA-MM-DD (input type="date")
            'cpf'              => $m['cpf'],
            'sus'              => $m['cartao_sus'],
            'sexo'             => $m['sexo'],
            'telefone'         => $m['telefone'] ?? '',
            'hipertenso'       => (bool)$m['hipertenso'],
            'diabetico'        => (bool)$m['diabetico'],
            'gestante'         => (bool)$m['gestante'],
            'vacinaAtrasada'   => (bool)$m['vacina_atrasada'],
            'tuberculose'      => (bool)$m['tuberculose'],
            'hanseniase'       => (bool)$m['hanseniase'],
            'deficienteFisico' => (bool)$m['deficiente_fisico'],
        ];
    }

    return array_map(function ($f) use ($porFamilia) {
        $membros = $porFamilia[$f['id']] ?? [];
        return [
            'id'          => (int)$f['id'],
            'agenteLogin' => $f['login'],
            'prontuario'  => $f['prontuario'],
            'responsavel' => $membros[0]['nome'] ?? '',
            'cep'         => fmtCep((string)$f['cep']),
            'logradouro'  => $f['logradouro'],
            'numCasa'     => $f['num_casa'],
            'complemento' => $f['complemento'] ?? '',
            'bairro'      => $f['bairro'],
            'cidade'      => $f['cidade'],
            'uf'          => $f['uf'],
            'membros'     => $membros,
        ];
    }, $familias);
}

/** Valida o formulário. Retorna [dadosDaFamilia, listaDeMembros]. */
function validarFicha(array $in): array {
    $f = [
        'cep'         => preg_replace('/\D/', '', (string)($in['cep'] ?? '')),
        'logradouro'  => trim((string)($in['logradouro'] ?? '')),
        'num_casa'    => trim((string)($in['numCasa'] ?? '')),
        'complemento' => trim((string)($in['complemento'] ?? '')),
        'bairro'      => trim((string)($in['bairro'] ?? '')),
        'cidade'      => trim((string)($in['cidade'] ?? '')),
        'uf'          => strtoupper(trim((string)($in['uf'] ?? ''))),
    ];
    if (strlen($f['cep']) !== 8)                       resp(['ok' => false, 'erro' => 'CEP inválido.'], 422);
    if ($f['logradouro'] === '' || mb_strlen($f['logradouro']) > 200) resp(['ok' => false, 'erro' => 'Informe o logradouro.'], 422);
    if ($f['num_casa'] === '' || mb_strlen($f['num_casa']) > 15)      resp(['ok' => false, 'erro' => 'Informe o número da casa.'], 422);
    if (mb_strlen($f['complemento']) > 100)            resp(['ok' => false, 'erro' => 'Complemento muito longo.'], 422);
    if ($f['bairro'] === '' || mb_strlen($f['bairro']) > 100) resp(['ok' => false, 'erro' => 'Informe o bairro.'], 422);
    if ($f['cidade'] === '' || mb_strlen($f['cidade']) > 100) resp(['ok' => false, 'erro' => 'Informe a cidade.'], 422);
    if (!preg_match('/^[A-Z]{2}$/', $f['uf']))         resp(['ok' => false, 'erro' => 'UF inválida.'], 422);
    if ($f['complemento'] === '') $f['complemento'] = null;

    $brutos = $in['membros'] ?? null;
    if (!is_array($brutos) || count($brutos) < 1) resp(['ok' => false, 'erro' => 'Cadastre ao menos um membro (o responsável).'], 422);
    if (count($brutos) > 30)                      resp(['ok' => false, 'erro' => 'Número de membros acima do permitido.'], 422);

    $membros = [];
    foreach (array_values($brutos) as $i => $m) {
        $n   = $i + 1;
        $tel = trim((string)($m['telefone'] ?? ''));
        $x = [
            'id'    => (int)($m['id'] ?? 0),      // 0 = membro novo
            'nome'  => trim((string)($m['nome'] ?? '')),
            'nasc'  => trim((string)($m['nascimento'] ?? '')),
            'cpf'   => preg_replace('/\D/', '', (string)($m['cpf'] ?? '')),
            'sus'   => preg_replace('/\D/', '', (string)($m['sus'] ?? '')),
            'sexo'  => trim((string)($m['sexo'] ?? '')),
            'tel'   => $tel === '' ? null : $tel,
            'hip'   => !empty($m['hipertenso']) ? 1 : 0,
            'diab'  => !empty($m['diabetico']) ? 1 : 0,
            'gest'  => !empty($m['gestante']) ? 1 : 0,
            'vac'   => !empty($m['vacinaAtrasada']) ? 1 : 0,
            'tub'   => !empty($m['tuberculose']) ? 1 : 0,
            'han'   => !empty($m['hanseniase']) ? 1 : 0,
            'def'   => !empty($m['deficienteFisico']) ? 1 : 0,
        ];
        if ($x['nome'] === '' || mb_strlen($x['nome']) > 120) resp(['ok' => false, 'erro' => "Membro $n: informe o nome."], 422);
        if (!dataValida($x['nasc']))                          resp(['ok' => false, 'erro' => "Membro $n: data de nascimento inválida."], 422);
        if (strlen($x['cpf']) !== 11)                         resp(['ok' => false, 'erro' => "Membro $n: CPF inválido."], 422);
        if ($x['sus'] === '' || strlen($x['sus']) > 15)       resp(['ok' => false, 'erro' => "Membro $n: informe o cartão SUS."], 422);
        if (!in_array($x['sexo'], ['M', 'F', 'O'], true))     resp(['ok' => false, 'erro' => "Membro $n: selecione o sexo."], 422);
        if ($x['tel'] !== null && !preg_match('/^\(\d{2}\)\s\d{5}-\d{4}$/', $x['tel'])) {
            resp(['ok' => false, 'erro' => "Membro $n: telefone inválido."], 422);
        }
        $membros[] = $x;
    }
    return [$f, $membros];
}

/** Busca uma família do agente pelo prontuário. */
function buscarFamilia(PDO $pdo, array $ag, string $prontuario): ?array {
    $q = $pdo->prepare('SELECT id, area, sequencial, prontuario FROM familias WHERE prontuario = :p AND agente_id = :a');
    $q->execute([':p' => $prontuario, ':a' => $ag['id']]);
    return $q->fetch() ?: null;
}

const COLS_MEMBRO = ':nome, :nasc, :cpf, :sus, :sexo, :tel, :hip, :diab, :gest, :vac, :tub, :han, :def';

function paramsMembro(array $x): array {
    return [
        ':nome' => $x['nome'], ':nasc' => $x['nasc'], ':cpf' => $x['cpf'], ':sus' => $x['sus'], ':sexo' => $x['sexo'],
        ':tel' => $x['tel'], ':hip' => $x['hip'], ':diab' => $x['diab'], ':gest' => $x['gest'], ':vac' => $x['vac'],
        ':tub' => $x['tub'], ':han' => $x['han'], ':def' => $x['def'],
    ];
}

/** Cria a família com um novo prontuário. Tenta de novo se dois cadastros simultâneos colidirem. */
function criarFamilia(PDO $pdo, array $ag, array $f, array $membros): string {
    $area = areaDoAgente($ag);
    for ($tentativa = 1; $tentativa <= 4; $tentativa++) {
        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('SELECT COALESCE(MAX(sequencial), 0) + 1 FROM familias WHERE area = :a FOR UPDATE');
            $q->execute([':a' => $area]);
            $seq = (int)$q->fetchColumn();
            if ($seq > 999) {
                $pdo->rollBack();
                resp(['ok' => false, 'erro' => 'Limite de 999 famílias por área atingido.'], 409);
            }
            $prontuario = sprintf('%s.%03d', $area, $seq);

            $pdo->prepare(
                'INSERT INTO familias (agente_id, area, sequencial, prontuario, cep, logradouro, num_casa, complemento, bairro, cidade, uf)
                 VALUES (:ag, :area, :seq, :pr, :cep, :log, :num, :comp, :bai, :cid, :uf)'
            )->execute([
                ':ag' => $ag['id'], ':area' => $area, ':seq' => $seq, ':pr' => $prontuario, ':cep' => $f['cep'],
                ':log' => $f['logradouro'], ':num' => $f['num_casa'], ':comp' => $f['complemento'],
                ':bai' => $f['bairro'], ':cid' => $f['cidade'], ':uf' => $f['uf'],
            ]);
            $familiaId = (int)$pdo->lastInsertId();

            $ins = $pdo->prepare(
                'INSERT INTO membros (familia_id, eh_responsavel, nome, data_nascimento, cpf, cartao_sus, sexo, telefone,
                                      hipertenso, diabetico, gestante, vacina_atrasada, tuberculose, hanseniase, deficiente_fisico)
                 VALUES (:fam, :resp, ' . COLS_MEMBRO . ')'
            );
            foreach ($membros as $i => $x) {
                $ins->execute([':fam' => $familiaId, ':resp' => $i === 0 ? 1 : 0] + paramsMembro($x));
            }
            $pdo->commit();
            return $prontuario;
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $duplicado = ($e->errorInfo[1] ?? 0) === 1062 || ($e->errorInfo[1] ?? 0) === 1213;   // chave duplicada / deadlock
            if (!$duplicado || $tentativa === 4) throw $e;
        }
    }
    throw new RuntimeException('Não foi possível gerar o prontuário.');
}

/**
 * Atualiza a família e os membros. Cada membro é identificado pelo id que o formulário devolve:
 * com id existente -> atualiza (o id se mantém, e com ele as consultas do paciente);
 * sem id           -> insere; membro que saiu do formulário -> é removido (e suas consultas, por CASCADE).
 * O 1º membro do formulário é o responsável.
 */
function atualizarFamilia(PDO $pdo, array $fam, array $f, array $membros): void {
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'UPDATE familias SET cep = :cep, logradouro = :log, num_casa = :num, complemento = :comp,
                    bairro = :bai, cidade = :cid, uf = :uf WHERE id = :id'
        )->execute([
            ':cep' => $f['cep'], ':log' => $f['logradouro'], ':num' => $f['num_casa'], ':comp' => $f['complemento'],
            ':bai' => $f['bairro'], ':cid' => $f['cidade'], ':uf' => $f['uf'], ':id' => $fam['id'],
        ]);

        $q = $pdo->prepare('SELECT id FROM membros WHERE familia_id = :f');
        $q->execute([':f' => $fam['id']]);
        $existentes = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));

        $upd = $pdo->prepare(
            'UPDATE membros SET eh_responsavel = :resp, nome = :nome, data_nascimento = :nasc, cpf = :cpf, cartao_sus = :sus,
                    sexo = :sexo, telefone = :tel, hipertenso = :hip, diabetico = :diab, gestante = :gest,
                    vacina_atrasada = :vac, tuberculose = :tub, hanseniase = :han, deficiente_fisico = :def
              WHERE id = :id AND familia_id = :fam'
        );
        $ins = $pdo->prepare(
            'INSERT INTO membros (familia_id, eh_responsavel, nome, data_nascimento, cpf, cartao_sus, sexo, telefone,
                                  hipertenso, diabetico, gestante, vacina_atrasada, tuberculose, hanseniase, deficiente_fisico)
             VALUES (:fam, :resp, ' . COLS_MEMBRO . ')'
        );

        $mantidos = [];
        foreach ($membros as $i => $x) {
            $resp = $i === 0 ? 1 : 0;
            $id   = $x['id'];
            if ($id > 0 && in_array($id, $existentes, true) && !isset($mantidos[$id])) {
                $upd->execute([':resp' => $resp, ':id' => $id, ':fam' => $fam['id']] + paramsMembro($x));
                $mantidos[$id] = true;
            } else {
                $ins->execute([':fam' => $fam['id'], ':resp' => $resp] + paramsMembro($x));
            }
        }

        // membros removidos no formulário
        $del = $pdo->prepare('DELETE FROM membros WHERE id = :id AND familia_id = :fam');
        foreach ($existentes as $id) {
            if (!isset($mantidos[$id])) $del->execute([':id' => $id, ':fam' => $fam['id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

try {
    // ---------- Admin/gerente: todas as famílias (relatórios do painel gerencial) ----------
    if ($acao === 'todas') {
        $s = $_SESSION['usuario'] ?? null;
        if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
        if (!in_array($s['perfil'], ['admin', 'gerente'], true)) resp(['ok' => false, 'erro' => 'Sem permissão para esta ação.'], 403);
        resp(['ok' => true, 'familias' => listarFamilias($pdo, null)]);
    }

    $ag = exigirAgente($pdo);

    // ---------- Listar as famílias do agente ----------
    if ($acao === 'listar') {
        resp(['ok' => true, 'familias' => listarFamilias($pdo, $ag)]);
    }

    // ---------- Prévia do próximo prontuário (só exibição; o definitivo é gerado ao salvar) ----------
    if ($acao === 'prontuario') {
        $area = areaDoAgente($ag);
        $q = $pdo->prepare('SELECT COALESCE(MAX(sequencial), 0) + 1 FROM familias WHERE area = :a');
        $q->execute([':a' => $area]);
        resp(['ok' => true, 'prontuario' => sprintf('%s.%03d', $area, (int)$q->fetchColumn())]);
    }

    // ---------- Cadastrar / atualizar ficha ----------
    if ($acao === 'salvar') {
        [$f, $membros] = validarFicha($in);
        $prontuarioEdit = trim((string)($in['prontuario'] ?? ''));

        if ($prontuarioEdit !== '') {
            $fam = buscarFamilia($pdo, $ag, $prontuarioEdit);
            if (!$fam) resp(['ok' => false, 'erro' => 'Família não encontrada.'], 404);
            atualizarFamilia($pdo, $fam, $f, $membros);
            $prontuario = $fam['prontuario'];
            $criada = false;
        } else {
            $prontuario = criarFamilia($pdo, $ag, $f, $membros);
            $criada = true;
        }
        resp(['ok' => true, 'prontuario' => $prontuario, 'criada' => $criada, 'familias' => listarFamilias($pdo, $ag)]);
    }

    // ---------- Excluir ficha (membros e visitas do banco saem junto, por CASCADE) ----------
    if ($acao === 'excluir') {
        $fam = buscarFamilia($pdo, $ag, trim((string)($in['prontuario'] ?? '')));
        if (!$fam) resp(['ok' => false, 'erro' => 'Família não encontrada.'], 404);
        $pdo->prepare('DELETE FROM familias WHERE id = :id AND agente_id = :a')
            ->execute([':id' => $fam['id'], ':a' => $ag['id']]);
        resp(['ok' => true, 'familias' => listarFamilias($pdo, $ag)]);
    }

    resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[ACS Conecta] familias.php: ' . $e->getMessage());
    resp(['ok' => false, 'erro' => 'Erro ao processar no servidor.'], 500);
}
