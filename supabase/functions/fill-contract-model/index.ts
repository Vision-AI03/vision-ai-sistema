import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
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

  const {
    modelo_texto,
    dados_prestador,
    dados_cliente,
    valores,
  } = await req.json();

  if (!modelo_texto) {
    return new Response(JSON.stringify({ error: "modelo_texto is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const prompt = `Você é um assistente especializado em preenchimento de contratos jurídicos brasileiros.

Seu trabalho é preencher o contrato abaixo substituindo TODOS os campos variáveis pelos valores reais fornecidos.

REGRAS IMPORTANTES:
1. Substitua TODOS os placeholders no formato {{VARIAVEL}}, [CAMPO], _______________ ou similares pelos valores reais
2. Mantenha a formatação original do contrato (parágrafos, numerações, estrutura)
3. Se algum dado não foi fornecido, deixe um espaço em branco razoável ou use um placeholder descritivo em colchetes
4. Data atual: ${dataAtual}
5. Retorne APENAS o texto do contrato preenchido, sem comentários adicionais

DADOS DO PRESTADOR DE SERVIÇOS:
- Nome Completo: ${dados_prestador?.nome_completo || "Não informado"}
- CPF/CNPJ: ${dados_prestador?.cpf_cnpj || "Não informado"}
- Endereço: ${dados_prestador?.endereco || "Não informado"}
- Cidade/UF: ${dados_prestador?.cidade_uf || "Não informado"}
- Telefone: ${dados_prestador?.telefone || "Não informado"}
- E-mail: ${dados_prestador?.email || "Não informado"}
- Nome da Empresa: ${dados_prestador?.nome_empresa || "Não informado"}

DADOS DO CLIENTE (CONTRATANTE):
- Nome Completo: ${dados_cliente?.nome_completo || "Não informado"}
- CPF/CNPJ: ${dados_cliente?.cpf_cnpj || "Não informado"}
- Endereço: ${dados_cliente?.endereco || "Não informado"}
- Cidade/UF: ${dados_cliente?.cidade_uf || "Não informado"}
- Telefone: ${dados_cliente?.telefone || "Não informado"}
- E-mail: ${dados_cliente?.email || "Não informado"}

VALORES E ESCOPO:
- Descrição do Serviço: ${valores?.descricao_servico || "Não informado"}
- Valor do Setup (implantação): R$ ${valores?.valor_setup ? Number(valores.valor_setup).toFixed(2).replace(".", ",") : "Não informado"}
- Valor da Mensalidade: R$ ${valores?.valor_mensalidade ? Number(valores.valor_mensalidade).toFixed(2).replace(".", ",") : "Não informado"}
- Data de Início: ${valores?.data_inicio || "Não informado"}
- Vigência: ${valores?.vigencia_meses ? `${valores.vigencia_meses} meses` : "Não informado"}

TEXTO DO MODELO DE CONTRATO:
${modelo_texto}

Preencha agora o contrato completo substituindo todos os campos:`;

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
        temperature: 0.2,
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
    return new Response(JSON.stringify({ error: "AI fill failed", details: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
