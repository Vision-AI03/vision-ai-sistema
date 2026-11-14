-- Projeto: Sistem Central - Vision AI (sfezwprbanvxsnwgvkhh)
-- Renovação automática dos tokens do Instagram.
-- O token longo do Instagram Login vale 60 dias e precisa ser renovado; como Edge Function
-- não consegue alterar os próprios secrets, o token vivo passa a morar no Vault
-- (vault.secrets, nome ig_token_<conta>). Os secrets IG_TOKEN_* ficam só como semente.

-- Status visível no app (sem o token).
create table if not exists public.instagram_tokens (
  conta        text primary key check (conta in ('vision_ai', 'cot_ai')),
  expira_em    timestamptz,
  renovado_em  timestamptz,
  erro         text,
  atualizado_em timestamptz not null default now()
);

alter table public.instagram_tokens enable row level security;

drop policy if exists somente_dono on public.instagram_tokens;
create policy somente_dono on public.instagram_tokens
  for all
  using ((select e_dono()))
  with check ((select e_dono()));

-- Lê o token do Vault (null se ainda não foi semeado).
create or replace function public.ig_token_ler(p_conta text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ig_token_' || p_conta;
$$;

-- Grava/atualiza o token no Vault e registra a validade.
create or replace function public.ig_token_salvar(p_conta text, p_token text, p_expira_em timestamptz)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_conta not in ('vision_ai', 'cot_ai') then
    raise exception 'Conta inválida: %', p_conta;
  end if;

  select id into v_id from vault.secrets where name = 'ig_token_' || p_conta;
  if v_id is null then
    perform vault.create_secret(p_token, 'ig_token_' || p_conta, 'Token Instagram Login (renovado automaticamente)');
  else
    perform vault.update_secret(v_id, p_token);
  end if;

  insert into public.instagram_tokens (conta, expira_em, renovado_em, erro, atualizado_em)
  values (p_conta, p_expira_em, now(), null, now())
  on conflict (conta) do update
    set expira_em = excluded.expira_em, renovado_em = now(), erro = null, atualizado_em = now();
end;
$$;

revoke all on function public.ig_token_ler(text) from public, anon, authenticated;
revoke all on function public.ig_token_salvar(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ig_token_ler(text) to service_role;
grant execute on function public.ig_token_salvar(text, text, timestamptz) to service_role;

-- Cron semanal (segunda 06:00 UTC). Renovar com folga mantém o token sempre com ~60 dias.
select cron.schedule(
  'renovar-tokens-instagram-semanal',
  '0 6 * * 1',
  $cron$
  select net.http_post(
    url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/publicar-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"acao": "renovar_tokens"}'::jsonb
  );
  $cron$
);
