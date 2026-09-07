-- Importação manual de listas: contatos vindos de arquivo (CSV/XLSX/PDF) não são
-- leads do CRM — são só endereços para uma campanha. Antes, lista_membros exigia
-- lead_id NOT NULL, o que forçava criar um lead para cada e-mail importado e
-- inflava o Kanban com contatos que nunca entraram no funil.
--
-- Agora lead_id é opcional. Quando o membro veio da Prospecção, ele continua
-- apontando para o lead (e a personalização usa leads.empresa). Quando veio de
-- arquivo, nome/empresa ficam no próprio membro e alimentam a mesma personalização.

alter table public.lista_membros
  alter column lead_id drop not null;

alter table public.lista_membros
  add column if not exists nome    text,
  add column if not exists empresa text;

comment on column public.lista_membros.lead_id is
  'Lead de origem quando o membro veio da Prospecção. NULL para contato importado de arquivo.';
comment on column public.lista_membros.nome is
  'Nome do contato para membros sem lead (importação manual). Com lead, prefira leads.nome.';
comment on column public.lista_membros.empresa is
  'Empresa do contato para membros sem lead (importação manual). Com lead, prefira leads.empresa.';

-- A UNIQUE (lista_id, lead_id) original não protege mais contra e-mail duplicado
-- na mesma lista, porque no Postgres vários NULL não colidem. Índice parcial cobre
-- exatamente o caso novo: contato avulso não pode repetir e-mail dentro da lista.
create unique index if not exists lista_membros_email_por_lista_sem_lead
  on public.lista_membros (lista_id, email)
  where lead_id is null;
