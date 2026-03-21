-- ============================================================
-- Migration: New Features (8 funcionalidades)
-- ============================================================

-- 1. ANOTAÇÕES INTERNAS POR LEAD
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_notas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notas_lead ON lead_notas(lead_id, created_at DESC);

ALTER TABLE lead_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_lead_notas_all" ON lead_notas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 2. SCORE DINÂMICO: colunas de controle de tempo
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_mudou_em TIMESTAMPTZ DEFAULT now();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_calculado_em TIMESTAMPTZ;


-- 3. TRACKING DE EVENTOS RESEND
-- ============================================================
ALTER TABLE comunicacoes ADD COLUMN IF NOT EXISTS resend_message_id TEXT;
ALTER TABLE comunicacoes ADD COLUMN IF NOT EXISTS aberto_em TIMESTAMPTZ;
ALTER TABLE comunicacoes ADD COLUMN IF NOT EXISTS clicado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_comunicacoes_resend_id ON comunicacoes(resend_message_id)
  WHERE resend_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS resend_eventos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resend_message_id TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  payload JSONB,
  processado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resend_eventos_msg ON resend_eventos(resend_message_id, tipo);


-- 4. AUTOMAÇÕES POR ESTÁGIO
-- ============================================================
CREATE TABLE IF NOT EXISTS automacoes_estagio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  estagio VARCHAR(50) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criar_tarefa BOOLEAN DEFAULT true,
  tarefa_titulo VARCHAR(300),
  tarefa_descricao TEXT,
  tarefa_prazo_dias INTEGER DEFAULT 1,
  tarefa_prioridade VARCHAR(20) DEFAULT 'media',
  criar_notificacao BOOLEAN DEFAULT true,
  notificacao_titulo VARCHAR(300),
  notificacao_descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, estagio)
);

ALTER TABLE automacoes_estagio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_automacoes_all" ON automacoes_estagio
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 5. PROPOSTAS COMERCIAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS propostas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  titulo VARCHAR(300) NOT NULL,
  tipo_servico VARCHAR(50) NOT NULL,
  contexto_cliente TEXT NOT NULL,
  conteudo_gerado TEXT,
  valor_estimado DECIMAL(12,2),
  validade_dias INTEGER DEFAULT 30,
  status VARCHAR(50) DEFAULT 'rascunho',
  enviada_em TIMESTAMPTZ,
  versao INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_propostas_user ON propostas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_propostas_lead ON propostas(lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE propostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_propostas_all" ON propostas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 6. CALENDÁRIO DE REUNIÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS reunioes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  titulo VARCHAR(300) NOT NULL,
  descricao TEXT,
  data_hora_inicio TIMESTAMPTZ NOT NULL,
  data_hora_fim TIMESTAMPTZ,
  link_videoconferencia TEXT,
  local VARCHAR(300),
  status VARCHAR(30) DEFAULT 'agendada',
  notificacao_1h_enviada BOOLEAN DEFAULT false,
  notificacao_dia_enviada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reunioes_user_data ON reunioes(user_id, data_hora_inicio);
CREATE INDEX IF NOT EXISTS idx_reunioes_lead ON reunioes(lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE reunioes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_reunioes_all" ON reunioes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 8. ENRIQUECIMENTO COMPLETO: dados brutos por fonte
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriquecimento_site_raw JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriquecimento_linkedin_raw JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriquecimento_instagram_raw JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriquecimento_data TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriquecimento_fontes JSONB;
