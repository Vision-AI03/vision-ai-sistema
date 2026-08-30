-- ============================================================
-- RADAR DE MERCADO — Chat de pesquisa sob demanda.
-- Você pergunta um tema, a IA (Claude + web_search) busca e responde com fontes.
-- Single-tenant (sem user_id), igual às demais tabelas mercado_*.
-- ============================================================

create table if not exists public.radar_chat_threads (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null default 'Nova conversa',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.radar_chat_mensagens (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.radar_chat_threads(id) on delete cascade,
  papel      text not null check (papel in ('user','assistant')),
  conteudo   text not null,
  fontes     jsonb,                       -- [{url,titulo}] nas respostas do assistente
  criado_em  timestamptz not null default now()
);

create index if not exists idx_radar_chat_msg_thread on public.radar_chat_mensagens (thread_id, criado_em);
create index if not exists idx_radar_chat_threads_atualizado on public.radar_chat_threads (atualizado_em desc);

alter table public.radar_chat_threads   enable row level security;
alter table public.radar_chat_mensagens enable row level security;

-- Threads: CRUD autenticado
drop policy if exists "leitura_autenticado" on public.radar_chat_threads;
create policy "leitura_autenticado" on public.radar_chat_threads for select to authenticated using (true);
drop policy if exists "insert_autenticado" on public.radar_chat_threads;
create policy "insert_autenticado" on public.radar_chat_threads for insert to authenticated with check (true);
drop policy if exists "update_autenticado" on public.radar_chat_threads;
create policy "update_autenticado" on public.radar_chat_threads for update to authenticated using (true) with check (true);
drop policy if exists "delete_autenticado" on public.radar_chat_threads;
create policy "delete_autenticado" on public.radar_chat_threads for delete to authenticated using (true);

-- Mensagens: leitura + delete autenticado (a escrita é feita pela Edge Function via service role)
drop policy if exists "leitura_autenticado" on public.radar_chat_mensagens;
create policy "leitura_autenticado" on public.radar_chat_mensagens for select to authenticated using (true);
drop policy if exists "insert_autenticado" on public.radar_chat_mensagens;
create policy "insert_autenticado" on public.radar_chat_mensagens for insert to authenticated with check (true);
drop policy if exists "delete_autenticado" on public.radar_chat_mensagens;
create policy "delete_autenticado" on public.radar_chat_mensagens for delete to authenticated using (true);
