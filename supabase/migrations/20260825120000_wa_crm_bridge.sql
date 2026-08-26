-- ============================================================
-- BRIDGE WhatsApp comercial -> CRM (Vision AI)
-- Envio manual (celular); o sistema so ESCUTA e sincroniza.
-- leads e single-tenant (sem user_id). email e NOT NULL -> placeholder.
-- Idempotente.
-- ============================================================

-- limpeza de tentativa anterior (wa_config nao e necessaria: leads sem user_id)
drop table if exists public.wa_config;

-- 1) Sincroniza um lead a partir de uma conversa do WhatsApp
create or replace function public.wa_sincronizar_lead(p_conversa_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conv    public.wa_conversas;
  v_lead_id uuid;
  v_enviei  boolean;
  v_env_em  timestamptz;
  v_resp_em timestamptz;
begin
  select * into v_conv from public.wa_conversas where id = p_conversa_id;
  if not found then return; end if;

  -- defensivo: nunca sincroniza contato bloqueado
  if exists (select 1 from public.wa_ignorados where telefone = v_conv.telefone) then
    return;
  end if;

  -- deriva sinais das mensagens da conversa
  select bool_or(from_me),
         min(enviada_em) filter (where from_me),
         min(enviada_em) filter (where not from_me)
    into v_enviei, v_env_em, v_resp_em
  from public.wa_mensagens where conversa_id = p_conversa_id;

  v_lead_id := v_conv.lead_id;

  -- acha lead existente por telefone (ultimos 8 digitos) se ainda nao linkado
  if v_lead_id is null then
    select id into v_lead_id from public.leads
      where regexp_replace(coalesce(telefone,''),'\D','','g') like '%'||right(v_conv.telefone,8)||'%'
      order by criado_em limit 1;
  end if;

  if v_lead_id is null then
    -- cria o lead: 'respondeu' se ja houve resposta, senao 'contatado'
    insert into public.leads
      (nome, email, telefone, status, origem,
       whatsapp_enviado, data_whatsapp_enviado,
       whatsapp_respondido, data_whatsapp_respondido, status_mudou_em)
    values
      (coalesce(nullif(v_conv.nome_contato,''), v_conv.telefone),
       v_conv.telefone || '@whatsapp.local',       -- email placeholder (NOT NULL)
       v_conv.telefone,
       case when v_conv.respondeu then 'respondeu' else 'contatado' end,
       'whatsapp',
       coalesce(v_enviei,false), v_env_em,
       v_conv.respondeu, v_resp_em, now())
    returning id into v_lead_id;
  else
    -- atualiza lead existente; avanca pra 'respondeu' so em estagio inicial
    update public.leads set
      whatsapp_enviado         = coalesce(whatsapp_enviado,false) or coalesce(v_enviei,false),
      data_whatsapp_enviado    = coalesce(data_whatsapp_enviado, v_env_em),
      whatsapp_respondido      = coalesce(whatsapp_respondido,false) or v_conv.respondeu,
      data_whatsapp_respondido = coalesce(data_whatsapp_respondido, v_resp_em),
      status = case
        when v_conv.respondeu and status in ('novo','enriquecido','contatado') then 'respondeu'
        else status end,
      status_mudou_em = case
        when v_conv.respondeu and status in ('novo','enriquecido','contatado') then now()
        else status_mudou_em end
    where id = v_lead_id;
  end if;

  -- linka a conversa de volta ao lead
  update public.wa_conversas
    set lead_id = v_lead_id
    where id = p_conversa_id and lead_id is distinct from v_lead_id;
end $$;

-- 2) Normalizador: chama o bridge no lugar do link inline anterior
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
      v_ts         := to_timestamp(((ev.payload #>> '{message,messageTimestamp}')::bigint) / 1000.0);

      if v_chat_id is null or v_message_id is null then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='sem chat_id/message_id' where id=ev.id;
        continue;
      end if;

      v_telefone := split_part(v_chat_id, '@', 1);

      if v_chat_id like '%@g.us' or coalesce((ev.payload #>> '{message,isGroup}')::boolean, false) then
        update public.wa_eventos_brutos
          set processado=true, processado_em=now(), erro='grupo ignorado' where id=ev.id;
        continue;
      end if;

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

        perform public.wa_sincronizar_lead(v_conversa_id);   -- bridge CRM
      end if;

      update public.wa_eventos_brutos set processado=true, processado_em=now() where id=ev.id;
    exception when others then
      update public.wa_eventos_brutos
        set processado=true, processado_em=now(), erro=sqlerrm where id=ev.id;
    end;
  end loop;
end $$;

-- 3) Backfill: sincroniza as conversas ja coletadas (respeita blocklist)
select public.wa_sincronizar_lead(id) from public.wa_conversas;
