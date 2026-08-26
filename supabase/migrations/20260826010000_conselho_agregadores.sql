-- ============================================================
-- CONSELHO — agregadores dos demais setores + cron diário
-- ============================================================

-- CRM ---------------------------------------------------------
create or replace function public.agregar_crm()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'gerado_em', now(),
    'total', (select count(*) from public.leads),
    'por_status', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb)
                     from (select coalesce(status,'novo') st, count(*) n from public.leads group by 1) s),
    'score_alto', (select count(*) from public.leads where score >= 71),
    'sem_score', (select count(*) from public.leads where score is null),
    'respondeu_whatsapp', (select count(*) from public.leads where whatsapp_respondido),
    'sem_contato', (select count(*) from public.leads
                      where coalesce(whatsapp_enviado,false)=false and coalesce(email_enviado,false)=false),
    'novos_7d', (select count(*) from public.leads where criado_em > now() - interval '7 days'),
    'parados_14d', (select count(*) from public.leads
                      where status in ('contatado','respondeu','enriquecido')
                        and coalesce(status_mudou_em, criado_em) < now() - interval '14 days'),
    'atividade', (select count(*) from public.leads
                    where criado_em > now() - interval '3 days'
                       or coalesce(status_mudou_em, 'epoch'::timestamptz) > now() - interval '3 days')
  );
end $$;
grant execute on function public.agregar_crm() to authenticated, service_role;

-- PROSPECÇÃO --------------------------------------------------
create or replace function public.agregar_prospeccao()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'gerado_em', now(),
    'extracoes_total', (select count(*) from public.extracoes),
    'ultima_extracao', (select max(criado_em) from public.extracoes),
    'leads_extraidos_total', (select coalesce(sum(quantidade_extraida),0) from public.extracoes),
    'com_erro', (select count(*) from public.extracoes where erro_mensagem is not null),
    'por_nicho', (select coalesce(jsonb_object_agg(nicho, n), '{}'::jsonb)
                    from (select nicho, count(*) n from public.extracoes group by 1) s),
    'extracoes_7d', (select count(*) from public.extracoes where criado_em > now() - interval '7 days'),
    'leads_sem_enriquecimento', (select count(*) from public.leads where enriquecimento_data is null),
    'atividade', (select count(*) from public.extracoes where criado_em > now() - interval '3 days')
                 + (select count(*) from public.leads where criado_em > now() - interval '3 days')
  );
end $$;
grant execute on function public.agregar_prospeccao() to authenticated, service_role;

-- ABORDAGENS (WhatsApp outreach) ------------------------------
create or replace function public.agregar_abordagens()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conv int; v_resp int;
begin
  select count(*) into v_conv from public.wa_conversas;
  select count(*) into v_resp from public.wa_conversas where respondeu;
  return jsonb_build_object(
    'gerado_em', now(),
    'conversas', v_conv,
    'responderam', v_resp,
    'taxa_resposta_pct', case when v_conv > 0 then round(100.0 * v_resp / v_conv, 1) else 0 end,
    'minhas_mensagens', (select count(*) from public.wa_mensagens where from_me),
    'analises', (select count(*) from public.wa_analises),
    'por_resultado', (select coalesce(jsonb_object_agg(res, n), '{}'::jsonb)
                        from (select coalesce(resultado,'sem_resultado') res, count(*) n from public.wa_conversas group by 1) s),
    'licoes_ativas', (select count(*) from public.licoes_aprendidas
                        where dominio='outreach_whatsapp' and status in ('ativa','lei')),
    'atividade', (select count(*) from public.wa_conversas where ultima_msg_em > now() - interval '3 days')
  );
end $$;
grant execute on function public.agregar_abordagens() to authenticated, service_role;

-- CONTRATOS (ciclo de vida) -----------------------------------
create or replace function public.agregar_contratos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'gerado_em', now(),
    'total', (select count(*) from public.contratos),
    'por_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                     from (select status, count(*) n from public.contratos group by 1) s),
    'valor_total', (select coalesce(sum(valor_total),0) from public.contratos),
    'novos_30d', (select count(*) from public.contratos where criado_em > now() - interval '30 days'),
    'recorrencias_ativas', (select count(*) from public.recorrencias where ativo),
    'mrr', (select coalesce(sum(valor_mensal),0) from public.recorrencias where ativo),
    'parcelas_pendentes', (select count(*) from public.parcelas where data_pagamento is null),
    'atividade', (select count(*) from public.contratos where criado_em > now() - interval '7 days')
  );
end $$;
grant execute on function public.agregar_contratos() to authenticated, service_role;

-- TAREFAS -----------------------------------------------------
create or replace function public.agregar_tarefas()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'gerado_em', now(),
    'abertas', (select count(*) from public.tarefas where not concluida),
    'vencidas', (select count(*) from public.tarefas where not concluida and data_vencimento is not null and data_vencimento < now()),
    'a_vencer_7d', (select count(*) from public.tarefas where not concluida and data_vencimento between now() and now() + interval '7 days'),
    'por_prioridade', (select coalesce(jsonb_object_agg(prioridade, n), '{}'::jsonb)
                         from (select prioridade, count(*) n from public.tarefas where not concluida group by 1) s),
    'concluidas_7d', (select count(*) from public.tarefas where concluida and atualizado_em > now() - interval '7 days'),
    'atividade', (select count(*) from public.tarefas
                    where not concluida and data_vencimento is not null and data_vencimento < now() + interval '7 days')
  );
end $$;
grant execute on function public.agregar_tarefas() to authenticated, service_role;

-- ============================================================
-- CRON diário: analistas 11:00 UTC (08:00 BRT), orquestrador 11:15 UTC
-- Auth via Vault (segredo 'cron_secret').
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron')
     and exists (select 1 from pg_extension where extname='pg_net') then

    perform cron.unschedule('conselho-analistas')
      where exists (select 1 from cron.job where jobname='conselho-analistas');
    perform cron.schedule('conselho-analistas', '0 11 * * *', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/conselho-analista',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{}'::jsonb
      );
    $c$);

    perform cron.unschedule('conselho-briefing')
      where exists (select 1 from cron.job where jobname='conselho-briefing');
    perform cron.schedule('conselho-briefing', '15 11 * * *', $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/conselho-orquestrador',
        headers := jsonb_build_object('Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
        body := '{}'::jsonb
      );
    $c$);
  end if;
end $$;
