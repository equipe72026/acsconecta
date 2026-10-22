-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 14/10/2026 às 05:40
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `acs_conecta`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `agentes`
--

CREATE TABLE `agentes` (
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(120) NOT NULL,
  `nome_mae` varchar(60) NOT NULL,
  `cpf` char(11) NOT NULL,
  `data_nascimento` date NOT NULL,
  `sexo` enum('M','F','O') NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `cep` char(8) NOT NULL,
  `endereco` varchar(200) NOT NULL,
  `numero` varchar(15) NOT NULL,
  `email` varchar(150) NOT NULL,
  `unidade` varchar(120) NOT NULL DEFAULT 'CMS Adão Pereira Nunes',
  `equipe` varchar(60) NOT NULL,
  `area` char(2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `agentes`
--

INSERT INTO `agentes` (`usuario_id`, `nome`, `nome_mae`, `cpf`, `data_nascimento`, `sexo`, `telefone`, `cep`, `endereco`, `numero`, `email`, `unidade`, `equipe`, `area`) VALUES
(6, 'Thiago Chagas da Conceição', 'Tereza', '12970579707', '1989-04-25', 'M', '(21) 97522-3875', '23066107', 'Estrada do Campinho, Paciência, Rio de Janeiro, RJ', '5935', 'thiagochagasdc@gmail.com', 'CMS Adão Pereira Nunes', 'Vitória de Paz', '01');

-- --------------------------------------------------------

--
-- Estrutura para tabela `consultas`
--

CREATE TABLE `consultas` (
  `id` int(10) UNSIGNED NOT NULL,
  `agente_id` int(10) UNSIGNED NOT NULL,
  `membro_id` int(10) UNSIGNED NOT NULL,
  `status` enum('agendado','agendar') NOT NULL DEFAULT 'agendar',
  `data_consulta` date DEFAULT NULL,
  `hora` time DEFAULT NULL,
  `tipo` varchar(60) NOT NULL,
  `local` varchar(120) DEFAULT NULL,
  `obs` text DEFAULT NULL,
  `presenca` enum('compareceu','faltou') DEFAULT NULL,
  `presenca_em` datetime DEFAULT NULL,
  `avisado` tinyint(1) NOT NULL DEFAULT 0,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `arquivado_em` datetime DEFAULT NULL,
  `atual` tinyint(1) GENERATED ALWAYS AS (if(`arquivado_em` is null,1,NULL)) STORED
) ;

--
-- Despejando dados para a tabela `consultas`
--

INSERT INTO `consultas` (`id`, `agente_id`, `membro_id`, `status`, `data_consulta`, `hora`, `tipo`, `local`, `obs`, `presenca`, `presenca_em`, `avisado`, `criado_em`, `arquivado_em`) VALUES
(1, 6, 1, 'agendado', '2026-10-15', '11:30:00', 'Enfermagem', 'CMS Adão Pereira Nunes', 'Consulta para renovação de receita', NULL, NULL, 0, '2026-10-14 00:33:07', NULL);

-- --------------------------------------------------------

--
-- Estrutura para tabela `familias`
--

CREATE TABLE `familias` (
  `id` int(10) UNSIGNED NOT NULL,
  `agente_id` int(10) UNSIGNED NOT NULL,
  `area` char(2) NOT NULL,
  `sequencial` smallint(5) UNSIGNED NOT NULL,
  `prontuario` varchar(8) NOT NULL,
  `cep` char(8) NOT NULL,
  `logradouro` varchar(200) NOT NULL,
  `num_casa` varchar(15) NOT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) NOT NULL,
  `cidade` varchar(100) NOT NULL,
  `uf` char(2) NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `familias`
--

INSERT INTO `familias` (`id`, `agente_id`, `area`, `sequencial`, `prontuario`, `cep`, `logradouro`, `num_casa`, `complemento`, `bairro`, `cidade`, `uf`, `criado_em`, `atualizado_em`) VALUES
(1, 6, '01', 1, '01.001', '23580550', 'Rua 6', '01', 'Vila Alzira 1', 'Paciência', 'Rio de Janeiro', 'RJ', '2026-10-14 00:31:08', '2026-10-14 00:31:08');

-- --------------------------------------------------------

--
-- Estrutura para tabela `gerentes`
--

CREATE TABLE `gerentes` (
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `nome` varchar(120) NOT NULL,
  `cpf` char(11) NOT NULL,
  `data_nascimento` date NOT NULL,
  `sexo` enum('M','F','O') NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `cep` char(8) NOT NULL,
  `endereco` varchar(200) NOT NULL,
  `numero` varchar(15) NOT NULL,
  `email` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `gerentes`
--

INSERT INTO `gerentes` (`usuario_id`, `nome`, `cpf`, `data_nascimento`, `sexo`, `telefone`, `cep`, `endereco`, `numero`, `email`) VALUES
(5, 'Gerente Teste de Sistema', '09181238120', '1989-04-25', 'F', '(32) 13810-9381', '23066000', 'Rua Soldado Ramis Mendes, Paciência, Rio de Janeiro, RJ', '01', 'gerente@gmail.com');

-- --------------------------------------------------------

--
-- Estrutura para tabela `logs_autenticacao`
--

CREATE TABLE `logs_autenticacao` (
  `id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL,
  `nome` varchar(120) NOT NULL,
  `cpf` char(11) NOT NULL,
  `login` varchar(50) NOT NULL,
  `fator_2fa` varchar(40) NOT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `data_hora` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `logs_autenticacao`
--

INSERT INTO `logs_autenticacao` (`id`, `usuario_id`, `nome`, `cpf`, `login`, `fator_2fa`, `ip`, `data_hora`) VALUES
(1, 6, 'Thiago Chagas da Conceição', '12970579707', 'thiago', 'Nome da mãe', '::1', '2026-10-14 00:00:49'),
(2, 6, 'Thiago Chagas da Conceição', '12970579707', 'thiago', 'Nome da mãe', '::1', '2026-10-14 00:07:52');

-- --------------------------------------------------------

--
-- Estrutura para tabela `membros`
--

CREATE TABLE `membros` (
  `id` int(10) UNSIGNED NOT NULL,
  `familia_id` int(10) UNSIGNED NOT NULL,
  `eh_responsavel` tinyint(1) NOT NULL DEFAULT 0,
  `nome` varchar(120) NOT NULL,
  `data_nascimento` date NOT NULL,
  `cpf` char(11) NOT NULL,
  `cartao_sus` varchar(15) NOT NULL,
  `sexo` enum('M','F','O') NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `hipertenso` tinyint(1) NOT NULL DEFAULT 0,
  `diabetico` tinyint(1) NOT NULL DEFAULT 0,
  `gestante` tinyint(1) NOT NULL DEFAULT 0,
  `vacina_atrasada` tinyint(1) NOT NULL DEFAULT 0,
  `tuberculose` tinyint(1) NOT NULL DEFAULT 0,
  `hanseniase` tinyint(1) NOT NULL DEFAULT 0,
  `deficiente_fisico` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `membros`
--

INSERT INTO `membros` (`id`, `familia_id`, `eh_responsavel`, `nome`, `data_nascimento`, `cpf`, `cartao_sus`, `sexo`, `telefone`, `hipertenso`, `diabetico`, `gestante`, `vacina_atrasada`, `tuberculose`, `hanseniase`, `deficiente_fisico`) VALUES
(1, 1, 1, 'Claudia Regina', '1969-08-09', '29381230123', '098098312038103', 'F', '(21) 40938-4098', 1, 1, 0, 0, 0, 0, 0),
(2, 1, 0, 'Pedro Henrique', '2010-12-10', '09381029381', '309812098130921', 'M', '(21) 89384-3948', 0, 0, 0, 1, 0, 0, 0);

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(10) UNSIGNED NOT NULL,
  `login` varchar(50) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `perfil` enum('admin','gerente','agente') NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT 1,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id`, `login`, `senha_hash`, `perfil`, `ativo`, `criado_em`) VALUES
(4, 'admin', '$2y$10$UMWicK5p7sKlx76Xl13OB.4vi0pK0ZijSueKNmegnmHKAoE7TZc.u', 'admin', 1, '2026-10-13 13:34:17'),
(5, 'gerente', '$2y$10$JjQOJHUxwOg4hNOY8b/rH.jC47gfW8d4dB6CE89/rw3WL16yUlKPG', 'gerente', 1, '2026-10-13 23:47:33'),
(6, 'thiago', '$2y$10$ZcsDrUgQmu/tx1v4PyTt/.m3jxny38cun3AQ7u6R8fwKqaaWd4Y3i', 'agente', 1, '2026-10-14 00:00:05');

-- --------------------------------------------------------

--
-- Estrutura para tabela `visitas`
--

CREATE TABLE `visitas` (
  `id` int(10) UNSIGNED NOT NULL,
  `agente_id` int(10) UNSIGNED NOT NULL,
  `familia_id` int(10) UNSIGNED NOT NULL,
  `data_visita` date NOT NULL,
  `motivo` varchar(80) NOT NULL,
  `desfecho` enum('Realizada','Recusada','Ausente') NOT NULL DEFAULT 'Realizada',
  `notas` text DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `visitas`
--

INSERT INTO `visitas` (`id`, `agente_id`, `familia_id`, `data_visita`, `motivo`, `desfecho`, `notas`, `criado_em`) VALUES
(1, 6, 1, '2026-10-14', 'Acompanhamento de Rotina', 'Realizada', 'Visita para agendamento de consulta', '2026-10-14 00:32:22');

-- --------------------------------------------------------

--
-- Estrutura stand-in para view `vw_agentes_resumo`
-- (Veja abaixo para a visão atual)
--
CREATE TABLE `vw_agentes_resumo` (
`usuario_id` int(10) unsigned
,`nome` varchar(120)
,`login` varchar(50)
,`equipe` varchar(60)
,`area` char(2)
,`familias` bigint(21)
,`visitas` bigint(21)
,`consultas` bigint(21)
);

-- --------------------------------------------------------

--
-- Estrutura stand-in para view `vw_familias`
-- (Veja abaixo para a visão atual)
--
CREATE TABLE `vw_familias` (
`id` int(10) unsigned
,`agente_id` int(10) unsigned
,`area` char(2)
,`sequencial` smallint(5) unsigned
,`prontuario` varchar(8)
,`cep` char(8)
,`logradouro` varchar(200)
,`num_casa` varchar(15)
,`complemento` varchar(100)
,`bairro` varchar(100)
,`cidade` varchar(100)
,`uf` char(2)
,`criado_em` datetime
,`atualizado_em` datetime
,`responsavel` varchar(120)
,`total_membros` bigint(21)
);

-- --------------------------------------------------------

--
-- Estrutura para view `vw_agentes_resumo`
--
DROP TABLE IF EXISTS `vw_agentes_resumo`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_agentes_resumo`  AS SELECT `a`.`usuario_id` AS `usuario_id`, `a`.`nome` AS `nome`, `u`.`login` AS `login`, `a`.`equipe` AS `equipe`, `a`.`area` AS `area`, (select count(0) from `familias` `f` where `f`.`agente_id` = `a`.`usuario_id`) AS `familias`, (select count(0) from `visitas` `v` where `v`.`agente_id` = `a`.`usuario_id`) AS `visitas`, (select count(0) from `consultas` `c` where `c`.`agente_id` = `a`.`usuario_id` and `c`.`atual` = 1 and `c`.`status` = 'agendado') AS `consultas` FROM (`agentes` `a` join `usuarios` `u` on(`u`.`id` = `a`.`usuario_id`)) ;

-- --------------------------------------------------------

--
-- Estrutura para view `vw_familias`
--
DROP TABLE IF EXISTS `vw_familias`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_familias`  AS SELECT `f`.`id` AS `id`, `f`.`agente_id` AS `agente_id`, `f`.`area` AS `area`, `f`.`sequencial` AS `sequencial`, `f`.`prontuario` AS `prontuario`, `f`.`cep` AS `cep`, `f`.`logradouro` AS `logradouro`, `f`.`num_casa` AS `num_casa`, `f`.`complemento` AS `complemento`, `f`.`bairro` AS `bairro`, `f`.`cidade` AS `cidade`, `f`.`uf` AS `uf`, `f`.`criado_em` AS `criado_em`, `f`.`atualizado_em` AS `atualizado_em`, `m`.`nome` AS `responsavel`, (select count(0) from `membros` `x` where `x`.`familia_id` = `f`.`id`) AS `total_membros` FROM (`familias` `f` left join `membros` `m` on(`m`.`familia_id` = `f`.`id` and `m`.`eh_responsavel` = 1)) ;

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `agentes`
--
ALTER TABLE `agentes`
  ADD PRIMARY KEY (`usuario_id`),
  ADD UNIQUE KEY `uq_agentes_cpf` (`cpf`),
  ADD KEY `idx_agentes_area` (`area`);

--
-- Índices de tabela `consultas`
--
ALTER TABLE `consultas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_consulta_atual` (`membro_id`,`atual`),
  ADD KEY `idx_consultas_agente_data` (`agente_id`,`data_consulta`);

--
-- Índices de tabela `familias`
--
ALTER TABLE `familias`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_familias_area_seq` (`area`,`sequencial`),
  ADD UNIQUE KEY `uq_familias_prontuario` (`prontuario`),
  ADD KEY `idx_familias_agente` (`agente_id`);

--
-- Índices de tabela `gerentes`
--
ALTER TABLE `gerentes`
  ADD PRIMARY KEY (`usuario_id`),
  ADD UNIQUE KEY `uq_gerentes_cpf` (`cpf`);

--
-- Índices de tabela `logs_autenticacao`
--
ALTER TABLE `logs_autenticacao`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_logs_data` (`data_hora`),
  ADD KEY `fk_logs_usuario` (`usuario_id`);

--
-- Índices de tabela `membros`
--
ALTER TABLE `membros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_membros_familia` (`familia_id`),
  ADD KEY `idx_membros_cpf` (`cpf`),
  ADD KEY `idx_membros_sus` (`cartao_sus`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_login` (`login`);

--
-- Índices de tabela `visitas`
--
ALTER TABLE `visitas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_visitas_agente_data` (`agente_id`,`data_visita`),
  ADD KEY `idx_visitas_familia` (`familia_id`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `consultas`
--
ALTER TABLE `consultas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de tabela `familias`
--
ALTER TABLE `familias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `logs_autenticacao`
--
ALTER TABLE `logs_autenticacao`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `membros`
--
ALTER TABLE `membros`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de tabela `visitas`
--
ALTER TABLE `visitas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `agentes`
--
ALTER TABLE `agentes`
  ADD CONSTRAINT `fk_agentes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `consultas`
--
ALTER TABLE `consultas`
  ADD CONSTRAINT `fk_consultas_agente` FOREIGN KEY (`agente_id`) REFERENCES `agentes` (`usuario_id`),
  ADD CONSTRAINT `fk_consultas_membro` FOREIGN KEY (`membro_id`) REFERENCES `membros` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `familias`
--
ALTER TABLE `familias`
  ADD CONSTRAINT `fk_familias_agente` FOREIGN KEY (`agente_id`) REFERENCES `agentes` (`usuario_id`);

--
-- Restrições para tabelas `gerentes`
--
ALTER TABLE `gerentes`
  ADD CONSTRAINT `fk_gerentes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `logs_autenticacao`
--
ALTER TABLE `logs_autenticacao`
  ADD CONSTRAINT `fk_logs_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;

--
-- Restrições para tabelas `membros`
--
ALTER TABLE `membros`
  ADD CONSTRAINT `fk_membros_familia` FOREIGN KEY (`familia_id`) REFERENCES `familias` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `visitas`
--
ALTER TABLE `visitas`
  ADD CONSTRAINT `fk_visitas_agente` FOREIGN KEY (`agente_id`) REFERENCES `agentes` (`usuario_id`),
  ADD CONSTRAINT `fk_visitas_familia` FOREIGN KEY (`familia_id`) REFERENCES `familias` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
