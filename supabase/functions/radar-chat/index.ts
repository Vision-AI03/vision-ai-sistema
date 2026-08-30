import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeSearchChat, MODEL_SONNET, type ClaudeMessage } from "../_shared/anthropic.ts";

// Chat de pesquisa do Radar de Mercado. Você manda um tema/pergunta, o Claude
// busca na web (web_search) e responde com fontes. Histórico persistido por thread.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HISTORICO_MAX = 20; // últimas N mensagens enviadas ao modelo (controla custo/contexto)

function systemPrompt(): string {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    `Você é o analista de inteligência de mercado da Vision AI (agência de IA, founder solo Wesley; nichos: transportadoras, clínicas, imobiliárias, contabilidades; interior de SP→MG). ` +
    `Hoje é ${hoje}. Responda em pt-BR, direto e acionável. Quando a resposta depender de informação atual (lançamentos, notícias, preços, versões), USE a busca na web antes de responder — não invente. ` +
    `Cite as fontes. Seja factual e conciso; foque no que muda a decisão de negócio. Use markdown (títulos curtos, listas, tabelas quando útil).`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { thread_id, mensagem } = await req.json();
    const texto = String(mensagem ?? "").trim();
    if (!texto) throw new Error("Mensagem vazia.");

    // 1) Thread: usa a existente ou cria uma nova (título = tema truncado)
    let threadId: string = thread_id ?? "";
    let novaThread = false;
    if (!threadId) {
      const titulo = texto.replace(/\s+/g, " ").slice(0, 60);
      const { data, error } = await supabase
        .from("radar_chat_threads")
        .insert({ titulo })
        .select("id")
        .single();
      if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
      threadId = data.id;
      novaThread = true;
    }

    // 2) Histórico da thread (para dar contexto multi-turn ao modelo)
    const { data: hist } = await supabase
      .from("radar_chat_mensagens")
      .select("papel, conteudo, criado_em")
      .eq("thread_id", threadId)
      .order("criado_em", { ascending: true })
      .limit(HISTORICO_MAX);

    const messages: ClaudeMessage[] = (hist ?? []).map((m: any) => ({
      role: m.papel === "assistant" ? "assistant" : "user",
      content: m.conteudo,
    }));
    messages.push({ role: "user", content: texto });

    // 3) Grava a mensagem do usuário
    await supabase.from("radar_chat_mensagens").insert({ thread_id: threadId, papel: "user", conteudo: texto });

    // 4) Claude + web_search
    const { texto: resposta, fontes } = await callClaudeSearchChat({
      model: MODEL_SONNET,
      system: systemPrompt(),
      messages,
      maxTokens: 4096,
      maxSearches: 6,
    });
    const respostaFinal = resposta || "Não consegui gerar uma resposta agora.";

    // 5) Grava a resposta + fontes e atualiza a thread
    await supabase.from("radar_chat_mensagens").insert({
      thread_id: threadId, papel: "assistant", conteudo: respostaFinal, fontes,
    });
    await supabase.from("radar_chat_threads").update({ atualizado_em: new Date().toISOString() }).eq("id", threadId);

    return new Response(
      JSON.stringify({ ok: true, thread_id: threadId, nova_thread: novaThread, resposta: respostaFinal, fontes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("radar-chat erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
