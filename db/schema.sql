-- Experience OS 数据库结构
-- 目标库: SQLPub 免费 MySQL 8.4 (cmyshorturl) —— 与库内其他项目共用
-- 隔离约定: 本项目所有表统一使用 `exp_` 前缀,绝不触碰 lyn_/config_/nacos/users 等既有表
-- 字符集: utf8mb4 (支持中文与 emoji)
-- 说明:
--   * 稳定实体用列存储,便于查询/排序/外键约束
--   * 频繁演进的派生画像 (gate/repeatability/replicationMatrix/protocol 等) 整体存 JSON 列 profiles
--   * note_md 预留 markdown 自由正文,供后续文档化扩展
--   * embedding 预留相似聚类向量 (MySQL 8.4 无原生 VECTOR,先以 JSON 数组承载)
--   * 每张核心表都带 extra JSON 列,做前向兼容,避免频繁改表

-- 模式版本 / 迁移记录
CREATE TABLE IF NOT EXISTS exp_schema_meta (
  k          VARCHAR(64) PRIMARY KEY,
  v          VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Experience OS 模式版本/迁移记录';

-- 原始一句话观察
CREATE TABLE IF NOT EXISTS exp_observations (
  id           VARCHAR(40) PRIMARY KEY,
  `text`       TEXT NOT NULL,
  category     VARCHAR(16) NOT NULL,
  tags         JSON NOT NULL,
  summary      TEXT,
  status       VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|success|failed
  location     VARCHAR(128),
  rule_id      VARCHAR(40),
  extra        JSON,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  KEY idx_obs_rule (rule_id),
  KEY idx_obs_category (category),
  KEY idx_obs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='原始一句话观察';

-- 沉淀的经验规则
CREATE TABLE IF NOT EXISTS exp_rules (
  id                    VARCHAR(40) PRIMARY KEY,
  title                 VARCHAR(255) NOT NULL,
  category              VARCHAR(16) NOT NULL,
  conclusion            TEXT NOT NULL,
  recommendation        TEXT NOT NULL,
  conditions            JSON NOT NULL,
  warnings              JSON NOT NULL,
  evidence_ids          JSON NOT NULL,
  reusability           VARCHAR(16) NOT NULL,                 -- high|medium|low|watch
  feedback              VARCHAR(16) NOT NULL DEFAULT 'none',  -- useful|watch|inaccurate|none
  review_status         VARCHAR(16),
  -- 评估摘要(从 profiles 冗余出来,便于直接查询/排序)
  evaluation_verdict    VARCHAR(16),
  evaluation_score      INT,
  evaluation_confidence VARCHAR(16),
  evaluation_trend      VARCHAR(16),
  adoption_decision     VARCHAR(16),
  adoption_reason       TEXT,
  -- 派生复杂画像整体存 JSON: adoptionGate / repeatabilityProfile / sampleIndependenceProfile /
  -- versionCoverageProfile / protocolComplianceProfile / evaluationConsistencyProfile /
  -- evaluationReplicationMatrix / evaluationProtocol / evaluationPlan 等
  profiles              JSON,
  note_md               MEDIUMTEXT,  -- markdown 自由正文(文档化扩展预留)
  embedding             JSON,        -- 相似聚类向量预留(P1)
  revision_version      INT NOT NULL DEFAULT 0,
  extra                 JSON,
  last_evaluated_at     DATETIME,
  location              VARCHAR(128),
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rule_category (category),
  KEY idx_rule_reusability (reusability),
  KEY idx_rule_adoption (adoption_decision),
  KEY idx_rule_score (evaluation_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='沉淀的经验规则';

-- 规则复测记录
CREATE TABLE IF NOT EXISTS exp_evaluations (
  id                     VARCHAR(40) PRIMARY KEY,
  rule_id                VARCHAR(40) NOT NULL,
  outcome                VARCHAR(16) NOT NULL,  -- passed|failed|uncertain
  note                   TEXT,
  source                 VARCHAR(16),           -- manual|recall|plan
  cycle                  VARCHAR(16),           -- fill|maintenance
  rule_version           INT,
  replication_slot_focus VARCHAR(16),           -- confirmation|boundary|contrast|expansion
  observation_id         VARCHAR(40),
  observation_text       TEXT,
  snapshots              JSON,   -- planSnapshot / protocolSnapshot / protocolExecution
  extra                  JSON,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eval_rule (rule_id),
  KEY idx_eval_created (created_at),
  CONSTRAINT fk_eval_rule FOREIGN KEY (rule_id) REFERENCES exp_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='规则复测记录';

-- 规则修订历史(审计)
CREATE TABLE IF NOT EXISTS exp_rule_revisions (
  id           VARCHAR(40) PRIMARY KEY,
  rule_id      VARCHAR(40) NOT NULL,
  draft_id     VARCHAR(40),
  version      INT NOT NULL,
  reason       TEXT,
  prev_state   JSON,   -- previousConclusion/Recommendation/Conditions/Warnings
  new_state    JSON,   -- newConclusion/Recommendation/Conditions/Warnings
  evidence_ids JSON,
  applied_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rev_rule (rule_id),
  CONSTRAINT fk_rev_rule FOREIGN KEY (rule_id) REFERENCES exp_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='规则修订历史(审计)';

-- 规则边界 / 反例目录
CREATE TABLE IF NOT EXISTS exp_boundary_cases (
  id                   VARCHAR(40) PRIMARY KEY,
  rule_id              VARCHAR(40) NOT NULL,
  evaluation_id        VARCHAR(40),
  outcome              VARCHAR(16) NOT NULL,  -- failed|uncertain
  severity             VARCHAR(16) NOT NULL,  -- critical|watch|unknown
  focus                VARCHAR(16),
  scenario             TEXT,
  hypothesis           TEXT,
  suggested_constraint TEXT,
  evidence_status      VARCHAR(16),           -- complete|incomplete
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bound_rule (rule_id),
  CONSTRAINT fk_bound_rule FOREIGN KEY (rule_id) REFERENCES exp_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='规则边界/反例目录';

-- 采用决策时间线(审计)
CREATE TABLE IF NOT EXISTS exp_adoption_events (
  id               VARCHAR(40) PRIMARY KEY,
  rule_id          VARCHAR(40) NOT NULL,
  evaluation_id    VARCHAR(40),
  decision         VARCHAR(16) NOT NULL,  -- adopt|limit|retest|repair|suspend
  reason           TEXT,
  evaluation_count INT,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_adopt_rule (rule_id),
  CONSTRAINT fk_adopt_rule FOREIGN KEY (rule_id) REFERENCES exp_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采用决策时间线(审计)';
