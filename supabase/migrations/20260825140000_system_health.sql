-- ============================================================
-- system_health(): agrega saude operacional para a tela /configuracoes/saude
-- security definer: le cron.job e wa_eventos_brutos (sem policy p/ authenticated)
-- ============================================================
create or replace function public.system_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crons jsonb;
  v_emails_hoje int;
begin
  begin
    select coalesce(jsonb_agg(
             jsonb_build_object('jobname', jobname, 'schedule', schedule, 'active', active)
             order by jobname), '[]'::jsonb)
      into v_crons from cron.job;
  exception when others then
    v_crons := '[]'::jsonb;
  end;

  begin
    v_emails_hoje := public.emails_enviados_hoje();
  exception when others then
    v_emails_hoje := null;
  end;

  return jsonb_build_object(
    'gerado_em', now(),
    'crons', v_crons,
    'wa', jsonb_build_object(
      'eventos_pendentes', (select count(*) from public.wa_eventos_brutos where processado = false),
      'eventos_erro_24h',  (select count(*) from public.wa_eventos_brutos
                              where erro is not null
                                and erro not in ('grupo ignorado','contato ignorado','evento nao-mensagem')
                                and recebido_em > now() - interval '24 hours'),
      'ultimo_evento',     (select max(recebido_em) from public.wa_eventos_brutos),
      'conversas',         (select count(*) from public.wa_conversas),
      'mensagens',         (select count(*) from public.wa_mensagens),
      'minhas_mensagens',  (select count(*) from public.wa_mensagens where from_me),
      'bloqueados',        (select count(*) from public.wa_ignorados)
    ),
    'leads', jsonb_build_object(
      'total',                 (select count(*) from public.leads),
      'enriquecidos',          (select count(*) from public.leads where enriquecimento_data is not null),
      'ultimo_enriquecimento', (select max(enriquecimento_data) from public.leads),
      'via_whatsapp',          (select count(*) from public.leads where origem = 'whatsapp')
    ),
    'emails_hoje', v_emails_hoje,
    'licoes_ativas', (select count(*) from public.licoes_aprendidas where status in ('ativa','lei'))
  );
end $$;

grant execute on function public.system_health() to authenticated;
