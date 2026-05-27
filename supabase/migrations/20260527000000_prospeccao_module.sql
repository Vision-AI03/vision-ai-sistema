-- Torna email nullable na tabela leads (necessário para leads sem email extraído)
ALTER TABLE public.leads ALTER COLUMN email DROP NOT NULL;

-- Tabela de histórico de extrações
CREATE TABLE IF NOT EXISTS public.extracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em TIMESTAMPTZ DEFAULT now(),
  cidade TEXT NOT NULL,
  nicho TEXT NOT NULL,
  quantidade_solicitada INTEGER NOT NULL,
  quantidade_extraida INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processando' CHECK (status IN ('processando', 'concluido', 'erro')),
  erro_mensagem TEXT,
  apify_run_id TEXT,
  leads_ids UUID[],
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS
ALTER TABLE public.extracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver extracoes" ON public.extracoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Autenticados podem inserir extracoes" ON public.extracoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Autenticados podem atualizar extracoes" ON public.extracoes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
