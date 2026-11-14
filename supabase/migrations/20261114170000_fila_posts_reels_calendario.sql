-- Projeto: Sistem Central - Vision AI (sfezwprbanvxsnwgvkhh)
-- Fila de posts: Reels, pedido de alteração e calendário automático.
--
-- Calendário: cada conta publica em dias alternados (dia sim, dia não), com 2 posts
-- no dia de publicação: feed (imagem/carrossel) às 12h e Reels às 19h (horário de Brasília).
-- Ao aprovar, o post vai para o próximo horário livre do seu tipo — ninguém agenda à mão.

-- 1. Novos campos -------------------------------------------------------------
alter table public.fila_posts
  add column if not exists tipo text not null default 'imagem',
  add column if not exists capa_url text,
  add column if not exists pauta text,
  add column if not exists nicho text,
  add column if not exists referencias text[],
  add column if not exists feedback text,
  add column if not exists aprovado_em timestamptz;

update public.fila_posts
   set tipo = case when cardinality(midia_urls) > 1 then 'carrossel' else 'imagem' end
 where tipo = 'imagem' and cardinality(midia_urls) > 1;

alter table public.fila_posts drop constraint if exists fila_posts_tipo_check;
alter table public.fila_posts add constraint fila_posts_tipo_check
  check (tipo in ('imagem', 'carrossel', 'reels'));

alter table public.fila_posts drop constraint if exists fila_posts_midia_por_tipo_check;
alter table public.fila_posts add constraint fila_posts_midia_por_tipo_check
  check (
    (tipo = 'imagem'    and cardinality(midia_urls) = 1) or
    (tipo = 'carrossel' and cardinality(midia_urls) between 2 and 10) or
    (tipo = 'reels'     and cardinality(midia_urls) = 1)
  );

-- 'revisar' = você pediu alteração; o Claude refaz e devolve como 'rascunho'.
alter table public.fila_posts drop constraint if exists fila_posts_status_check;
alter table public.fila_posts add constraint fila_posts_status_check
  check (status in ('rascunho', 'revisar', 'aprovado', 'publicando', 'publicado', 'erro', 'cancelado'));

comment on column public.fila_posts.tipo is 'imagem (1 JPEG), carrossel (2-10 JPEG) ou reels (1 MP4).';
comment on column public.fila_posts.pauta is 'Ideia/roteiro do post: o que o Claude quis comunicar e por quê.';
comment on column public.fila_posts.feedback is 'Pedido de alteração do dono quando status = revisar.';

-- 2. Calendário ---------------------------------------------------------------
-- Dia de publicação = número par de dias desde a âncora (sábado 2026-11-14, dia do 1º post).
create or replace function public.fila_posts_proximo_horario(p_conta text, p_tipo text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_hora   time := case when p_tipo = 'reels' then time '19:00' else time '12:00' end;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia    date;
  v_slot   timestamptz;
begin
  for i in 0..400 loop
    v_dia := v_hoje + i;
    continue when (v_dia - date '2026-11-14') % 2 <> 0;
    v_slot := (v_dia + v_hora) at time zone 'America/Sao_Paulo';
    continue when v_slot < now() + interval '10 minutes';
    if not exists (
      select 1 from public.fila_posts
       where conta = p_conta
         and (tipo = 'reels') = (p_tipo = 'reels')
         and status in ('aprovado', 'publicando', 'publicado')
         and agendado_para = v_slot
    ) then
      return v_slot;
    end if;
  end loop;
  return null;
end;
$$;

-- Aprova e encaixa no calendário. Roda como o usuário logado (RLS somente_dono vale).
create or replace function public.fila_posts_aprovar(p_id uuid)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_post public.fila_posts;
  v_slot timestamptz;
begin
  select * into v_post from public.fila_posts where id = p_id for update;
  if not found then
    raise exception 'Post não encontrado';
  end if;
  if v_post.status not in ('rascunho', 'revisar', 'erro', 'cancelado') then
    raise exception 'Post com status % não pode ser aprovado', v_post.status;
  end if;

  v_slot := public.fila_posts_proximo_horario(v_post.conta, v_post.tipo);

  update public.fila_posts
     set status = 'aprovado', agendado_para = v_slot, aprovado_em = now(),
         feedback = null, erro = null, tentativas = 0, ig_container_id = null,
         atualizado_em = now()
   where id = p_id;
  return v_slot;
end;
$$;

revoke all on function public.fila_posts_proximo_horario(text, text) from public, anon;
revoke all on function public.fila_posts_aprovar(uuid) from public, anon;
grant execute on function public.fila_posts_proximo_horario(text, text) to authenticated, service_role;
grant execute on function public.fila_posts_aprovar(uuid) to authenticated, service_role;

-- 3. Bucket aceita vídeo (Reels) ------------------------------------------------
update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array['image/jpeg', 'video/mp4']
 where id = 'posts';
