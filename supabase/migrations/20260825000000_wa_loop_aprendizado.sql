-- ============================================================
-- LOOP WHATSAPP COMERCIAL — Vision AI (canal UazAPI, dedicado)
-- Idempotente: pode rodar de novo sem efeito colateral.
-- ============================================================

-- 1) Log bruto (ingestao rapida, nunca editar)
create table if not exists public.wa_eventos_brutos (
  id            bigserial primary key,
  recebido_em   timestamptz not null default now(),
  payload       jsonb       not null,
  processado    boolean     not null default false,
  processado_em timestamptz,
  erro          text
);
create index if not exists idx_wa_eventos_pendentes
  on public.wa_eventos_brutos (id) where processado = false;

-- 2) Conversas (uma por contato). lead_id opcional: cruza com CRM sem contaminar.
create table if not exists public.wa_conversas (
  id              uuid primary key default gen_random_uuid(),
  chat_id         text not null unique,
  telefone        text,
  nome_contato    text,
  lead_id         uuid references public.leads(id) on delete set null,
  primeira_msg_em timestamptz,
  ultima_msg_em   timestamptz,
  total_mensagens integer not null default 0,
  respondeu       boolean not null default false,
  resultado       text,
  analisada_em    timestamptz,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_wa_conversas_ultima on public.wa_conversas (ultima_msg_em desc);
create index if not exists idx_wa_conversas_lead   on public.wa_conversas (lead_id);

-- 3) Mensagens normalizadas
create table if not exists public.wa_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.wa_conversas(id) on delete cascade,
  message_id   text not null unique,
  from_me      boolean not null,
  tipo         text not null default 'texto',
  conteudo     text,
  enviada_em   timestamptz not null,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_wa_mensagens_conversa on public.wa_mensagens (conversa_id, enviada_em);

-- 4) Analise por conversa
create table if not exists public.wa_analises (
  id              uuid primary key default gen_random_uuid(),
  conversa_id     uuid not null references public.wa_conversas(id) on delete cascade,
  analisado_em    timestamptz not null default now(),
  angulo          text,
  abertura_tipo   text,
  objecoes        text[],
  resultado       text,
  o_que_funcionou text,
  o_que_falhou    text,
  unique (conversa_id, analisado_em)
);
create index if not exists idx_wa_analises_conversa on public.wa_analises (conversa_id);

-- 5) Licoes aprendidas (o ativo)
create table if not exists public.licoes_aprendidas (
  id            uuid primary key default gen_random_uuid(),
  dominio       text not null,
  contexto      text not null,
  licao         text not null,
  evidencia     text,
  reincidencias integer not null default 1,
  status        text not null default 'ativa',
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists idx_licoes_dominio on public.licoes_aprendidas (dominio, status);
create unique index if not exists uq_licoes_dedup
  on public.licoes_aprendidas (dominio, md5(lower(licao)));

-- 5b) Lista de contatos a ignorar (gerenciada por SQL)
create table if not exists public.wa_ignorados (
  telefone  text primary key,      -- so digitos, ex: 5519997193138
  motivo    text,
  criado_em timestamptz not null default now()
);
alter table public.wa_ignorados enable row level security;
drop policy if exists "leitura_autenticado" on public.wa_ignorados;
create policy "leitura_autenticado" on public.wa_ignorados for select to authenticated using (true);

-- ============================================================
-- 6) NORMALIZADOR (pg_cron 1min) — caminhos REAIS da UazAPI
--    fromMe boolean, timestamp em MILISSEGUNDOS, nome via chat.wa_contactName
-- ============================================================
create or replace function public.wa_processar_eventos()
returns void language plpgsql security definer set search_path = public as $$
declare
  ev record;
  v_chat_id text; v_telefone text; v_message_id text; v_from_me boolean;
  v_conteudo text; v_nome text; v_tipo text; v_ts timestamptz;
  v_conversa_id uuid; v_inseriu int;
begin
  for ev in
    select * from public.wa_eventos_brutos
    where processado = false order by id limit 300
  loop
    begin
      -- so eventos de mensagem
      if coalesce(ev.payload #>> '{EventType}', '') <> 'messages' then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='evento nao-mensagem' where id=ev.id;
        continue;
      end if;

      v_chat_id    := ev.payload #>> '{message,chatid}';
      v_message_id := ev.payload #>> '{message,messageid}';
      v_from_me    := coalesce((ev.payload #>> '{message,fromMe}')::boolean, false);
      v_conteudo   := coalesce(ev.payload #>> '{message,text}', ev.payload #>> '{message,content}');
      v_nome       := coalesce(ev.payload #>> '{chat,wa_contactName}',
                               ev.payload #>> '{chat,name}',
                               ev.payload #>> '{message,senderName}');
      v_tipo       := coalesce(ev.payload #>> '{message,type}', 'texto');
      v_ts         := to_timestamp(((ev.payload #>> '{message,messageTimestamp}')::bigint) / 1000.0); -- ms -> s

      if v_chat_id is null or v_message_id is null then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='sem chat_id/message_id' where id=ev.id;
        continue;
      end if;

      v_telefone := split_part(v_chat_id, '@', 1);

      -- ignora grupos
      if v_chat_id like '%@g.us' or coalesce((ev.payload #>> '{message,isGroup}')::boolean, false) then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='grupo ignorado' where id=ev.id;
        continue;
      end if;

      -- ignora contatos na lista de bloqueio
      if exists (select 1 from public.wa_ignorados where telefone = v_telefone) then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='contato ignorado' where id=ev.id;
        continue;
      end if;

      insert into public.wa_conversas (chat_id, telefone, nome_contato, primeira_msg_em, ultima_msg_em)
      values (v_chat_id, v_telefone, v_nome, v_ts, v_ts)
      on conflict (chat_id) do update
        set ultima_msg_em = greatest(public.wa_conversas.ultima_msg_em, excluded.ultima_msg_em),
            nome_contato   = coalesce(public.wa_conversas.nome_contato, excluded.nome_contato)
      returning id into v_conversa_id;

      insert into public.wa_mensagens (conversa_id, message_id, from_me, tipo, conteudo, enviada_em)
      values (v_conversa_id, v_message_id, v_from_me, v_tipo, v_conteudo, v_ts)
      on conflict (message_id) do nothing;
      get diagnostics v_inseriu = row_count;

      if v_inseriu > 0 then
        update public.wa_conversas set
          total_mensagens = total_mensagens + 1,
          respondeu       = respondeu or (not v_from_me),
          primeira_msg_em = least(coalesce(primeira_msg_em, v_ts), v_ts)
        where id = v_conversa_id;
      end if;

      update public.wa_conversas c set lead_id = l.id
      from public.leads l
      where c.id = v_conversa_id and c.lead_id is null
        and regexp_replace(coalesce(l.telefone,''),'\D','','g') like '%'||right(v_telefone,8)||'%';

      update public.wa_eventos_brutos set processado=true, processado_em=now() where id=ev.id;
    exception when others then
      update public.wa_eventos_brutos
        set processado=true, processado_em=now(), erro=sqlerrm where id=ev.id;
    end;
  end loop;
end $$;

-- 7) Fila de analise: assentada (12h quieta) + suja (msg nova desde ultima analise)
create or replace function public.wa_conversas_para_analise(p_limite int default 40)
returns setof public.wa_conversas language sql stable set search_path = public as $$
  select * from public.wa_conversas
  where ultima_msg_em < now() - interval '12 hours'
    and (analisada_em is null or ultima_msg_em > analisada_em)
  order by ultima_msg_em desc
  limit p_limite;
$$;

-- 8) Registro de licao com dedup + 3 strikes = lei (atomico)
create or replace function public.registrar_licao(
  p_dominio text, p_contexto text, p_licao text, p_evidencia text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.licoes_aprendidas (dominio, contexto, licao, evidencia)
  values (p_dominio, p_contexto, p_licao, p_evidencia)
  on conflict (dominio, md5(lower(licao))) do update set
    reincidencias = public.licoes_aprendidas.reincidencias + 1,
    atualizada_em = now(),
    evidencia     = coalesce(excluded.evidencia, public.licoes_aprendidas.evidencia),
    status        = case
      when public.licoes_aprendidas.status = 'arquivada' then 'arquivada'
      when public.licoes_aprendidas.reincidencias + 1 >= 3 then 'lei'
      else 'ativa' end;
end $$;

-- ============================================================
-- 9) RLS — internas: leitura so autenticado; brutos so service_role
-- ============================================================
alter table public.wa_eventos_brutos  enable row level security;
alter table public.wa_conversas        enable row level security;
alter table public.wa_mensagens        enable row level security;
alter table public.wa_analises          enable row level security;
alter table public.licoes_aprendidas    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wa_conversas','wa_mensagens','wa_analises','licoes_aprendidas'] loop
    execute format('drop policy if exists "leitura_autenticado" on public.%I', t);
    execute format('create policy "leitura_autenticado" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ============================================================
-- 10) CRON — normalizador 1min + retencao diaria
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule('wa-processar-eventos')
      where exists (select 1 from cron.job where jobname='wa-processar-eventos');
    perform cron.schedule('wa-processar-eventos','* * * * *',
      $c$ select public.wa_processar_eventos(); $c$);

    perform cron.unschedule('wa-limpar-brutos')
      where exists (select 1 from cron.job where jobname='wa-limpar-brutos');
    perform cron.schedule('wa-limpar-brutos','0 4 * * *',
      $c$ delete from public.wa_eventos_brutos
          where processado=true and recebido_em < now() - interval '30 days'; $c$);
  end if;
end $$;
