import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const TIPO_SERVICO_LABELS: Record<string, string> = {
  agente_ia: "Agente de IA (automação com LLMs, chatbots inteligentes, assistentes virtuais)",
  automacao: "Automação de Processos (n8n, Make, Zapier, integrações entre sistemas)",
  sistema: "Sistema Personalizado (desenvolvimento de software sob medida com IA embarcada)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { lead_id, tipo_servico, contexto_cliente, titulo } = await req.json();
  if (!tipo_servico || !contexto_cliente) {
    return new Response(JSON.stringify({ error: "tipo_servico and contexto_cliente are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca dados do lead se fornecido
  let leadInfo = "";
  if (lead_id) {
    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (lead) {
      leadInfo = `
**Dados do Lead:**
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "Não informado"}
- Segmento: ${lead.segmento || "Não informado"}
- Cargo: ${lead.linkedin_cargo || "Não informado"}
- Dores Identificadas: ${lead.dores_identificadas || "Não mapeadas"}
- Oportunidades: ${lead.oportunidades || "Não mapeadas"}
- Resumo da Empresa: ${lead.resumo_empresa || "Não disponível"}
- Maturidade Digital: ${lead.nivel_maturidade_digital || "Não avaliada"}
`;
    }
  }

  const tipoLabel = TIPO_SERVICO_LABELS[tipo_servico] || tipo_servico;

  const valorInfo = "A definir conforme escopo final";

  const prompt = `Você é um especialista em criação de propostas comerciais visuais de alto impacto para agências de IA. Gere uma proposta comercial completa em HTML com design profissional, visual moderno e estrutura persuasiva.

CONTEXTO RECEBIDO:
- Tipo de serviço: ${tipoLabel}
- Título: ${titulo || "Proposta Comercial Vision AI"}
- Valor estimado: ${valorInfo}
- Contexto do cliente: ${contexto_cliente}
- Dados do prestador: Vision AI - Wesley Augusto Silva de Paula
${leadInfo}

ESTRUTURA OBRIGATÓRIA DA PROPOSTA (8 seções):

1. CAPA (hero section)
- Fundo com gradiente azul escuro (#0f172a para #1e3a5f) ocupando 100% da largura
- Logo/nome "VISION AI" em destaque no topo esquerdo
- Título da proposta centralizado em branco, fonte grande (48px)
- Subtítulo com o nome do cliente/empresa
- Tagline motivacional relacionada ao serviço

2. DESAFIOS ATUAIS DO CLIENTE
- Título da seção em azul escuro
- Grid 2x2 com 4 cards de problemas que o cliente enfrenta
- Cada card: ícone SVG simples, título em negrito, descrição curta
- Fundo dos cards: branco com borda cinza suave e sombra leve

3. NOSSA SOLUÇÃO
- Título da seção centralizado
- Grid 2x2 com os 4 principais recursos/funcionalidades da solução
- Cada card: ícone SVG colorido em azul (#3b82f6), título, descrição
- Fundo levemente azulado (#f0f7ff)

4. BENEFÍCIOS ESPECÍFICOS PARA O CLIENTE
- Título personalizado com o nome do cliente/segmento
- 4 benefícios em cards com ícones SVG
- Métricas ou resultados esperados quando possível
- Layout alternado: ícone à esquerda, texto à direita

5. PROCESSO DE IMPLEMENTAÇÃO
- Timeline horizontal com 4 etapas numeradas
- Linha conectando as etapas em azul
- Cada etapa: número em círculo azul, título, descrição breve
- Fundo branco

6. INVESTIMENTO
- Apresentar o valor de forma clara e profissional
- Mostrar o que está incluído em lista com checkmarks (✓) em verde
- Destacar o ROI esperado ou payback estimado
- Se possível, mostrar 2-3 opções/planos
- Fundo azul escuro com texto branco para destacar

7. PRÓXIMOS PASSOS
- 3 passos numerados para fechar o negócio
- Chamada para ação clara e urgente
- Imagem ou visual de fundo profissional (use gradiente)
- Botão/destaque com oferta especial se aplicável

8. RODAPÉ DE CONTATO
- Dados da Vision AI: Wesley Augusto Silva de Paula
- WhatsApp: (19) 99794-8118
- Email: wesleyvisionai@gmail.com
- Site: agenciavisionai.com
- Fundo azul escuro

REGRAS TÉCNICAS OBRIGATÓRIAS DE DESIGN:

Paleta de cores:
- Primária: #1e3a5f (azul escuro)
- Secundária: #3b82f6 (azul médio)
- Accent: #06b6d4 (ciano)
- Texto: #1e293b
- Fundo seções alternadas: #f8fafc e #f0f7ff
- Destaques: #ffffff sobre fundo escuro

Tipografia:
- Font-family: 'Segoe UI', system-ui, sans-serif
- H1: 48px bold, H2: 32px semibold, H3: 20px semibold
- Body: 16px, line-height: 1.6
- Cor títulos seções: #1e3a5f

Layout:
- Largura máxima: 900px, centralizado com margin: 0 auto
- Padding seções: 60px 40px
- Border-radius cards: 12px
- Box-shadow cards: 0 4px 6px rgba(0,0,0,0.07)
- Gap grids: 24px

Ícones: Use SVGs inline simples (círculo, seta, check, robô, calendário, gráfico, chat, engrenagem, estrela, usuário) — sem dependências externas

=== REGRAS CRÍTICAS DE PAGINAÇÃO PARA PDF ===
O HTML gerado será convertido para PDF com quebras de página automáticas.
Inclua obrigatoriamente no <style>:

@page { size: A4; margin: 0; }
body { margin: 0; padding: 0; width: 210mm; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
h1, h2, h3, h4 { page-break-after: avoid !important; break-after: avoid !important; }
img { page-break-inside: avoid !important; max-width: 100% !important; }
p, li { page-break-inside: avoid !important; orphans: 3; widows: 3; }
section, .section, .card { page-break-inside: avoid !important; break-inside: avoid !important; }
.hero, .capa { page-break-after: avoid !important; }
table, tr { page-break-inside: avoid !important; }

FORMATO DE SAÍDA:
Retorne APENAS o HTML completo começando com <!DOCTYPE html> e terminando com </html>. Sem markdown, sem explicações, sem \`\`\`html. Apenas o HTML puro.
O documento deve ter no mínimo 8 seções visuais bem definidas, ser persuasivo, profissional e específico para o nicho/serviço informado.`;

  try {
    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      }),
    });

    const aiData = await aiRes.json();
    const conteudo = aiData.choices?.[0]?.message?.content || "";

    if (!conteudo) {
      throw new Error("AI returned empty response");
    }

    return new Response(JSON.stringify({ success: true, conteudo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI error:", e);
    return new Response(JSON.stringify({ error: "AI generation failed", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  } catch (e) {
    console.error("Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
