-- ============================================================================
-- Cockpit Diário (/hoje) — views agregadas
-- security_invoker=on faz a view respeitar o RLS do chamador
-- ============================================================================

-- (a) Leads estagnados: fora dos estágios finais, sem mudança há 3+ dias
CREATE OR REPLACE VIEW public.v_cockpit_leads_parados
WITH (security_invoker = on) AS
SELECT
  l.id,
  l.nome,
  l.empresa,
  l.status,
  l.telefone,
  l.email,
  l.score,
  l.prioridade_contato,
  l.segmento,
  COALESCE(l.status_mudou_em, l.atualizado_em, l.criado_em) AS ultimo_contato,
  EXTRACT(DAY FROM (now() - COALESCE(l.status_mudou_em, l.atualizado_em, l.criado_em)))::int AS dias_parado
FROM public.leads l
WHERE l.status NOT IN ('perdido', 'ganho', 'fechado')
  AND COALESCE(l.status_mudou_em, l.atualizado_em, l.criado_em) < (now() - interval '3 days');

GRANT SELECT ON public.v_cockpit_leads_parados TO authenticated;

-- (b1) Caixa 7 dias: parcelas vencidas ou a vencer em 7 dias, não pagas
CREATE OR REPLACE VIEW public.v_cockpit_caixa_parcelas
WITH (security_invoker = on) AS
SELECT
  p.id,
  c.cliente_nome,
  p.descricao,
  p.valor,
  p.data_vencimento,
  p.status,
  CASE
    WHEN p.data_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'a_vencer'
  END AS situacao,
  (p.data_vencimento - CURRENT_DATE)::int AS dias
FROM public.parcelas p
JOIN public.contratos c ON c.id = p.contrato_id
WHERE p.status <> 'pago'
  AND p.data_vencimento <= CURRENT_DATE + interval '7 days';

GRANT SELECT ON public.v_cockpit_caixa_parcelas TO authenticated;

-- (b2) Recorrências ativas do mês corrente
CREATE OR REPLACE VIEW public.v_cockpit_recorrencias_mes
WITH (security_invoker = on) AS
SELECT
  r.id,
  c.cliente_nome,
  r.valor_mensal,
  r.dia_vencimento,
  MAKE_DATE(
    EXTRACT(YEAR FROM CURRENT_DATE)::int,
    EXTRACT(MONTH FROM CURRENT_DATE)::int,
    LEAST(
      r.dia_vencimento,
      EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int
    )
  ) AS proximo_vencimento
FROM public.recorrencias r
JOIN public.contratos c ON c.id = r.contrato_id
WHERE r.ativo = true;

GRANT SELECT ON public.v_cockpit_recorrencias_mes TO authenticated;

-- (b3) Custos com renovação nos próximos 15 dias
CREATE OR REPLACE VIEW public.v_cockpit_custos_renovacao
WITH (security_invoker = on) AS
SELECT
  id,
  nome,
  categoria,
  valor_mensal,
  data_renovacao,
  (data_renovacao - CURRENT_DATE)::int AS dias
FROM public.custos
WHERE ativo = true
  AND data_renovacao IS NOT NULL
  AND data_renovacao <= CURRENT_DATE + interval '15 days';

GRANT SELECT ON public.v_cockpit_custos_renovacao TO authenticated;

-- (c) Tarefas de hoje + atrasadas (RLS por user_id é herdado da tabela tarefas)
CREATE OR REPLACE VIEW public.v_cockpit_tarefas_hoje
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  titulo,
  descricao,
  prioridade,
  data_vencimento,
  status,
  concluida,
  lead_id,
  contrato_id,
  CASE
    WHEN data_vencimento < CURRENT_DATE THEN 'atrasada'
    WHEN data_vencimento = CURRENT_DATE THEN 'hoje'
    ELSE 'outras'
  END AS tipo
FROM public.tarefas
WHERE concluida = false
  AND data_vencimento IS NOT NULL
  AND data_vencimento <= CURRENT_DATE;

GRANT SELECT ON public.v_cockpit_tarefas_hoje TO authenticated;
