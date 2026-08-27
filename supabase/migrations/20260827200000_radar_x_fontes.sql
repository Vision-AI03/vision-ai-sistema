-- ============================================================
-- RADAR DE MERCADO — Fase B2: seed de fontes do X (executivos/pesquisadores IA).
-- Editáveis pela tela /radar. Coleta via Apify (radar-x-coletar/webhook).
-- ============================================================
insert into public.mercado_fontes (tipo, nome, url) values
  ('x', 'Sam Altman (OpenAI)',       '@sama'),
  ('x', 'OpenAI',                    '@OpenAI'),
  ('x', 'Anthropic',                 '@AnthropicAI'),
  ('x', 'Google DeepMind',           '@GoogleDeepMind'),
  ('x', 'Andrej Karpathy',           '@karpathy'),
  ('x', 'Andrew Ng',                 '@AndrewYNg'),
  ('x', 'Yann LeCun',                '@ylecun'),
  ('x', 'Mistral AI',                '@MistralAI')
on conflict (url) do nothing;
