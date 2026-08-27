-- ============================================================
-- RADAR DE ANÚNCIOS (Meta / Marketing API)
-- Sincroniza campanhas, criativos e métricas diárias (CPC/CTR/gasto/leads)
-- + análise estratégica por IA. Single-tenant (sem user_id no core).
-- ============================================================

-- 1) Campanhas (metadados vindos da Graph API)
create table if not exists public.ads_campanhas (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   text not null unique,            -- id da campanha na Meta
  nome          text,
  objetivo      text,                            -- OUTCOME_LEADS, OUTCOME_TRAFFIC, etc.
  status        text,                            -- ACTIVE, PAUSED, ...
  verba_diaria  numeric,                         -- daily_budget em R$ (centavos/100)
  atualizado_em timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);

-- 2) Criativos (nível anúncio + conteúdo do criativo)
create table if not exists public.ads_criativos (
  id            uuid primary key default gen_random_uuid(),
  ad_id         text not null unique,            -- id do anúncio na Meta
  campaign_id   text,
  nome          text,
  titulo        text,
  corpo         text,
  thumbnail_url text,
  status        text,
  atualizado_em timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);
create index if not exists idx_ads_criativos_campanha on public.ads_criativos (campaign_id);

-- 3) Métricas diárias (conta | campanha | anuncio) — série temporal
create table if not exists public.ads_metricas_diarias (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  nivel           text not null,                 -- 'conta' | 'campanha' | 'anuncio'
  ref_id          text not null,                 -- id da conta/campanha/anuncio
  nome            text,
  gasto           numeric  not null default 0,
  impressoes      bigint   not null default 0,
  cliques         bigint   not null default 0,
  cpc             numeric  not null default 0,
  cpm             numeric  not null default 0,
  ctr             numeric  not null default 0,   -- %
  alcance         bigint   not null default 0,
  frequencia      numeric  not null default 0,
  leads           integer  not null default 0,
  compras         integer  not null default 0,
  valor_conversao numeric  not null default 0,
  criado_em       timestamptz not null default now(),
  unique (data, nivel, ref_id)
);
create index if not exists idx_ads_metricas_nivel_data on public.ads_metricas_diarias (nivel, data desc);
create index if not exists idx_ads_metricas_ref on public.ads_metricas_diarias (ref_id, data desc);

-- 4) Análises geradas por IA (estratégicas — criativos, públicos, alertas)
create table if not exists public.ads_analises_ia (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'manual', -- 'semanal' | 'manual'
  periodo_inicio date,
  periodo_fim    date,
  resumo         text,
  conteudo       text,                           -- relatório completo em Markdown
  insights       jsonb,                          -- itens acionáveis estruturados
  gerado_em      timestamptz not null default now()
);
create index if not exists idx_ads_analises_recente on public.ads_analises_ia (gerado_em desc);

-- ============================================================
-- RLS: leitura autenticada; escrita via service_role (bypassa RLS).
-- Delete autenticado nas análises (listagem com botão excluir).
-- ============================================================
alter table public.ads_campanhas        enable row level security;
alter table public.ads_criativos        enable row level security;
alter table public.ads_metricas_diarias enable row level security;
alter table public.ads_analises_ia      enable row level security;

drop policy if exists "leitura_autenticado" on public.ads_campanhas;
create policy "leitura_autenticado" on public.ads_campanhas for select to authenticated using (true);

drop policy if exists "leitura_autenticado" on public.ads_criativos;
create policy "leitura_autenticado" on public.ads_criativos for select to authenticated using (true);

drop policy if exists "leitura_autenticado" on public.ads_metricas_diarias;
create policy "leitura_autenticado" on public.ads_metricas_diarias for select to authenticated using (true);

drop policy if exists "leitura_autenticado" on public.ads_analises_ia;
create policy "leitura_autenticado" on public.ads_analises_ia for select to authenticated using (true);
drop policy if exists "delete_autenticado" on public.ads_analises_ia;
create policy "delete_autenticado" on public.ads_analises_ia for delete to authenticated using (true);

-- ============================================================
-- CRON: sync diário 08:00 UTC (05:00 BRT), análise semanal seg 11:30 UTC.
-- Reusa o segredo 'cron_secret' do Vault (mesmo padrão do Conselho).
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron')
     and exists (select 1 from pg_extension where extname='pg_net') then

    perform cron.unschedule('meta-ads-sync')
      where exists (select 1 from cron.job where jobname='meta-ads-sync');
    perform cron.schedule('meta-ads-sync', '0 8 * * *', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/meta-ads-sync',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{}'::jsonb
      );
    $c$);

    perform cron.unschedule('meta-ads-analise')
      where exists (select 1 from cron.job where jobname='meta-ads-analise');
    perform cron.schedule('meta-ads-analise', '30 11 * * 1', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/meta-ads-analise',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{"tipo":"semanal"}'::jsonb
      );
    $c$);
  end if;
end $$;
