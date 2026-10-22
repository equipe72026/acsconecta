<?php
/**
 * conexao.php — Conexão do ACS Conecta com o MySQL (PDO)
 *
 * Uso em qualquer página/endpoint PHP:
 *     require_once __DIR__ . '/conexao.php';
 *     $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE login = :login');
 *     $stmt->execute([':login' => $login]);
 *
 * IMPORTANTE: sempre use prepared statements (como acima) com dados vindos
 * do formulário, para evitar SQL Injection.
 */

// ---------- Configuração (ajuste para o seu ambiente) ----------
const DB_HOST = 'localhost';
const DB_PORT = 3306;
const DB_NAME = 'acs_conecta';
const DB_USER = 'root';          // em produção, use um usuário próprio com poucas permissões
const DB_PASS = '';              // coloque a senha do MySQL aqui
const DB_CHARSET = 'utf8mb4';

// Fuso horário do PHP e do MySQL alinhados (datas de visitas/consultas)
date_default_timezone_set('America/Sao_Paulo');

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET),
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // erros viram exceções
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,         // resultados como array associativo
            PDO::ATTR_EMULATE_PREPARES   => false,                    // prepared statements reais
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '-03:00'",
        ]
    );
} catch (PDOException $e) {
    // Grava o erro real no log do servidor e mostra mensagem genérica ao usuário
    error_log('[ACS Conecta] Falha na conexão com o banco: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'erro' => 'Não foi possível conectar ao banco de dados.']);
    exit;
}
