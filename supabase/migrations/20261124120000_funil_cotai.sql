-- FUNIL COT-AI — Vision AI
-- Estágios do funil real (COT-AI como porta de entrada) + fechamento da implantação
-- que já lança contrato, parcelas e recorrência no Financeiro.
--
-- Também corrige bug latente: a constraint não aceitava 'respondeu', então
-- wa_sincronizar_lead falhava em toda resposta de cliente e o bloco de exceção do
-- wa_processar_eventos descartava a mensagem inteira (só mensagens from_me entravam).

-- 1) Estágios ------------------------------------------------------------------
-- Mantém os valores legados (qualificado, reuniao_agendada, proposta_enviada,
-- fechado, baixa_prioridade, enriquecendo) para não quebrar linhas antigas.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'novo', 'enriquecendo', 'enriquecido', 'contatado', 'respondeu',
  'rotas_recebidas', 'cotacao_enviada', 'onboarding_agendado',
  'implantacao', 'assinante', 'upsell', 'perdido',
  'qualificado', 'reuniao_agendada', 'proposta_enviada', 'fechado', 'baixa_prioridade'
));

-- 2) Vínculo contrato ↔ lead -----------------------------------------------------
alter table public.contratos add column if not exists lead_id uuid
  references public.leads(id) on delete set null;
create index if not exists contratos_lead_id_idx on public.contratos(lead_id);

-- 3) Fechar implantação ----------------------------------------------------------
-- Cria contrato COT-AI ativo + parcela da implantação (hoje) + parcela da 1ª
-- mensalidade (30 dias) + recorrência ativa, e move o lead para 'implantacao'.
create or replace function public.fechar_implantacao_cotai(
  p_lead_id uuid,
  p_valor_mensal numeric,
  p_valor_implantacao numeric default 500
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        public.leads;
  v_contrato_id uuid;
  v_primeira    date := current_date + 30;
begin
  if not public.e_dono() then
    raise exception 'não autorizado';
  end if;
  if coalesce(p_valor_mensal, 0) <= 0 then
    raise exception 'informe o valor da mensalidade';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead não encontrado';
  end if;

  insert into public.contratos
    (cliente_nome, cliente_email, cliente_telefone, tipo_servico, status, valor_total, lead_id)
  values (
    coalesce(nullif(v_lead.empresa, ''), v_lead.nome),
    case when v_lead.email like '%@whatsapp.local' then null else v_lead.email end,
    v_lead.telefone,
    'cot_ai', 'ativo', coalesce(p_valor_implantacao, 0), p_lead_id
  )
  returning id into v_contrato_id;

  if coalesce(p_valor_implantacao, 0) > 0 then
    insert into public.parcelas (contrato_id, descricao, valor, data_vencimento, status)
    values (v_contrato_id, 'Implantação COT-AI', p_valor_implantacao, current_date, 'pendente');
  end if;

  insert into public.parcelas (contrato_id, descricao, valor, data_vencimento, status)
  values (v_contrato_id, '1ª mensalidade COT-AI', p_valor_mensal, v_primeira, 'pendente');

  insert into public.recorrencias (contrato_id, valor_mensal, dia_vencimento, ativo)
  values (v_contrato_id, p_valor_mensal, least(extract(day from v_primeira)::int, 28), true);

  update public.leads
    set status = 'implantacao', status_mudou_em = now()
    where id = p_lead_id;

  return v_contrato_id;
end $$;

revoke execute on function public.fechar_implantacao_cotai(uuid, numeric, numeric) from anon, public;
grant execute on function public.fechar_implantacao_cotai(uuid, numeric, numeric) to authenticated;

-- 4) Assinante automático --------------------------------------------------------
-- Pagou a 1ª mensalidade → lead vira 'assinante' (só avança quem está em implantação).
create or replace function public.fn_lead_assinante_ao_pagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pago' and old.status is distinct from 'pago'
     and new.descricao = '1ª mensalidade COT-AI' then
    update public.leads l
      set status = 'assinante', status_mudou_em = now()
      from public.contratos c
      where c.id = new.contrato_id and l.id = c.lead_id and l.status = 'implantacao';
  end if;
  return new;
end $$;

revoke execute on function public.fn_lead_assinante_ao_pagar() from anon, public;

drop trigger if exists trg_lead_assinante_ao_pagar on public.parcelas;
create trigger trg_lead_assinante_ao_pagar
  after update of status on public.parcelas
  for each row execute function public.fn_lead_assinante_ao_pagar();
