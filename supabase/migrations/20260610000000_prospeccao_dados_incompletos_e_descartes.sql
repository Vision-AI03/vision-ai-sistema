-- ============================================================================
-- prospeccao: permitir leads incompletos + métricas de descarte
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dados_incompletos BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.extracoes
  ADD COLUMN IF NOT EXISTS quantidade_descartada INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.extracoes
  ADD COLUMN IF NOT EXISTS motivo_descartes JSONB NOT NULL DEFAULT '{}'::jsonb;
