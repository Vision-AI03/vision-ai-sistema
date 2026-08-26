-- ============================================================================
-- Comunicações v2: listas automáticas por nicho + WhatsApp assistido
-- ============================================================================

-- ─── leads: link wa.me gerado + rastreio de toque WhatsApp ──────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_enviado_em TIMESTAMPTZ;

-- whatsapp_link: derivado deterministicamente do telefone normalizado.
-- Telefone deve ter ao menos 10 dígitos após strip de não-numéricos.
-- Prefixo 55 é adicionado quando ausente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'whatsapp_link'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN whatsapp_link TEXT GENERATED ALWAYS AS (
      CASE
        WHEN telefone IS NULL THEN NULL
        WHEN length(regexp_replace(telefone, '\D', '', 'g')) < 10 THEN NULL
        WHEN regexp_replace(telefone, '\D', '', 'g') ~ '^55' THEN
          'https://wa.me/' || regexp_replace(telefone, '\D', '', 'g')
        ELSE
          'https://wa.me/55' || regexp_replace(telefone, '\D', '', 'g')
      END
    ) STORED;
  END IF;
END $$;

-- ─── listas_email: lotes por nicho+cidade alimentados pela Prospecção ──────
CREATE TABLE IF NOT EXISTS public.listas_email (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho        TEXT NOT NULL,
  cidade       TEXT NOT NULL,
  lote         INTEGER NOT NULL,
  nome         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'aberta'
               CHECK (status IN ('aberta','completa','enviando','concluida')),
  copy_gerado  BOOLEAN NOT NULL DEFAULT false,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nicho, cidade, lote)
);

CREATE INDEX IF NOT EXISTS idx_listas_email_status ON public.listas_email(status);
CREATE INDEX IF NOT EXISTS idx_listas_email_nicho_cidade ON public.listas_email(nicho, cidade);

ALTER TABLE public.listas_email ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados podem ver listas_email" ON public.listas_email;
DROP POLICY IF EXISTS "Autenticados podem inserir listas_email" ON public.listas_email;
DROP POLICY IF EXISTS "Autenticados podem atualizar listas_email" ON public.listas_email;
DROP POLICY IF EXISTS "Autenticados podem deletar listas_email" ON public.listas_email;
CREATE POLICY "Autenticados podem ver listas_email"     ON public.listas_email FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem inserir listas_email" ON public.listas_email FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados podem atualizar listas_email" ON public.listas_email FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Autenticados podem deletar listas_email"  ON public.listas_email FOR DELETE TO authenticated USING (true);

-- ─── lista_membros: cada lead na lista, com copy/horário/status ────────────
CREATE TABLE IF NOT EXISTS public.lista_membros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id        UUID NOT NULL REFERENCES public.listas_email(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  validado        BOOLEAN,
  variacao_copy   INTEGER,
  assunto         TEXT,
  corpo           TEXT,
  horario_envio   TIMESTAMPTZ,
  status_envio    TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status_envio IN ('pendente','enviado','aberto','respondido','bounce','erro','descartado')),
  enviado_em      TIMESTAMPTZ,
  resend_id       TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lista_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lista_membros_lista ON public.lista_membros(lista_id);
CREATE INDEX IF NOT EXISTS idx_lista_membros_status ON public.lista_membros(status_envio);
CREATE INDEX IF NOT EXISTS idx_lista_membros_envio_due ON public.lista_membros(horario_envio)
  WHERE status_envio = 'pendente';

ALTER TABLE public.lista_membros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados podem ver lista_membros" ON public.lista_membros;
DROP POLICY IF EXISTS "Autenticados podem inserir lista_membros" ON public.lista_membros;
DROP POLICY IF EXISTS "Autenticados podem atualizar lista_membros" ON public.lista_membros;
DROP POLICY IF EXISTS "Autenticados podem deletar lista_membros" ON public.lista_membros;
CREATE POLICY "Autenticados podem ver lista_membros"     ON public.lista_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem inserir lista_membros" ON public.lista_membros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados podem atualizar lista_membros" ON public.lista_membros FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Autenticados podem deletar lista_membros"  ON public.lista_membros FOR DELETE TO authenticated USING (true);

-- ─── Trigger: lead com email entra automaticamente na lista aberta ─────────
-- Regras: validação de sintaxe + descarte de provedores de site genéricos.
-- Sem cidade no metadata → "Geral". Ao atingir 10 membros, lista vira 'completa'.
CREATE OR REPLACE FUNCTION public.add_lead_to_lista_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lista_id UUID;
  v_count    INTEGER;
  v_cidade   TEXT;
  v_nicho    TEXT;
  v_lote     INTEGER;
  v_email    TEXT;
BEGIN
  v_email := lower(coalesce(NEW.email, ''));
  IF v_email = '' THEN RETURN NEW; END IF;

  -- Sintaxe básica
  IF v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RETURN NEW; END IF;

  -- Descarta provedores genéricos de site
  IF v_email ~ '^(noreply|no-reply|donotreply|exemplo|example|test|admin|webmaster|postmaster|mailer-daemon)@' THEN
    RETURN NEW;
  END IF;

  v_nicho  := coalesce(NEW.segmento, NEW.origem_metadata->>'nicho', 'Sem nicho');
  v_cidade := coalesce(NEW.origem_metadata->>'cidade', 'Geral');

  SELECT id INTO v_lista_id
  FROM public.listas_email
  WHERE nicho = v_nicho AND cidade = v_cidade AND status = 'aberta'
  ORDER BY lote DESC
  LIMIT 1;

  IF v_lista_id IS NULL THEN
    SELECT coalesce(max(lote), 0) + 1 INTO v_lote
    FROM public.listas_email
    WHERE nicho = v_nicho AND cidade = v_cidade;

    INSERT INTO public.listas_email(nicho, cidade, lote, nome, status)
    VALUES (
      v_nicho, v_cidade, v_lote,
      v_nicho || ' · ' || v_cidade || ' · Lote ' || v_lote,
      'aberta'
    )
    RETURNING id INTO v_lista_id;
  END IF;

  INSERT INTO public.lista_membros(lista_id, lead_id, email)
  VALUES (v_lista_id, NEW.id, v_email)
  ON CONFLICT (lista_id, lead_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.lista_membros WHERE lista_id = v_lista_id;
  IF v_count >= 10 THEN
    UPDATE public.listas_email SET status = 'completa' WHERE id = v_lista_id AND status = 'aberta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_lead_to_lista_email ON public.leads;
CREATE TRIGGER trg_add_lead_to_lista_email
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.add_lead_to_lista_email();

-- ─── Helper RPC: contador de envios do dia (cap diário) ────────────────────
CREATE OR REPLACE FUNCTION public.emails_enviados_hoje()
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT count(*)::int
  FROM public.lista_membros
  WHERE status_envio IN ('enviado','aberto','respondido')
    AND enviado_em >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo';
$$;

-- ─── pg_cron: envio dos emails agendados a cada 15 min ─────────────────────
-- Requer pg_cron + pg_net já habilitados no projeto.
-- O segredo do cron vive no Vault (name = 'cron_secret') porque o Postgres
-- gerenciado do Supabase bloqueia `ALTER DATABASE ... SET` (sem superuser).
-- O mesmo valor precisa estar no secret CRON_SECRET da Edge Function.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('comunicacoes-send-scheduled-15min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comunicacoes-send-scheduled-15min');
    PERFORM cron.schedule(
      'comunicacoes-send-scheduled-15min',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://sfezwprbanvxsnwgvkhh.supabase.co/functions/v1/send-scheduled-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;

-- ============================================================================
-- Backfill: para leads existentes com email, aplica a mesma lógica do trigger
-- manualmente (trigger é AFTER INSERT, não rodaria em update no-op).
-- whatsapp_link é coluna gerada — já populada automaticamente.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
  v_lista_id UUID;
  v_count INTEGER;
  v_cidade TEXT;
  v_nicho TEXT;
  v_lote INTEGER;
  v_email TEXT;
BEGIN
  FOR r IN SELECT id, email, segmento, origem_metadata FROM public.leads WHERE email IS NOT NULL LOOP
    v_email := lower(r.email);
    IF v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN CONTINUE; END IF;
    IF v_email ~ '^(noreply|no-reply|donotreply|exemplo|example|test|admin|webmaster|postmaster|mailer-daemon)@' THEN CONTINUE; END IF;

    v_nicho  := coalesce(r.segmento, r.origem_metadata->>'nicho', 'Sem nicho');
    v_cidade := coalesce(r.origem_metadata->>'cidade', 'Geral');

    SELECT id INTO v_lista_id FROM public.listas_email
      WHERE nicho = v_nicho AND cidade = v_cidade AND status = 'aberta'
      ORDER BY lote DESC LIMIT 1;

    IF v_lista_id IS NULL THEN
      SELECT coalesce(max(lote), 0) + 1 INTO v_lote FROM public.listas_email
        WHERE nicho = v_nicho AND cidade = v_cidade;
      INSERT INTO public.listas_email(nicho, cidade, lote, nome, status)
      VALUES (v_nicho, v_cidade, v_lote, v_nicho || ' · ' || v_cidade || ' · Lote ' || v_lote, 'aberta')
      RETURNING id INTO v_lista_id;
    END IF;

    INSERT INTO public.lista_membros(lista_id, lead_id, email)
    VALUES (v_lista_id, r.id, v_email)
    ON CONFLICT (lista_id, lead_id) DO NOTHING;

    SELECT count(*) INTO v_count FROM public.lista_membros WHERE lista_id = v_lista_id;
    IF v_count >= 10 THEN
      UPDATE public.listas_email SET status = 'completa' WHERE id = v_lista_id AND status = 'aberta';
    END IF;
  END LOOP;
END $$;
