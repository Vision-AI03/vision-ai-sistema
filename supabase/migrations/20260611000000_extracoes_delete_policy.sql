-- ============================================================================
-- prospeccao: permitir DELETE em extracoes (não cascateia para leads)
-- ============================================================================

DROP POLICY IF EXISTS "Autenticados podem deletar extracoes" ON public.extracoes;

CREATE POLICY "Autenticados podem deletar extracoes" ON public.extracoes
  FOR DELETE TO authenticated USING (true);
