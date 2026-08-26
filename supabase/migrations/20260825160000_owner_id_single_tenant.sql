-- ============================================================
-- Sistema é single-tenant (founder solo). owner_id() devolve o dono canônico
-- (primeiro usuário criado). Usado onde código precisava enumerar usuários
-- (relatório semanal, análise de estágio) — evita depender de whatsapp_config
-- ou de listUsers(). Ver CLAUDE.md → Convenções.
-- ============================================================
create or replace function public.owner_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users order by created_at asc limit 1;
$$;

grant execute on function public.owner_id() to authenticated, service_role;
