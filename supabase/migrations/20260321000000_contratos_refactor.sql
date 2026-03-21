-- ============================================================
-- Migration: Refatoração do módulo de Contratos
-- ============================================================

-- Modelos de contratos (arquivos .docx/.pdf enviados pelo usuário)
CREATE TABLE IF NOT EXISTS modelo_contratos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  nome VARCHAR(300) NOT NULL,
  tipo VARCHAR(10) NOT NULL, -- 'pdf' | 'docx'
  conteudo_texto TEXT,       -- texto extraído do arquivo
  arquivo_url TEXT,          -- URL no storage (opcional)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE modelo_contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_modelo_contratos_all" ON modelo_contratos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Perfil do prestador de serviços (salvo uma vez, reutilizado automaticamente)
CREATE TABLE IF NOT EXISTS perfil_prestador (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  nome_completo VARCHAR(300),
  cpf_cnpj VARCHAR(50),
  endereco TEXT,
  cidade_uf VARCHAR(100),
  telefone VARCHAR(50),
  email VARCHAR(200),
  nome_empresa VARCHAR(300),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE perfil_prestador ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_perfil_prestador_all" ON perfil_prestador
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Contratos preenchidos com IA
CREATE TABLE IF NOT EXISTS contratos_preenchidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  modelo_id UUID REFERENCES modelo_contratos(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  nome_cliente VARCHAR(300),
  conteudo_preenchido TEXT,
  dados_formulario JSONB,
  status VARCHAR(50) DEFAULT 'gerado',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_preenchidos_user ON contratos_preenchidos(user_id, created_at DESC);

ALTER TABLE contratos_preenchidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_contratos_preenchidos_all" ON contratos_preenchidos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
