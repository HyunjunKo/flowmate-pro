-- ============================================================
-- FlowMate Pro — Production Database Schema
-- PostgreSQL + Supabase
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- 한국어 검색용


-- ============================================================
-- 1. USERS & ORGANIZATIONS
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    locale          TEXT DEFAULT 'ko',           -- 기본 한국어
    timezone        TEXT DEFAULT 'Asia/Seoul',
    plan_id         UUID,                         -- FK → subscription_plans
    is_verified     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    owner_id        UUID NOT NULL REFERENCES users(id),
    plan_id         UUID,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    invited_by      UUID REFERENCES users(id),
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    device_info     JSONB,                        -- 브라우저, OS 등
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 2. BILLING & SUBSCRIPTIONS
-- ============================================================

CREATE TABLE subscription_plans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT NOT NULL,        -- 'free', 'starter', 'pro', 'enterprise'
    display_name            TEXT NOT NULL,
    price_monthly_krw       INTEGER DEFAULT 0,
    price_yearly_krw        INTEGER DEFAULT 0,
    max_workflows           INTEGER DEFAULT 5,
    max_executions_per_month INTEGER DEFAULT 100,
    max_nodes_per_workflow  INTEGER DEFAULT 10,
    max_integrations        INTEGER DEFAULT 3,
    max_team_members        INTEGER DEFAULT 1,
    has_ai_recommend        BOOLEAN DEFAULT FALSE,
    has_priority_support    BOOLEAN DEFAULT FALSE,
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES users(id),
    org_id              UUID REFERENCES organizations(id),
    plan_id             UUID NOT NULL REFERENCES subscription_plans(id),
    status              TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    payment_provider    TEXT CHECK (payment_provider IN ('toss', 'kakao_pay', 'card', 'none')),
    payment_key         TEXT,                     -- 결제사 구독 키
    current_period_start TIMESTAMPTZ,
    current_period_end  TIMESTAMPTZ,
    canceled_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (user_id IS NOT NULL OR org_id IS NOT NULL)
);

CREATE TABLE payment_history (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id     UUID NOT NULL REFERENCES user_subscriptions(id),
    amount_krw          INTEGER NOT NULL,
    status              TEXT CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    payment_provider    TEXT,
    payment_key         TEXT,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 3. INTEGRATION PROVIDERS (시스템 레벨 — 카탈로그)
-- ============================================================

CREATE TABLE integration_providers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key                 TEXT UNIQUE NOT NULL,     -- 'kakao', 'naver', 'gmail', 'slack' 등
    display_name        TEXT NOT NULL,
    description_ko      TEXT,
    icon_url            TEXT,
    category            TEXT CHECK (category IN (
                            'messaging', 'email', 'calendar', 'storage',
                            'social', 'ecommerce', 'productivity', 'custom'
                        )),
    auth_type           TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key', 'basic', 'none')),
    oauth_config        JSONB,                    -- client_id, scope, endpoints 등 (암호화)
    is_korean_service   BOOLEAN DEFAULT FALSE,
    is_available        BOOLEAN DEFAULT TRUE,
    required_plan       TEXT DEFAULT 'free',
    docs_url            TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_integrations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id             UUID NOT NULL REFERENCES integration_providers(id),
    display_name            TEXT,                 -- 사용자가 이름 지정 가능 ("회사 Gmail")
    status                  TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    scopes                  TEXT[],               -- 허용된 scope 목록
    access_token_enc        TEXT,                 -- pgcrypto로 암호화
    refresh_token_enc       TEXT,
    token_expires_at        TIMESTAMPTZ,
    external_account_id     TEXT,                 -- 연결된 외부 계정 ID
    external_account_email  TEXT,
    metadata                JSONB,                -- 추가 정보 (프로필 등)
    last_used_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider_id, external_account_id)
);

CREATE TABLE oauth_states (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES integration_providers(id),
    state_token TEXT UNIQUE NOT NULL,
    code_verifier TEXT,                           -- PKCE
    redirect_uri TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 4. NODE DEFINITIONS (사용 가능한 노드 카탈로그)
-- ============================================================

CREATE TABLE node_definitions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key                 TEXT UNIQUE NOT NULL,     -- 'kakao.send_message', 'gmail.send_email'
    provider_id         UUID REFERENCES integration_providers(id),
    display_name_ko     TEXT NOT NULL,
    display_name_en     TEXT,
    description_ko      TEXT,
    icon_url            TEXT,
    category            TEXT,
    node_type           TEXT NOT NULL CHECK (node_type IN (
                            'trigger',    -- 시작 노드
                            'action',     -- 실행 노드
                            'condition',  -- 분기 노드
                            'transform',  -- 데이터 변환
                            'delay',      -- 지연
                            'loop',       -- 반복
                            'ai'          -- AI 처리
                        )),
    input_schema        JSONB NOT NULL,           -- 입력 파라미터 JSON Schema
    output_schema       JSONB NOT NULL,           -- 출력 데이터 JSON Schema
    ui_config           JSONB,                    -- 비개발자용 UI 힌트, 레이블 등
    required_integration TEXT,                   -- 필요한 provider key
    required_plan       TEXT DEFAULT 'free',
    is_available        BOOLEAN DEFAULT TRUE,
    version             TEXT DEFAULT '1.0.0',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 5. WORKFLOWS
-- ============================================================

CREATE TABLE workflows (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id              UUID REFERENCES organizations(id),
    name                TEXT NOT NULL,
    description         TEXT,
    tags                TEXT[],
    status              TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    is_template         BOOLEAN DEFAULT FALSE,
    template_id         UUID REFERENCES workflows(id),  -- 템플릿에서 복사된 경우
    current_version_id  UUID,                            -- FK → workflow_versions
    folder_id           UUID,                            -- FK → workflow_folders
    icon                TEXT,
    color               TEXT,
    last_run_at         TIMESTAMPTZ,
    total_runs          INTEGER DEFAULT 0,
    success_runs        INTEGER DEFAULT 0,
    fail_runs           INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    nodes           JSONB NOT NULL,               -- [{id, type, position, data}, ...]
    edges           JSONB NOT NULL,               -- [{id, source, target, ...}, ...]
    variables       JSONB DEFAULT '{}',           -- 워크플로우 전역 변수
    created_by      UUID REFERENCES users(id),
    change_summary  TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workflow_id, version_number)
);

CREATE TABLE workflow_folders (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    org_id      UUID REFERENCES organizations(id),
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES workflow_folders(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- workflow_versions FK 추가
ALTER TABLE workflows ADD CONSTRAINT fk_current_version
    FOREIGN KEY (current_version_id) REFERENCES workflow_versions(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE workflows ADD CONSTRAINT fk_folder
    FOREIGN KEY (folder_id) REFERENCES workflow_folders(id);


-- ============================================================
-- 6. TRIGGERS (워크플로우 실행 조건)
-- ============================================================

CREATE TABLE workflow_triggers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id         UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    trigger_type        TEXT NOT NULL CHECK (trigger_type IN (
                            'manual',       -- 수동 실행
                            'schedule',     -- 정해진 시간
                            'webhook',      -- 외부 웹훅 (내부적으로 관리)
                            'event',        -- 연동 서비스 이벤트 (카카오 메시지 수신 등)
                            'form'          -- 폼 제출
                        )),
    is_active           BOOLEAN DEFAULT TRUE,
    -- schedule 전용
    cron_expression     TEXT,
    timezone            TEXT DEFAULT 'Asia/Seoul',
    next_run_at         TIMESTAMPTZ,
    -- webhook 전용 (사용자에게 URL만 보여줌 — 내부 처리)
    webhook_secret      TEXT,
    -- event 전용
    provider_id         UUID REFERENCES integration_providers(id),
    event_type          TEXT,
    event_filter        JSONB,
    last_triggered_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_endpoints (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_id      UUID NOT NULL REFERENCES workflow_triggers(id) ON DELETE CASCADE,
    public_path     TEXT UNIQUE NOT NULL,         -- /wh/{uuid} 형태
    secret_hash     TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    last_received_at TIMESTAMPTZ,
    total_received  INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 7. EXECUTIONS (실행 엔진)
-- ============================================================

CREATE TABLE executions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id         UUID NOT NULL REFERENCES workflows(id),
    workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id),
    trigger_id          UUID REFERENCES workflow_triggers(id),
    triggered_by        UUID REFERENCES users(id),  -- 수동 실행 시
    trigger_type        TEXT,
    status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
                            'queued', 'running', 'success', 'failed',
                            'canceled', 'timeout', 'partial_success'
                        )),
    trigger_data        JSONB,                    -- 트리거 입력값
    output_data         JSONB,                    -- 최종 출력값
    error_message       TEXT,
    error_node_id       TEXT,
    queued_at           TIMESTAMPTZ DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    duration_ms         INTEGER,
    nodes_total         INTEGER DEFAULT 0,
    nodes_success       INTEGER DEFAULT 0,
    nodes_failed        INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE execution_node_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    node_id         TEXT NOT NULL,               -- workflow_versions.nodes 내 ID
    node_key        TEXT NOT NULL,               -- node_definitions.key
    status          TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
    input_data      JSONB,
    output_data     JSONB,
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE execution_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES executions(id),
    priority        INTEGER DEFAULT 5,           -- 낮을수록 높은 우선순위
    attempts        INTEGER DEFAULT 0,
    max_attempts    INTEGER DEFAULT 3,
    scheduled_at    TIMESTAMPTZ DEFAULT NOW(),
    locked_at       TIMESTAMPTZ,
    locked_by       TEXT,                        -- worker ID
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 8. TEMPLATES (추천 워크플로우)
-- ============================================================

CREATE TABLE workflow_templates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id         UUID NOT NULL REFERENCES workflows(id),
    title_ko            TEXT NOT NULL,
    title_en            TEXT,
    description_ko      TEXT,
    category            TEXT,
    tags                TEXT[],
    thumbnail_url       TEXT,
    difficulty          TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    required_providers  TEXT[],                  -- ['kakao', 'gmail']
    use_count           INTEGER DEFAULT 0,
    rating_avg          NUMERIC(3,2),
    rating_count        INTEGER DEFAULT 0,
    is_featured         BOOLEAN DEFAULT FALSE,
    is_official         BOOLEAN DEFAULT FALSE,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id     UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_id, user_id)
);


-- ============================================================
-- 9. AI RECOMMENDATIONS
-- ============================================================

CREATE TABLE ai_recommendations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id),
    recommendation_type TEXT CHECK (recommendation_type IN (
                            'new_workflow',    -- 새 워크플로우 추천
                            'next_node',       -- 다음 노드 추천
                            'optimization',    -- 기존 워크플로우 개선
                            'template'         -- 템플릿 추천
                        )),
    context_data        JSONB,                   -- 추천 생성 시 사용된 컨텍스트
    suggestion          JSONB NOT NULL,          -- 추천 내용
    was_accepted        BOOLEAN,
    accepted_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE notification_settings (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_on_success            BOOLEAN DEFAULT FALSE,
    email_on_failure            BOOLEAN DEFAULT TRUE,
    kakao_on_failure            BOOLEAN DEFAULT FALSE,  -- 카카오 알림톡
    push_on_failure             BOOLEAN DEFAULT TRUE,
    weekly_summary              BOOLEAN DEFAULT TRUE,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN (
                        'execution_success', 'execution_failed',
                        'integration_expired', 'plan_limit_warning',
                        'team_invite', 'system'
                    )),
    title           TEXT NOT NULL,
    body            TEXT,
    data            JSONB,
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 11. AUDIT LOGS & SECURITY
-- ============================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    org_id          UUID REFERENCES organizations(id),
    action          TEXT NOT NULL,               -- 'workflow.create', 'integration.connect' 등
    resource_type   TEXT,
    resource_id     UUID,
    old_value       JSONB,
    new_value       JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    key_hash        TEXT UNIQUE NOT NULL,
    key_prefix      TEXT NOT NULL,               -- 'fm_live_xxxx...' 형태로 표시용
    scopes          TEXT[],
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 12. USAGE METRICS (요금제 한도 체크)
-- ============================================================

CREATE TABLE usage_metrics (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id),
    org_id                  UUID REFERENCES organizations(id),
    period_start            DATE NOT NULL,
    period_end              DATE NOT NULL,
    executions_count        INTEGER DEFAULT 0,
    executions_success      INTEGER DEFAULT 0,
    executions_failed       INTEGER DEFAULT 0,
    active_workflows_count  INTEGER DEFAULT 0,
    ai_requests_count       INTEGER DEFAULT 0,
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_start)
);


-- ============================================================
-- INDEXES
-- ============================================================

-- users
CREATE INDEX idx_users_email ON users(email);

-- workflows
CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_tags ON workflows USING GIN(tags);

-- executions
CREATE INDEX idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_created_at ON executions(created_at DESC);

-- execution_node_logs
CREATE INDEX idx_exec_node_logs_execution_id ON execution_node_logs(execution_id);

-- execution_queue
CREATE INDEX idx_exec_queue_scheduled ON execution_queue(scheduled_at) WHERE locked_at IS NULL;

-- notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;

-- audit_logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- template 검색
CREATE INDEX idx_templates_tags ON workflow_templates USING GIN(tags);
CREATE INDEX idx_node_def_key ON node_definitions(key);
CREATE INDEX idx_node_def_provider ON node_definitions(provider_id);


-- ============================================================
-- ROW LEVEL SECURITY (Supabase)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_node_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- 예시: 자신의 데이터만 접근
CREATE POLICY "users_self" ON users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "workflows_owner" ON workflows
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "integrations_owner" ON user_integrations
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "executions_owner" ON executions
    FOR ALL USING (
        auth.uid() = (SELECT user_id FROM workflows WHERE id = workflow_id)
    );

CREATE POLICY "notifications_owner" ON notifications
    FOR ALL USING (auth.uid() = user_id);
