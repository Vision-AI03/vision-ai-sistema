-- OPERÁRIO IA LOCAL — Vision AI
-- Análises pesadas (relatório semanal, briefing do Conselho, anúncios, métricas)
-- rodam no Claude Code do PC do Wesley, com a assinatura dele, e não na API.
--   Tela → insere pedido em fila_ia → scripts/operario (Agendador do Windows, 5 min)
--   pega o pedido → claude -p "/operario-ia" → grava o resultado em markdown.
-- uso_assinatura: espelho da janela de 5h/7 dias, lida pela status line do Claude Code.

create table if not exists public.fila_ia (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('relatorio_semanal', 'briefing_conselho', 'analise_anuncios', 'analise_metricas')),
  parametros   jsonb not null default '{}'::jsonb,
  status       text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
  resultado_md text,
  erro         text,
  origem       text not null default 'manual' check (origem in ('manual', 'agendado')),
  criado_em    timestamptz not null default now(),
  iniciado_em  timestamptz,
  concluido_em timestamptz
);

create index if not exists fila_ia_tipo_criado_idx on public.fila_ia (tipo, criado_em desc);
create index if not exists fila_ia_status_idx on public.fila_ia (status, criado_em);

alter table public.fila_ia enable row level security;
drop policy if exists somente_dono on public.fila_ia;
create policy somente_dono on public.fila_ia
  for all
  using ((select e_dono()))
  with check ((select e_dono()));

create table if not exists public.uso_assinatura (
  conta            text primary key default 'claude',
  cinco_horas_pct  numeric,
  cinco_horas_reset timestamptz,
  sete_dias_pct    numeric,
  sete_dias_reset  timestamptz,
  atualizado_em    timestamptz not null default now()
);

alter table public.uso_assinatura enable row level security;
drop policy if exists somente_dono on public.uso_assinatura;
create policy somente_dono on public.uso_assinatura
  for all
  using ((select e_dono()))
  with check ((select e_dono()));
