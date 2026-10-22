-- ============================================================
--  ACS Conecta — Banco de dados (MySQL 8 / MariaDB 10.5+)
--  Substitui todo o uso de localStorage do sistema.
-- ============================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS acs_conecta
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE acs_conecta;

-- ------------------------------------------------------------
-- USUÁRIOS (login único para admin, gerentes e agentes)
-- Substitui: senhaAdmin, gerentes[].login/senha, agentes[].login/password
-- A senha NUNCA é guardada em texto puro: use password_hash() no PHP.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  login       VARCHAR(50)  NOT NULL,
  senha_hash  VARCHAR(255) NOT NULL,
  perfil      ENUM('admin','gerente','agente') NOT NULL,
  ativo       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_login (login)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- GERENTES (dados pessoais; o admin não precisa de linha aqui)
-- Substitui: localStorage 'gerentes'
-- ------------------------------------------------------------
CREATE TABLE gerentes (
  usuario_id       INT UNSIGNED NOT NULL,
  nome             VARCHAR(120) NOT NULL,
  cpf              CHAR(11)     NOT NULL,
  data_nascimento  DATE         NOT NULL,
  sexo             ENUM('M','F','O') NOT NULL,
  telefone         VARCHAR(20)  NOT NULL,
  cep              CHAR(8)      NOT NULL,
  endereco         VARCHAR(200) NOT NULL,
  numero           VARCHAR(15)  NOT NULL,
  email            VARCHAR(150) NOT NULL,
  PRIMARY KEY (usuario_id),
  UNIQUE KEY uq_gerentes_cpf (cpf),
  CONSTRAINT fk_gerentes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- AGENTES COMUNITÁRIOS DE SAÚDE
-- Substitui: localStorage 'agentes'
-- nome_mae, data_nascimento e cep são as respostas do 2FA.
-- Os contadores familias/visitas/consultas NÃO são colunas:
-- use a view vw_agentes_resumo (sempre corretos, sem dessincronizar).
-- ------------------------------------------------------------
CREATE TABLE agentes (
  usuario_id       INT UNSIGNED NOT NULL,
  nome             VARCHAR(120) NOT NULL,
  nome_mae         VARCHAR(60)  NOT NULL,
  cpf              CHAR(11)     NOT NULL,
  data_nascimento  DATE         NOT NULL,
  sexo             ENUM('M','F','O') NOT NULL,
  telefone         VARCHAR(20)  NOT NULL,
  cep              CHAR(8)      NOT NULL,
  endereco         VARCHAR(200) NOT NULL,
  numero           VARCHAR(15)  NOT NULL,
  email            VARCHAR(150) NOT NULL,
  unidade          VARCHAR(120) NOT NULL DEFAULT 'CMS Adão Pereira Nunes',
  equipe           VARCHAR(60)  NOT NULL,
  area             CHAR(2)      NOT NULL,
  PRIMARY KEY (usuario_id),
  UNIQUE KEY uq_agentes_cpf (cpf),
  KEY idx_agentes_area (area),
  CONSTRAINT fk_agentes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- FAMÍLIAS (ficha territorial)
-- Substitui: localStorage 'familias'
-- prontuario = 'AA.NNN' (ex.: 01.007), montado pelo PHP a partir de
-- area + sequencial (sprintf('%s.%03d', $area, $seq)).
-- O sequencial deve usar MAX()+1 dentro de uma transação (e não COUNT()+1,
-- que gera prontuários repetidos depois de excluir uma família).
-- UNIQUE(area, sequencial) impede duplicatas mesmo com acessos simultâneos.
-- ------------------------------------------------------------
CREATE TABLE familias (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agente_id    INT UNSIGNED NOT NULL,
  area         CHAR(2)      NOT NULL,
  sequencial   SMALLINT UNSIGNED NOT NULL,
  prontuario   VARCHAR(8)   NOT NULL,
  cep          CHAR(8)      NOT NULL,
  logradouro   VARCHAR(200) NOT NULL,
  num_casa     VARCHAR(15)  NOT NULL,
  complemento  VARCHAR(100) NULL,
  bairro       VARCHAR(100) NOT NULL,
  cidade       VARCHAR(100) NOT NULL,
  uf           CHAR(2)      NOT NULL,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_familias_area_seq (area, sequencial),
  UNIQUE KEY uq_familias_prontuario (prontuario),
  KEY idx_familias_agente (agente_id),
  CONSTRAINT fk_familias_agente FOREIGN KEY (agente_id)
    REFERENCES agentes (usuario_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MEMBROS DA FAMÍLIA
-- Substitui: familias[].membros[]
-- eh_responsavel = o 1º membro do formulário (antes: campo 'responsavel').
-- ------------------------------------------------------------
CREATE TABLE membros (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  familia_id        INT UNSIGNED NOT NULL,
  eh_responsavel    TINYINT(1)   NOT NULL DEFAULT 0,
  nome              VARCHAR(120) NOT NULL,
  data_nascimento   DATE         NOT NULL,
  cpf               CHAR(11)     NOT NULL,
  cartao_sus        VARCHAR(15)  NOT NULL,
  sexo              ENUM('M','F','O') NOT NULL,
  telefone          VARCHAR(20)  NULL,
  hipertenso        TINYINT(1)   NOT NULL DEFAULT 0,
  diabetico         TINYINT(1)   NOT NULL DEFAULT 0,
  gestante          TINYINT(1)   NOT NULL DEFAULT 0,
  vacina_atrasada   TINYINT(1)   NOT NULL DEFAULT 0,
  tuberculose       TINYINT(1)   NOT NULL DEFAULT 0,
  hanseniase        TINYINT(1)   NOT NULL DEFAULT 0,
  deficiente_fisico TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_membros_familia (familia_id),
  KEY idx_membros_cpf (cpf),
  KEY idx_membros_sus (cartao_sus),
  CONSTRAINT fk_membros_familia FOREIGN KEY (familia_id)
    REFERENCES familias (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- VISITAS DOMICILIARES
-- Substitui: localStorage 'visitas_historico'
-- Excluir a família apaga as visitas (como o sistema já faz).
-- ------------------------------------------------------------
CREATE TABLE visitas (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agente_id    INT UNSIGNED NOT NULL,
  familia_id   INT UNSIGNED NOT NULL,
  data_visita  DATE         NOT NULL,
  motivo       VARCHAR(80)  NOT NULL,
  desfecho     ENUM('Realizada','Recusada','Ausente') NOT NULL DEFAULT 'Realizada',
  notas        TEXT         NULL,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visitas_agente_data (agente_id, data_visita),
  KEY idx_visitas_familia (familia_id),
  CONSTRAINT fk_visitas_agente FOREIGN KEY (agente_id)
    REFERENCES agentes (usuario_id) ON DELETE RESTRICT,
  CONSTRAINT fk_visitas_familia FOREIGN KEY (familia_id)
    REFERENCES familias (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CONSULTAS (agenda + histórico na mesma tabela)
-- Substitui: 'consultas_agenda' e 'consultas_historico'
--   • arquivado_em IS NULL     -> consulta atual (agenda)
--   • arquivado_em IS NOT NULL -> histórico (substituída por reagendamento)
-- Só pode existir UMA consulta atual por paciente (índice uq_consulta_atual).
-- Cancelar = DELETE da linha atual (igual ao comportamento atual).
-- ------------------------------------------------------------
CREATE TABLE consultas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agente_id     INT UNSIGNED NOT NULL,
  membro_id     INT UNSIGNED NOT NULL,
  status        ENUM('agendado','agendar') NOT NULL DEFAULT 'agendar',
  data_consulta DATE         NULL,
  hora          TIME         NULL,
  tipo          VARCHAR(60)  NOT NULL,
  local         VARCHAR(120) NULL,
  obs           TEXT         NULL,
  presenca      ENUM('compareceu','faltou') NULL,
  presenca_em   DATETIME     NULL,
  avisado       TINYINT(1)   NOT NULL DEFAULT 0,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  arquivado_em  DATETIME     NULL,
  atual         TINYINT(1) GENERATED ALWAYS AS (IF(arquivado_em IS NULL, 1, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consulta_atual (membro_id, atual),
  KEY idx_consultas_agente_data (agente_id, data_consulta),
  CONSTRAINT fk_consultas_agente FOREIGN KEY (agente_id)
    REFERENCES agentes (usuario_id) ON DELETE RESTRICT,
  CONSTRAINT fk_consultas_membro FOREIGN KEY (membro_id)
    REFERENCES membros (id) ON DELETE CASCADE,
  CONSTRAINT ck_consulta_agendada CHECK (status <> 'agendado' OR data_consulta IS NOT NULL)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- LOG DE AUTENTICAÇÃO (2FA)
-- Substitui: localStorage 'logs_autenticacao'
-- Guarda cópia de nome/cpf/login para o log sobreviver à exclusão do agente.
-- ------------------------------------------------------------
CREATE TABLE logs_autenticacao (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NULL,
  nome        VARCHAR(120) NOT NULL,
  cpf         CHAR(11)     NOT NULL,
  login       VARCHAR(50)  NOT NULL,
  fator_2fa   VARCHAR(40)  NOT NULL,
  ip          VARCHAR(45)  NULL,
  data_hora   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_data (data_hora),
  CONSTRAINT fk_logs_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
--  VIEWS
-- ============================================================

-- Totais por agente (antes: agentes[].familias / visitas / consultas)
CREATE OR REPLACE VIEW vw_agentes_resumo AS
SELECT
  a.usuario_id,
  a.nome,
  u.login,
  a.equipe,
  a.area,
  (SELECT COUNT(*) FROM familias  f WHERE f.agente_id = a.usuario_id) AS familias,
  (SELECT COUNT(*) FROM visitas   v WHERE v.agente_id = a.usuario_id) AS visitas,
  (SELECT COUNT(*) FROM consultas c WHERE c.agente_id = a.usuario_id
      AND c.atual = 1 AND c.status = 'agendado')                      AS consultas
FROM agentes a
JOIN usuarios u ON u.id = a.usuario_id;

-- Família + nome do responsável (antes: familias[].responsavel)
CREATE OR REPLACE VIEW vw_familias AS
SELECT
  f.*,
  m.nome AS responsavel,
  (SELECT COUNT(*) FROM membros x WHERE x.familia_id = f.id) AS total_membros
FROM familias f
LEFT JOIN membros m ON m.familia_id = f.id AND m.eh_responsavel = 1;

-- ============================================================
--  CONTA ADMIN INICIAL
--  1) Gere o hash:  php -r "echo password_hash('admin123', PASSWORD_DEFAULT);"
--  2) Cole abaixo no lugar de COLE_O_HASH_AQUI e execute.
--  (Não reutilize a senha '123' do protótipo.)
-- ============================================================
-- INSERT INTO usuarios (login, senha_hash, perfil)
-- VALUES ('admin', '$2y$10$UMWicK5p7sKlx76Xl13OB.4vi0pK0ZijSueKNmegnmHKAoE7TZc.u', 'admin');
