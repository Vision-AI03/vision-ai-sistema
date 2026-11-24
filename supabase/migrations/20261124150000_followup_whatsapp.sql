-- FILA "NÃO DEIXE ESFRIAR" — Vision AI
-- Leads ativos do funil cuja conversa no WhatsApp parou:
--   aguardando_voce → o cliente falou por último (há mais de 1h)
--   esfriando       → você falou por último e o cliente sumiu (2 dias; 3 se só abordado)
-- A tela /hoje lista, a IA redige o próximo passo e o envio sai pela UazAPI (wa-followup).

alter table public.leads add column if not exists followup_adiado_ate timestamptz;

-- SECURITY INVOKER: roda com o RLS do dono (somente_dono) nas tabelas lidas.
create or replace function public.followups_pendentes()
returns table (
  lead_id uuid,
  nome text,
  empresa text,
  telefone text,
  status text,
  tipo text,
  ultima_msg_em timestamptz,
  ultima_msg_texto text,
  ultima_msg_from_me boolean,
  horas_parado int
)
language sql
stable
set search_path = public
as $$
  with ultima as (
    select distinct on (c.lead_id)
      c.lead_id, m.enviada_em, m.conteudo, m.from_me, m.tipo
    from public.wa_conversas c
    join public.wa_mensagens m on m.conversa_id = c.id
    where c.lead_id is not null
    order by c.lead_id, m.enviada_em desc
  )
  select
    l.id, l.nome, l.empresa, l.telefone, l.status,
    case when u.from_me then 'esfriando' else 'aguardando_voce' end,
    u.enviada_em,
    coalesce(u.conteudo, '[' || u.tipo || ']'),
    u.from_me,
    (extract(epoch from now() - u.enviada_em) / 3600)::int
  from public.leads l
  join ultima u on u.lead_id = l.id
  where l.status in ('contatado', 'respondeu', 'rotas_recebidas', 'cotacao_enviada', 'onboarding_agendado')
    and (l.followup_adiado_ate is null or l.followup_adiado_ate < now())
    and u.enviada_em > now() - interval '30 days'
    and (
      (not u.from_me and u.enviada_em < now() - interval '1 hour')
      or (u.from_me and l.status <> 'contatado' and u.enviada_em < now() - interval '2 days')
      or (u.from_me and l.status = 'contatado' and u.enviada_em < now() - interval '3 days')
    )
  order by (not u.from_me) desc, u.enviada_em asc;
$$;

revoke execute on function public.followups_pendentes() from anon, public;
grant execute on function public.followups_pendentes() to authenticated;
