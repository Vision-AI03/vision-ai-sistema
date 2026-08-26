import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Janelas úteis BRT ──────────────────────────────────────────────────────
// seg–sex, 9:00–11:30 e 14:00–16:30, hora de Brasília (UTC-3).
// Intervalo aleatório entre envios: 7–23 minutos.
// Retorna timestamps UTC para gravar como timestamptz.
const BRT_OFFSET_MIN = -180; // -3h
const WINDOWS_BRT: Array<[number, number, number, number]> = [
  [9, 0, 11, 30],
  [14, 0, 16, 30],
];

function nowBrtMinutes(): Date {
  const now = new Date();
  return new Date(now.getTime() + BRT_OFFSET_MIN * 60_000);
}

function isBusinessDay(dBrt: Date): boolean {
  const wd = dBrt.getUTCDay(); // dom=0, sex=5, sab=6
  return wd >= 1 && wd <= 5;
}

function nextWindowStart(fromBrt: Date): Date {
  // Encontra o próximo início de janela útil >= fromBrt
  const d = new Date(fromBrt);
  for (let day = 0; day < 14; day++) {
    if (day > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
    }
    if (!isBusinessDay(d)) continue;
    for (const [h1, m1, h2, m2] of WINDOWS_BRT) {
      const start = new Date(d);
      start.setUTCHours(h1, m1, 0, 0);
      const end = new Date(d);
      end.setUTCHours(h2, m2, 0, 0);
      if (day === 0 && fromBrt > end) continue;
      if (day === 0 && fromBrt > start) return new Date(fromBrt);
      return start;
    }
  }
  return d;
}

function withinWindow(brt: Date): boolean {
  if (!isBusinessDay(brt)) return false;
  for (const [h1, m1, h2, m2] of WINDOWS_BRT) {
    const start = new Date(brt); start.setUTCHours(h1, m1, 0, 0);
    const end = new Date(brt); end.setUTCHours(h2, m2, 0, 0);
    if (brt >= start && brt <= end) return true;
  }
  return false;
}

function brtToUtc(brt: Date): Date {
  return new Date(brt.getTime() - BRT_OFFSET_MIN * 60_000);
}

function scheduleSlots(n: number): string[] {
  // Começa pelo menos 1h após agora para dar tempo de revisão humana
  const startBrt = nextWindowStart(new Date(nowBrtMinutes().getTime() + 60 * 60_000));
  const slots: string[] = [];
  let cursor = startBrt;
  for (let i = 0; i < n; i++) {
    if (!withinWindow(cursor)) cursor = nextWindowStart(cursor);
    slots.push(brtToUtc(cursor).toISOString());
    const gapMin = 7 + Math.floor(Math.random() * 17); // 7..23
    cursor = new Date(cursor.getTime() + gapMin * 60_000);
  }
  return slots;
}

interface Variacao {
  assunto: string;
  corpo: string;
}

async function gerarVariacoes(nicho: string, cidade: string): Promise<Variacao[]> {
  const system = `Você é copywriter sênior B2B em PT-BR. Gera cold emails curtos, específicos, sem cheiro de template.

REGRAS ABSOLUTAS:
- Máximo 110 palavras de corpo.
- Tom direto, conversacional. Estilo Hormozi: específico da operação do lead, sem floreio.
- 1 link no máximo, sem imagem, sem emojis.
- Assunto curto (até 60 chars), SEM palavras-trigger de spam (grátis, promoção, urgente, ganhe, oportunidade).
- Personalize SEMPRE com {{empresa}} e {{cidade}}.
- CTA = pergunta fácil de responder (sim/não ou "qual é o seu caso?"). NUNCA "agendar reunião de 30 min".
- Mesma oferta nas 3 variações; ângulo/abertura/CTA diferentes.

OFERTA Vision AI para ${nicho}: IA que automatiza prospecção, atendimento por WhatsApp e qualificação de leads — reduz tempo manual em 60–80%.`;

  const user = `Gere 3 variações de cold email para empresas do nicho "${nicho}" em "${cidade}".

Cada variação com ângulo diferente:
1. Dor operacional concreta do nicho
2. Resultado/benefício mensurável
3. Pergunta-provocação curta

Use os placeholders literais {{empresa}} e {{cidade}} no corpo (serão substituídos depois).

Retorne SOMENTE JSON neste schema:
{
  "variacoes": [
    {"assunto": "...", "corpo": "..."},
    {"assunto": "...", "corpo": "..."},
    {"assunto": "...", "corpo": "..."}
  ]
}`;

  const raw = await callClaude({
    model: MODEL_SONNET,
    system,
    prompt: user,
    temperature: 0.8,
    maxTokens: 2000,
  });
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("IA não retornou JSON válido");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.variacoes) || parsed.variacoes.length !== 3) {
    throw new Error("IA não retornou 3 variações");
  }
  return parsed.variacoes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { lista_id } = await req.json();
    if (!lista_id) throw new Error("lista_id obrigatório");

    const { data: lista } = await supabase.from("listas_email").select("*").eq("id", lista_id).single();
    if (!lista) throw new Error("Lista não encontrada");
    if (lista.copy_gerado) throw new Error("Copy desta lista já foi gerado");

    const { data: membrosBase } = await supabase
      .from("lista_membros")
      .select("id, lead_id, email, leads(empresa, nome, origem_metadata)")
      .eq("lista_id", lista_id)
      .order("criado_em", { ascending: true });

    const membros = (membrosBase ?? []) as any[];
    if (membros.length === 0) throw new Error("Lista vazia");

    const variacoes = await gerarVariacoes(lista.nicho, lista.cidade);
    const slots = scheduleSlots(membros.length);

    for (let i = 0; i < membros.length; i++) {
      const m = membros[i];
      const varIdx = i % 3;
      const v = variacoes[varIdx];
      const empresa = m.leads?.empresa || m.leads?.nome || lista.nicho;
      const cidade = m.leads?.origem_metadata?.cidade || lista.cidade;
      const corpo = v.corpo.replace(/\{\{empresa\}\}/g, empresa).replace(/\{\{cidade\}\}/g, cidade);
      const assunto = v.assunto.replace(/\{\{empresa\}\}/g, empresa).replace(/\{\{cidade\}\}/g, cidade);
      const validado = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(m.email)
        && !/^(noreply|no-reply|donotreply|exemplo|example|test|admin|webmaster|postmaster|mailer-daemon)@/i.test(m.email);

      await supabase.from("lista_membros").update({
        variacao_copy: varIdx + 1,
        assunto, corpo,
        horario_envio: slots[i],
        validado,
        status_envio: validado ? "pendente" : "descartado",
      }).eq("id", m.id);
    }

    await supabase.from("listas_email").update({ copy_gerado: true, status: "enviando" }).eq("id", lista_id);

    return new Response(JSON.stringify({ sucesso: true, total: membros.length, slots }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-lista-emails error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
