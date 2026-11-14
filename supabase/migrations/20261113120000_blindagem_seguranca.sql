-- ============================================================================
-- Blindagem de segurança (2026-11-13)
--
-- Contexto: o sistema é single-tenant (só o dono opera), mas o banco confiava em
-- "estar autenticado" (auth.role() = 'authenticated' / USING true) e deixava o
-- papel anon com grants padrão. Com o signup público aberto, qualquer pessoa que
-- criasse conta lia/alterava leads, contratos, financeiro e PDFs.
--
-- Estratégia em camadas, sem reescrever as policies existentes:
--   1. public.e_dono(): o usuário da requisição é o dono (owner_id())?
--   2. Policy RESTRICTIVE "somente_dono" em TODA tabela de public: é AND com as
--      policies permissivas que já existem, então nenhuma delas libera nada para
--      quem não é o dono. service_role e postgres (cron) têm BYPASSRLS — inalterados.
--   3. anon perde todos os grants em public (tabelas, sequences, funções), inclusive
--      para objetos criados no futuro.
--   4. RPCs SECURITY DEFINER internas deixam de ser chamáveis pelo app.
--   5. resend_eventos ganha RLS; cai o INSERT público em leads (o site usa a
--      Edge Function capture-lead-website, que roda com service role).
--   6. Bucket contratos-pdf: só o dono.
--
-- Regra para tabela nova: rodar o bloco do passo 2 para ela (ou recriar a policy
-- somente_dono) — o DO abaixo só cobre as tabelas que existem hoje.
-- ============================================================================

begin;

-- 1. Quem é o dono ------------------------------------------------------------
create or replace function public.e_dono()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.uid() = public.owner_id(), false);
$$;

comment on function public.e_dono() is
  'true se o usuário da requisição é o dono do sistema (owner_id()). Base da policy somente_dono.';

-- 2. Policy restritiva em todas as tabelas de public --------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('drop policy if exists somente_dono on public.%I', t.relname);
    execute format(
      'create policy somente_dono on public.%I as restrictive for all to public '
      'using ((select public.e_dono())) with check ((select public.e_dono()))',
      t.relname
    );
  end loop;
end $$;

-- 5. INSERT anônimo em leads não é mais usado (o site passa pela Edge Function)
drop policy if exists "Formulário público pode inserir leads" on public.leads;

-- 3. anon fora de public --------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- O revoke de PUBLIC acima não pode tirar o acesso do app logado nem do backend.
grant execute on all functions in schema public to authenticated, service_role;

-- 4. RPCs SECURITY DEFINER internas: só backend (service_role) e cron (postgres)
revoke execute on function public.wa_processar_eventos()                    from authenticated;
revoke execute on function public.wa_sincronizar_lead(uuid)                 from authenticated;
revoke execute on function public.registrar_licao(text, text, text, text)  from authenticated;

-- system_health é chamada pela tela /configuracoes/saude (usuário logado), mas é
-- SECURITY DEFINER e ignora RLS: passa a recusar quem não é o dono.
create or replace function public.system_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_crons jsonb;
  v_emails_hoje int;
begin
  if not public.e_dono() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

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
end $function$;

-- create or replace preserva grants, mas reforça explicitamente
revoke execute on function public.system_health() from anon, public;
revoke execute on function public.e_dono()        from anon, public;
grant  execute on function public.system_health() to authenticated, service_role;
grant  execute on function public.e_dono()        to authenticated, service_role;

-- 6. Storage: PDFs de contrato só para o dono ----------------------------------
drop policy if exists somente_dono_contratos_pdf on storage.objects;
create policy somente_dono_contratos_pdf on storage.objects
  as restrictive for all to public
  using (bucket_id <> 'contratos-pdf' or (select public.e_dono()))
  with check (bucket_id <> 'contratos-pdf' or (select public.e_dono()));

commit;
