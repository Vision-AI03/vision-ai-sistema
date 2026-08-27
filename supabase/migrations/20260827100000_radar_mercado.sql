-- ============================================================
-- RADAR DE MERCADO IA — notícias/ferramentas do mundo de IA sem ruído.
-- Coleta (web/RSS) -> curadoria DeepSeek -> relatório diário/semanal (Claude).
-- Single-tenant. Fase B1: web. Fase B2 (depois): X via Apify.
-- ============================================================

-- 1) Fontes (RSS/site agora; 'x' na fase B2)
create table if not exists public.mercado_fontes (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null default 'rss',   -- 'rss' | 'site' | 'x'
  nome      text not null,
  url       text not null unique,          -- URL do feed ou @handle
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 2) Itens curados (só o que passou no filtro de relevância)
create table if not exists public.mercado_itens (
  id           uuid primary key default gen_random_uuid(),
  fonte_id     uuid references public.mercado_fontes(id) on delete set null,
  titulo       text not null,
  resumo       text,                        -- resumo pt-BR gerado na curadoria
  url          text not null unique,
  categoria    text default 'outro',        -- ferramenta|modelo|pesquisa|negocio|outro
  relevancia   integer not null default 0,  -- 0-100
  destaque     boolean not null default false,
  fonte_nome   text,                         -- denormalizado p/ exibição
  publicado_em timestamptz,
  coletado_em  timestamptz not null default now(),
  status       text not null default 'curado' -- 'curado' | 'descartado'
);
create index if not exists idx_mercado_itens_recente on public.mercado_itens (coletado_em desc);
create index if not exists idx_mercado_itens_categoria on public.mercado_itens (categoria, coletado_em desc);
create index if not exists idx_mercado_itens_publicado on public.mercado_itens (publicado_em desc);

-- 3) Relatórios (briefing diário/semanal)
create table if not exists public.mercado_relatorios (
  id             uuid primary key default gen_random_uuid(),
  cadencia       text not null,               -- 'diario' | 'semanal'
  periodo_inicio timestamptz,
  periodo_fim    timestamptz,
  resumo         text,
  conteudo       text,                        -- markdown
  gerado_em      timestamptz not null default now()
);
create index if not exists idx_mercado_relatorios_recente on public.mercado_relatorios (gerado_em desc);

-- ============================================================
-- RLS: leitura autenticada. Fontes = CRUD completo (tela gerencia).
-- Itens e relatórios = delete autenticado (listagens com excluir).
-- Escrita de itens/relatórios via service_role (Edge Functions).
-- ============================================================
alter table public.mercado_fontes     enable row level security;
alter table public.mercado_itens       enable row level security;
alter table public.mercado_relatorios  enable row level security;

drop policy if exists "leitura_autenticado" on public.mercado_fontes;
create policy "leitura_autenticado" on public.mercado_fontes for select to authenticated using (true);
drop policy if exists "insert_autenticado" on public.mercado_fontes;
create policy "insert_autenticado" on public.mercado_fontes for insert to authenticated with check (true);
drop policy if exists "update_autenticado" on public.mercado_fontes;
create policy "update_autenticado" on public.mercado_fontes for update to authenticated using (true) with check (true);
drop policy if exists "delete_autenticado" on public.mercado_fontes;
create policy "delete_autenticado" on public.mercado_fontes for delete to authenticated using (true);

drop policy if exists "leitura_autenticado" on public.mercado_itens;
create policy "leitura_autenticado" on public.mercado_itens for select to authenticated using (true);
drop policy if exists "delete_autenticado" on public.mercado_itens;
create policy "delete_autenticado" on public.mercado_itens for delete to authenticated using (true);

drop policy if exists "leitura_autenticado" on public.mercado_relatorios;
create policy "leitura_autenticado" on public.mercado_relatorios for select to authenticated using (true);
drop policy if exists "delete_autenticado" on public.mercado_relatorios;
create policy "delete_autenticado" on public.mercado_relatorios for delete to authenticated using (true);

-- ============================================================
-- SEED de fontes RSS (fortes no mundo de IA). Editáveis pela tela /radar.
-- ============================================================
insert into public.mercado_fontes (tipo, nome, url) values
  ('rss', 'TechCrunch AI',        'https://techcrunch.com/category/artificial-intelligence/feed/'),
  ('rss', 'VentureBeat AI',       'https://venturebeat.com/category/ai/feed/'),
  ('rss', 'MIT Tech Review AI',   'https://www.technologyreview.com/topic/artificial-intelligence/feed/'),
  ('rss', 'The Verge',            'https://www.theverge.com/rss/index.xml'),
  ('rss', 'Simon Willison',       'https://simonwillison.net/atom/everything/'),
  ('rss', 'Hugging Face Blog',    'https://huggingface.co/blog/feed.xml'),
  ('rss', 'Google DeepMind Blog', 'https://deepmind.google/blog/rss.xml'),
  ('rss', 'Hacker News (IA/LLM)', 'https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+Claude&count=50')
on conflict (url) do nothing;

-- ============================================================
-- CRON: coleta+curadoria diária 10:00 UTC, relatório diário 10:20,
-- relatório semanal segunda 10:40. Reusa vault 'cron_secret'.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron')
     and exists (select 1 from pg_extension where extname='pg_net') then

    perform cron.unschedule('radar-coletar')
      where exists (select 1 from cron.job where jobname='radar-coletar');
    perform cron.schedule('radar-coletar', '0 10 * * *', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/radar-coletar',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{}'::jsonb
      );
    $c$);

    perform cron.unschedule('radar-relatorio-diario')
      where exists (select 1 from cron.job where jobname='radar-relatorio-diario');
    perform cron.schedule('radar-relatorio-diario', '20 10 * * *', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/radar-relatorio',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{"cadencia":"diario"}'::jsonb
      );
    $c$);

    perform cron.unschedule('radar-relatorio-semanal')
      where exists (select 1 from cron.job where jobname='radar-relatorio-semanal');
    perform cron.schedule('radar-relatorio-semanal', '40 10 * * 1', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/radar-relatorio',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{"cadencia":"semanal"}'::jsonb
      );
    $c$);
  end if;
end $$;
