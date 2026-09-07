-- ============================================================
-- Contratos: completa contratos_preenchidos com o que a UI usa
-- ============================================================
-- Contexto: a migration 20260321000000_contratos_refactor.sql nunca foi
-- aplicada no remoto. As tabelas reais existem com outros nomes/colunas
-- (contratos_modelos.conteudo, contratos_preenchidos.conteudo_final).
-- O frontend foi alinhado aos nomes reais; aqui só somamos as colunas
-- que a tela "Preencher com IA" grava e que não existiam.

ALTER TABLE contratos_preenchidos
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dados_formulario JSONB,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'gerado';

UPDATE contratos_preenchidos SET status = 'gerado' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_preenchidos_created
  ON contratos_preenchidos(created_at DESC);
