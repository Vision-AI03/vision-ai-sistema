import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  const userId = claimsData.claims.sub as string;

  const { lead_id, novo_status, lead_nome } = await req.json();
  if (!lead_id || !novo_status) {
    return new Response(JSON.stringify({ error: "lead_id and novo_status are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Busca automação configurada para o novo estágio
  const { data: automacao } = await supabase
    .from("automacoes_estagio")
    .select("*")
    .eq("user_id", userId)
    .eq("estagio", novo_status)
    .eq("ativo", true)
    .maybeSingle();

  if (!automacao) {
    return new Response(JSON.stringify({ success: true, message: "No automation configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nome = lead_nome || "Lead";
  const actions: string[] = [];

  // Cria tarefa se configurado
  if (automacao.criar_tarefa && automacao.tarefa_titulo) {
    const prazo = new Date();
    prazo.setDate(prazo.getDate() + (automacao.tarefa_prazo_dias || 1));

    const titulo = automacao.tarefa_titulo.replace(/{lead_nome}/g, nome);
    const descricao = (automacao.tarefa_descricao || "").replace(/{lead_nome}/g, nome);

    const { error: tarefaError } = await supabase.from("tarefas").insert({
      user_id: userId,
      titulo,
      descricao,
      status: "a_fazer",
      prioridade: automacao.tarefa_prioridade || "media",
      data_vencimento: prazo.toISOString().split("T")[0],
      lead_id,
    });

    if (!tarefaError) actions.push("tarefa_criada");
  }

  // Cria notificação se configurado
  if (automacao.criar_notificacao && automacao.notificacao_titulo) {
    const titulo = automacao.notificacao_titulo.replace(/{lead_nome}/g, nome);
    const descricao = (automacao.notificacao_descricao || "").replace(/{lead_nome}/g, nome);

    const { error: notifError } = await supabase.from("notificacoes").insert({
      user_id: userId,
      tipo: "automacao",
      titulo,
      descricao,
      link: "/crm",
      metadata: { lead_id, estagio: novo_status },
    });

    if (!notifError) actions.push("notificacao_criada");
  }

  return new Response(JSON.stringify({ success: true, actions }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
