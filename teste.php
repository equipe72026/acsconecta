<?php
require_once __DIR__ . '/conexao.php';
echo 'Conectado! Usuários: ' . $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();