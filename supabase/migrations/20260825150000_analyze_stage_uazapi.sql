-- ============================================================
-- Religa analyze-lead-stage ao canal UazAPI (wa_*)
-- ============================================================

-- 1) controle de re-análise de estágio por conversa
alter table public.wa_conversas add column if not exists estagio_analisado_ate timestamptz;

-- 2) fila: leads que responderam, com conversa nova desde a última classificação
create or replace function public.wa_conversas_para_estagio(p_limite int default 25)
returns setof public.wa_conversas language sql stable set search_path = public as $$
  select * from public.wa_conversas
  where lead_id is not null
    and respondeu = true
    and ultima_msg_em < now() - interval '5 minutes'
    and (estagio_analisado_ate is null or ultima_msg_em > estagio_analisado_ate)
  order by ultima_msg_em desc
  limit p_limite;
$$;

-- 3) cron: classifica estágio a cada 15 min.
-- Auth via Vault: o segredo 'cron_secret' deve existir em vault.secrets
-- (setado fora da migration para não versionar o valor). Ver system_health/README.
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron')
     and exists (select 1 from pg_extension where extname='pg_net') then
    perform cron.unschedule('wa-classificar-estagio')
      where exists (select 1 from cron.job where jobname='wa-classificar-estagio');
    perform cron.schedule('wa-classificar-estagio', '*/15 * * * *',
      $c$
      select net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/analyze-lead-stage',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
      $c$);
  end if;
end $$;
