-- Projeto: Sistem Central - Vision AI (sfezwprbanvxsnwgvkhh)
-- Fila de posts do Instagram (Vision AI e COT-AI).
-- O Claude grava como 'rascunho'; só 'aprovado' é publicado pela Edge Function publicar-instagram.

create table if not exists public.fila_posts (
  id               uuid primary key default gen_random_uuid(),
  conta            text not null check (conta in ('vision_ai', 'cot_ai')),
  rede             text not null default 'instagram' check (rede in ('instagram')),
  legenda          text not null check (char_length(legenda) <= 2200),
  midia_urls       text[] not null check (cardinality(midia_urls) between 1 and 10),
  status           text not null default 'rascunho'
                   check (status in ('rascunho', 'aprovado', 'publicando', 'publicado', 'erro', 'cancelado')),
  agendado_para    timestamptz,
  publicado_em     timestamptz,
  ig_container_id  text,
  ig_media_id      text,
  permalink        text,
  erro             text,
  tentativas       int not null default 0,
  origem           text not null default 'claude',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table public.fila_posts is
  'Fila de publicação no Instagram. 1 URL = post de imagem; 2 a 10 URLs = carrossel. As URLs precisam ser JPEG públicos.';

create index if not exists fila_posts_status_agendado_idx
  on public.fila_posts (status, agendado_para);

alter table public.fila_posts enable row level security;

drop policy if exists somente_dono on public.fila_posts;
create policy somente_dono on public.fila_posts
  for all
  using ((select e_dono()))
  with check ((select e_dono()));

-- Reserva os próximos posts aprovados e vencidos, marcando como 'publicando'.
-- Também devolve para 'aprovado' o que ficou travado em 'publicando' há mais de 10 minutos.
create or replace function public.fila_posts_reservar(p_limite int default 2)
returns setof public.fila_posts
language sql
set search_path = public
as $$
  update public.fila_posts
     set status = 'aprovado', atualizado_em = now()
   where status = 'publicando'
     and atualizado_em < now() - interval '10 minutes';

  update public.fila_posts f
     set status = 'publicando', atualizado_em = now()
   where f.id in (
     select id
       from public.fila_posts
      where status = 'aprovado'
        and rede = 'instagram'
        and (agendado_para is null or agendado_para <= now())
      order by agendado_para nulls first, criado_em
      limit p_limite
      for update skip locked
   )
  returning f.*;
$$;

revoke all on function public.fila_posts_reservar(int) from public, anon, authenticated;
grant execute on function public.fila_posts_reservar(int) to service_role;

-- Cron: mesma convenção das outras funções (X-Cron-Secret lido do Vault).
select cron.schedule(
  'publicar-instagram-15min',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/publicar-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
