<?php
/**
 * consultas.php — Agenda de consultas no MySQL (ACS Conecta)
 * Recebe JSON via POST:
 *   { "acao": "listar" | "salvar" | "cancelar" | "avisado" | "presenca" | "desfazer_presenca" | "todas", ... }
 *
 * Agente logado: só as consultas dos pacientes das PRÓPRIAS famílias.
 * Admin/gerente: "todas" (somente leitura) para os relatórios do painel gerencial.
 *
 * Agenda e histórico ficam na mesma tabela:
 *   arquivado_em IS NULL     -> consulta atual (no máximo UMA por paciente)
 *   arquivado_em IS NOT NULL -> histórico (consulta com presença registrada que foi reagendada)
 *
 * O paciente é identificado como no painel: prontuario + membroIdx (posição do membro na família,
 * com o responsável primeiro e os demais por ordem de cadastro).
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

/** Exige sessão de agente ativo. Retorna ['id', 'login']. */
function exigirAgente(PDO $pdo): array {
    $s = $_SESSION['usuario'] ?? null;
    if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    if ($s['perfil'] !== 'agente') resp(['ok' => false, 'erro' => 'Apenas agentes podem gerenciar consultas.'], 403);

    $q = $pdo->prepare("SELECT id, login FROM usuarios WHERE id = :id AND perfil = 'agente' AND ativo = 1");
    $q->execute([':id' => $s['id']]);
    $a = $q->fetch();
    if (!$a) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    $a['id'] = (int)$a['id'];
    return $a;
}

/** Consultas no formato do painel, separadas em agenda (atuais) e histórico. $agenteId = null: todos os agentes. */
function listarConsultas(PDO $pdo, ?int $agenteId): array {
    $sql = 'SELECT c.id, c.status, c.data_consulta, c.hora, c.tipo, c.`local`, c.obs, c.presenca, c.presenca_em,
                   c.avisado, c.criado_em, c.arquivado_em, u.login, f.prontuario, m.nome AS paciente,
                   (SELECT COUNT(*) FROM membros x
                     WHERE x.familia_id = m.familia_id
                       AND (x.eh_responsavel > m.eh_responsavel
                            OR (x.eh_responsavel = m.eh_responsavel AND x.id < m.id))) AS idx
              FROM consultas c
              JOIN membros  m ON m.id = c.membro_id
              JOIN familias f ON f.id = m.familia_id
              JOIN usuarios u ON u.id = c.agente_id';
    if ($agenteId !== null) {
        $q = $pdo->prepare($sql . ' WHERE c.agente_id = :a ORDER BY c.id');
        $q->execute([':a' => $agenteId]);
    } else {
        $q = $pdo->query($sql . ' ORDER BY c.id');
    }

    $agenda = [];
    $historico = [];
    foreach ($q->fetchAll() as $c) {
        $r = [
            'id'          => (int)$c['id'],
            'agenteLogin' => $c['login'],
            'prontuario'  => $c['prontuario'],
            'membroIdx'   => (int)$c['idx'],
            'paciente'    => $c['paciente'],
            'status'      => $c['status'],
            'data'        => $c['data_consulta'] ?? '',
            'hora'        => $c['hora'] ? substr($c['hora'], 0, 5) : '',
            'tipo'        => $c['tipo'],
            'local'       => $c['local'] ?? '',
            'obs'         => $c['obs'] ?? '',
            'criadoEm'    => (new DateTime($c['criado_em']))->format('c'),
            'avisado'     => (bool)$c['avisado'],
        ];
        if ($c['presenca'] !== null) {
            $r['presenca']   = $c['presenca'];
            $r['presencaEm'] = $c['presenca_em'] ? (new DateTime($c['presenca_em']))->format('c') : null;
        }
        if ($c['arquivado_em'] !== null) {
            $r['arquivadoEm'] = (new DateTime($c['arquivado_em']))->format('c');
            $historico[] = $r;
        } else {
            $agenda[] = $r;
        }
    }
    return ['consultas' => $agenda, 'historico' => $historico];
}

/** Localiza o paciente (membro) numa família do agente: prontuário + posição. */
function resolverMembro(PDO $pdo, array $ag, string $prontuario, int $idx): array {
    $q = $pdo->prepare('SELECT id FROM familias WHERE prontuario = :p AND agente_id = :a');
    $q->execute([':p' => $prontuario, ':a' => $ag['id']]);
    $familiaId = $q->fetchColumn();
    if (!$familiaId) resp(['ok' => false, 'erro' => 'Família não encontrada.'], 404);

    $q = $pdo->prepare('SELECT id, nome FROM membros WHERE familia_id = :f ORDER BY eh_responsavel DESC, id');
    $q->execute([':f' => $familiaId]);
    $membros = $q->fetchAll();
    if ($idx < 0 || !isset($membros[$idx])) resp(['ok' => false, 'erro' => 'Paciente não encontrado.'], 404);
    return $membros[$idx];
}

/** Consulta atual (não arquivada) do paciente, ou null. $travar = SELECT ... FOR UPDATE. */
function consultaAtual(PDO $pdo, int $membroId, bool $travar = false): ?array {
    $q = $pdo->prepare('SELECT * FROM consultas WHERE membro_id = :m AND arquivado_em IS NULL' . ($travar ? ' FOR UPDATE' : ''));
    $q->execute([':m' => $membroId]);
    return $q->fetch() ?: null;
}

function dataConsultaValida(string $v): bool {
    $dt = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$dt || $dt->format('Y-m-d') !== $v) return false;
    return $v >= '2000-01-01' && $v <= (new DateTime('+5 years'))->format('Y-m-d');
}

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

try {
    // ---------- Admin/gerente: todas as consultas (relatórios do painel gerencial) ----------
    if ($acao === 'todas') {
        $s = $_SESSION['usuario'] ?? null;
        if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
        if (!in_array($s['perfil'], ['admin', 'gerente'], true)) resp(['ok' => false, 'erro' => 'Sem permissão para esta ação.'], 403);
        resp(['ok' => true] + listarConsultas($pdo, null));
    }

    $ag = exigirAgente($pdo);

    // ---------- Listar as consultas do agente ----------
    if ($acao === 'listar') {
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    // ---------- Agendar / reagendar / marcar como "a agendar" ----------
    if ($acao === 'salvar') {
        $membro = resolverMembro($pdo, $ag, trim((string)($in['prontuario'] ?? '')), (int)($in['membroIdx'] ?? -1));

        $status = trim((string)($in['status'] ?? ''));
        $data   = trim((string)($in['data'] ?? ''));
        $hora   = trim((string)($in['hora'] ?? ''));
        $tipo   = trim((string)($in['tipo'] ?? ''));
        $local  = trim((string)($in['local'] ?? ''));
        $obs    = trim((string)($in['obs'] ?? ''));

        if (!in_array($status, ['agendado', 'agendar'], true)) resp(['ok' => false, 'erro' => 'Status inválido.'], 422);
        if ($status === 'agendado') {
            if (!dataConsultaValida($data)) resp(['ok' => false, 'erro' => 'Informe uma data de consulta válida.'], 422);
            if ($hora !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora)) resp(['ok' => false, 'erro' => 'Hora inválida.'], 422);
        } else {
            $data = '';
            $hora = '';
        }
        if ($tipo === '' || mb_strlen($tipo) > 60) resp(['ok' => false, 'erro' => 'Informe o tipo da consulta.'], 422);
        if (mb_strlen($local) > 120)               resp(['ok' => false, 'erro' => 'O local está muito longo.'], 422);
        if (mb_strlen($obs) > 5000)                resp(['ok' => false, 'erro' => 'As observações estão muito longas.'], 422);

        $params = [
            ':st' => $status, ':d' => $data === '' ? null : $data, ':h' => $hora === '' ? null : $hora,
            ':t' => $tipo, ':l' => $local === '' ? null : $local, ':o' => $obs === '' ? null : $obs,
        ];

        $pdo->beginTransaction();
        try {
            $atual = consultaAtual($pdo, (int)$membro['id'], true);
            $inserir = true;
            if ($atual && $atual['presenca'] !== null) {
                // preserva o histórico de comparecimento/falta
                $pdo->prepare('UPDATE consultas SET arquivado_em = NOW() WHERE id = :id')->execute([':id' => $atual['id']]);
            } elseif ($atual) {
                $pdo->prepare(
                    'UPDATE consultas SET status = :st, data_consulta = :d, hora = :h, tipo = :t, `local` = :l, obs = :o,
                            avisado = 0, presenca = NULL, presenca_em = NULL, criado_em = NOW(), agente_id = :a
                      WHERE id = :id'
                )->execute($params + [':id' => $atual['id'], ':a' => $ag['id']]);
                $inserir = false;
            }
            if ($inserir) {
                $pdo->prepare(
                    'INSERT INTO consultas (agente_id, membro_id, status, data_consulta, hora, tipo, `local`, obs)
                     VALUES (:a, :m, :st, :d, :h, :t, :l, :o)'
                )->execute($params + [':a' => $ag['id'], ':m' => $membro['id']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    // ---------- Cancelar agendamento (o paciente volta para "Agendar") ----------
    if ($acao === 'cancelar') {
        $membro = resolverMembro($pdo, $ag, trim((string)($in['prontuario'] ?? '')), (int)($in['membroIdx'] ?? -1));
        $q = $pdo->prepare('DELETE FROM consultas WHERE membro_id = :m AND arquivado_em IS NULL');
        $q->execute([':m' => $membro['id']]);
        if ($q->rowCount() === 0) resp(['ok' => false, 'erro' => 'Consulta não encontrada.'], 404);
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    // ---------- Marcar paciente como avisado (D-1) ----------
    if ($acao === 'avisado') {
        $membro = resolverMembro($pdo, $ag, trim((string)($in['prontuario'] ?? '')), (int)($in['membroIdx'] ?? -1));
        $q = $pdo->prepare('UPDATE consultas SET avisado = 1 WHERE membro_id = :m AND arquivado_em IS NULL');
        $q->execute([':m' => $membro['id']]);
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    // ---------- Registrar presença (compareceu / faltou) ----------
    if ($acao === 'presenca') {
        $valor  = trim((string)($in['valor'] ?? ''));
        if (!in_array($valor, ['compareceu', 'faltou'], true)) resp(['ok' => false, 'erro' => 'Valor de presença inválido.'], 422);
        $membro = resolverMembro($pdo, $ag, trim((string)($in['prontuario'] ?? '')), (int)($in['membroIdx'] ?? -1));
        $atual  = consultaAtual($pdo, (int)$membro['id']);
        if (!$atual || $atual['data_consulta'] === null) resp(['ok' => false, 'erro' => 'Consulta não encontrada.'], 404);
        if ($atual['data_consulta'] > date('Y-m-d')) {
            resp(['ok' => false, 'erro' => 'A presença só pode ser registrada a partir do dia da consulta.'], 422);
        }
        $pdo->prepare('UPDATE consultas SET presenca = :p, presenca_em = NOW() WHERE id = :id')
            ->execute([':p' => $valor, ':id' => $atual['id']]);
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    // ---------- Desfazer o registro de presença ----------
    if ($acao === 'desfazer_presenca') {
        $membro = resolverMembro($pdo, $ag, trim((string)($in['prontuario'] ?? '')), (int)($in['membroIdx'] ?? -1));
        $pdo->prepare('UPDATE consultas SET presenca = NULL, presenca_em = NULL WHERE membro_id = :m AND arquivado_em IS NULL')
            ->execute([':m' => $membro['id']]);
        resp(['ok' => true] + listarConsultas($pdo, $ag['id']));
    }

    resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[ACS Conecta] consultas.php: ' . $e->getMessage());
    resp(['ok' => false, 'erro' => 'Erro ao processar no servidor.'], 500);
}
