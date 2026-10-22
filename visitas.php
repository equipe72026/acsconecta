<?php
/**
 * visitas.php — Visitas domiciliares no MySQL (ACS Conecta)
 * Recebe JSON via POST: { "acao": "listar" | "salvar" | "excluir" | "todas", ... }
 *
 * Agente logado: lista, registra e exclui apenas as PRÓPRIAS visitas, e só de famílias dele.
 * Admin/gerente: "todas" (somente leitura) para os relatórios do painel gerencial.
 *
 * As respostas usam os nomes de campo do painel: { id, agenteLogin, prontuario, data, motivo, desfecho, notas }.
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
    if ($s['perfil'] !== 'agente') resp(['ok' => false, 'erro' => 'Apenas agentes podem registrar visitas.'], 403);

    $q = $pdo->prepare('SELECT id, login FROM usuarios WHERE id = :id AND perfil = \'agente\' AND ativo = 1');
    $q->execute([':id' => $s['id']]);
    $a = $q->fetch();
    if (!$a) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
    $a['id'] = (int)$a['id'];
    return $a;
}

/** Visitas em ordem de registro (a mais recente é a última). $agenteId = null lista as de todos. */
function listarVisitas(PDO $pdo, ?int $agenteId): array {
    $sql = 'SELECT v.id, u.login, f.prontuario, v.data_visita, v.motivo, v.desfecho, v.notas
              FROM visitas v
              JOIN familias f ON f.id = v.familia_id
              JOIN usuarios u ON u.id = v.agente_id';
    if ($agenteId !== null) {
        $q = $pdo->prepare($sql . ' WHERE v.agente_id = :a ORDER BY v.id');
        $q->execute([':a' => $agenteId]);
    } else {
        $q = $pdo->query($sql . ' ORDER BY v.id');
    }
    return array_map(fn($v) => [
        'id'          => (int)$v['id'],
        'agenteLogin' => $v['login'],
        'prontuario'  => $v['prontuario'],
        'data'        => $v['data_visita'],     // AAAA-MM-DD
        'motivo'      => $v['motivo'],
        'desfecho'    => $v['desfecho'],
        'notas'       => $v['notas'] ?? '',
    ], $q->fetchAll());
}

/** Data AAAA-MM-DD válida; aceita até "amanhã" para tolerar diferença de fuso do navegador. */
function dataVisitaValida(string $v): bool {
    $dt = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$dt || $dt->format('Y-m-d') !== $v) return false;
    $limite = (new DateTime('tomorrow'))->format('Y-m-d');
    return $v >= '2000-01-01' && $v <= $limite;
}

$in   = json_decode(file_get_contents('php://input'), true) ?? [];
$acao = $in['acao'] ?? '';

try {
    // ---------- Admin/gerente: todas as visitas (relatórios do painel gerencial) ----------
    if ($acao === 'todas') {
        $s = $_SESSION['usuario'] ?? null;
        if (!$s) resp(['ok' => false, 'erro' => 'Sessão expirada. Faça login novamente.'], 401);
        if (!in_array($s['perfil'], ['admin', 'gerente'], true)) resp(['ok' => false, 'erro' => 'Sem permissão para esta ação.'], 403);
        resp(['ok' => true, 'visitas' => listarVisitas($pdo, null)]);
    }

    $ag = exigirAgente($pdo);

    // ---------- Listar as visitas do agente ----------
    if ($acao === 'listar') {
        resp(['ok' => true, 'visitas' => listarVisitas($pdo, $ag['id'])]);
    }

    // ---------- Registrar visita ----------
    if ($acao === 'salvar') {
        $prontuario = trim((string)($in['prontuario'] ?? ''));
        $data       = trim((string)($in['data'] ?? ''));
        $motivo     = trim((string)($in['motivo'] ?? ''));
        $desfecho   = trim((string)($in['desfecho'] ?? ''));
        $notas      = trim((string)($in['notas'] ?? ''));

        if (!dataVisitaValida($data))                                resp(['ok' => false, 'erro' => 'Data da visita inválida.'], 422);
        if ($motivo === '' || mb_strlen($motivo) > 80)               resp(['ok' => false, 'erro' => 'Informe o motivo da visita.'], 422);
        if (!in_array($desfecho, ['Realizada', 'Recusada', 'Ausente'], true)) resp(['ok' => false, 'erro' => 'Desfecho inválido.'], 422);
        if (mb_strlen($notas) > 5000)                                resp(['ok' => false, 'erro' => 'As anotações estão muito longas.'], 422);

        // a família precisa ser do próprio agente
        $q = $pdo->prepare('SELECT id FROM familias WHERE prontuario = :p AND agente_id = :a');
        $q->execute([':p' => $prontuario, ':a' => $ag['id']]);
        $familiaId = $q->fetchColumn();
        if (!$familiaId) resp(['ok' => false, 'erro' => 'Família não encontrada.'], 404);

        $pdo->prepare('INSERT INTO visitas (agente_id, familia_id, data_visita, motivo, desfecho, notas)
                       VALUES (:a, :f, :d, :m, :s, :n)')
            ->execute([
                ':a' => $ag['id'], ':f' => $familiaId, ':d' => $data, ':m' => $motivo, ':s' => $desfecho,
                ':n' => $notas === '' ? null : $notas,
            ]);
        resp(['ok' => true, 'visitas' => listarVisitas($pdo, $ag['id'])]);
    }

    // ---------- Excluir visita (só as do próprio agente) ----------
    if ($acao === 'excluir') {
        $id = (int)($in['id'] ?? 0);
        $q = $pdo->prepare('DELETE FROM visitas WHERE id = :id AND agente_id = :a');
        $q->execute([':id' => $id, ':a' => $ag['id']]);
        if ($q->rowCount() === 0) resp(['ok' => false, 'erro' => 'Visita não encontrada.'], 404);
        resp(['ok' => true, 'visitas' => listarVisitas($pdo, $ag['id'])]);
    }

    resp(['ok' => false, 'erro' => 'Ação inválida.'], 400);

} catch (Throwable $e) {
    error_log('[ACS Conecta] visitas.php: ' . $e->getMessage());
    resp(['ok' => false, 'erro' => 'Erro ao processar no servidor.'], 500);
}
