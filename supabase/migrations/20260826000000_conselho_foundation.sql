-- ============================================================
-- CONSELHO CONSULTIVO — fundação
-- insights (recomendações acionáveis por rodada) + briefings (síntese cruzada).
-- Memória durável reusa licoes_aprendidas (coluna dominio).
-- ============================================================

-- 1) Insights: recomendações acionáveis geradas pelos analistas de setor
create table if not exists public.insights (
  id               uuid primary key default gen_random_uuid(),
  dominio          text not null,                    -- financeiro|prospeccao|abordagens|crm|contratos|tarefas
  titulo           text not null,
  detalhe          text,
  prioridade       text not null default 'media',    -- baixa|media|alta|critica
  acao_sugerida    text,
  impacto_estimado text,
  status           text not null default 'nova',     -- nova|em_andamento|resolvida|descartada|substituida
  metadata         jsonb,
  gerado_por       text,                             -- id do analista / 'orquestrador'
  gerado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists idx_insights_dominio_status on public.insights (dominio, status, gerado_em desc);
create index if not exists idx_insights_abertos on public.insights (status) where status in ('nova','em_andamento');

-- 2) Briefings: síntese cruzada do orquestrador
create table if not exists public.briefings (
  id           uuid primary key default gen_random_uuid(),
  cadencia     text not null,                        -- diario|semanal
  resumo       text,
  prioridades  jsonb,                                -- top itens cross-setor
  destaques    jsonb,
  gerado_em    timestamptz not null default now()
);
create index if not exists idx_briefings_recente on public.briefings (gerado_em desc);

-- 3) RLS: leitura autenticada; update em insights (marcar resolver/descartar)
alter table public.insights  enable row level security;
alter table public.briefings enable row level security;

drop policy if exists "leitura_autenticado" on public.insights;
create policy "leitura_autenticado" on public.insights for select to authenticated using (true);
drop policy if exists "update_autenticado" on public.insights;
create policy "update_autenticado" on public.insights for update to authenticated using (true) with check (true);

drop policy if exists "leitura_autenticado" on public.briefings;
create policy "leitura_autenticado" on public.briefings for select to authenticated using (true);

-- ============================================================
-- AGREGADOR: Financeiro (piloto)
-- ============================================================
create or replace function public.agregar_financeiro()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mrr numeric;
  v_custos numeric;
begin
  select coalesce(sum(valor_mensal),0) into v_mrr from public.recorrencias where ativo;
  select coalesce(sum(valor_mensal),0) into v_custos from public.custos where ativo;

  return jsonb_build_object(
    'gerado_em', now(),
    'mrr', v_mrr,
    'custos_mensais', v_custos,
    'margem_mensal', v_mrr - v_custos,
    'contratos', jsonb_build_object(
      'total',        (select count(*) from public.contratos),
      'valor_total',  (select coalesce(sum(valor_total),0) from public.contratos),
      'ticket_medio', (select coalesce(round(avg(valor_total),2),0) from public.contratos),
      'novos_7d',     (select count(*) from public.contratos where criado_em > now() - interval '7 days'),
      'por_status',   (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                         from (select status, count(*) n from public.contratos group by status) s)
    ),
    'parcelas', jsonb_build_object(
      'vencidas_qtd',    (select count(*) from public.parcelas where data_pagamento is null and data_vencimento < hoje),
      'vencidas_total',  (select coalesce(sum(valor),0) from public.parcelas where data_pagamento is null and data_vencimento < hoje),
      'vencidas_top',    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                            select p.id, c.cliente_nome, p.valor, p.data_vencimento, (hoje - p.data_vencimento) as dias_atraso
                            from public.parcelas p left join public.contratos c on c.id = p.contrato_id
                            where p.data_pagamento is null and p.data_vencimento < hoje
                            order by p.data_vencimento asc limit 5) x),
      'a_vencer_7d_qtd',   (select count(*) from public.parcelas where data_pagamento is null and data_vencimento between hoje and hoje + 7),
      'a_vencer_7d_total', (select coalesce(sum(valor),0) from public.parcelas where data_pagamento is null and data_vencimento between hoje and hoje + 7),
      'a_vencer_30d_total',(select coalesce(sum(valor),0) from public.parcelas where data_pagamento is null and data_vencimento between hoje and hoje + 30)
    ),
    'custos_renovando_7d', (select coalesce(jsonb_agg(jsonb_build_object(
                              'nome', nome, 'valor_mensal', valor_mensal, 'data_renovacao', data_renovacao, 'categoria', categoria)), '[]'::jsonb)
                            from public.custos where ativo and data_renovacao is not null and data_renovacao between hoje and hoje + 7),
    'atividade', (
      (select count(*) from public.parcelas where data_pagamento is null and data_vencimento < hoje)
      + (select count(*) from public.parcelas where data_pagamento is null and data_vencimento between hoje and hoje + 7)
      + (select count(*) from public.custos where ativo and data_renovacao between hoje and hoje + 7)
      + (select count(*) from public.contratos where criado_em > now() - interval '3 days')
    )
  );
end $$;

grant execute on function public.agregar_financeiro() to authenticated, service_role;
