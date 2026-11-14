const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Endpoint PÚBLICO por design: o api_token vai embutido no JS do site, então não é
// segredo de verdade — só filtra robô genérico. Por isso o endpoint se defende
// sozinho: limita tamanho dos campos, tem teto de leads novos por hora, nunca
// sobrescreve dados de lead existente e não revela se um email já está no CRM.
const LIMITE_NOVOS_POR_HORA = 20;
const VIA = "capture-lead-website";

function campo(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const ok = () =>
  new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Validate API token
    const expectedToken = Deno.env.get("WEBHOOK_API_TOKEN");
    const apiToken = typeof body?.api_token === "string" ? body.api_token : "";
    if (!expectedToken || !comparaSeguro(apiToken, expectedToken)) {
      return new Response(JSON.stringify({ error: "Unauthorized: invalid api_token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const nome = campo(body.nome, 120);
    const email = campo(body.email, 254)?.toLowerCase() ?? null;
    const telefone = campo(body.telefone, 30);
    const empresa = campo(body.empresa, 160);
    const mensagem = campo(body.mensagem, 4000);
    // origem vira slug curto: nada de texto livre gravado como origem do lead
    const origem = (campo(body.origem, 50) ?? "website").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "website";

    // Validate required fields
    if (!nome || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: nome, email" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: ownerId } = await supabase.rpc("owner_id");

    // Check for duplicate
    const { data: existing } = await supabase
      .from("leads")
      .select("id, nome, telefone, empresa")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Nunca sobrescreve: quem conhece o email de um cliente não pode trocar
      // nome/telefone dele. Só completa campos vazios e avisa o dono.
      const complemento: Record<string, string> = {};
      if (!existing.telefone && telefone) complemento.telefone = telefone;
      if (!existing.empresa && empresa) complemento.empresa = empresa;
      if (Object.keys(complemento).length) {
        await supabase.from("leads").update(complemento).eq("id", existing.id);
      }
      if (ownerId) {
        await supabase.from("notificacoes").insert({
          user_id: ownerId,
          tipo: "novo_lead_webhook",
          titulo: `Lead existente reenviou o formulário: ${existing.nome}`,
          descricao: mensagem ? mensagem.slice(0, 300) : email,
          link: "/crm",
          metadata: { lead_id: existing.id, nome_informado: nome },
        });
      }
      // Mesma resposta de um lead novo: não revela que o email já existe no CRM.
      return ok();
    }

    // Teto de leads novos por hora por este endpoint (anti-spam/flood).
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("origem_metadata->>via", VIA)
      .gte("criado_em", umaHoraAtras);
    if ((count ?? 0) >= LIMITE_NOVOS_POR_HORA) {
      console.warn("capture-lead-website: limite por hora atingido, descartando lead");
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: corsHeaders,
      });
    }

    // Create new lead
    const { data: newLead, error } = await supabase
      .from("leads")
      .insert({
        nome,
        email,
        telefone,
        empresa,
        mensagem_original: mensagem,
        status: "novo",
        origem,
        origem_metadata: { pagina: origem, via: VIA },
      })
      .select("id")
      .single();

    if (error) throw error;

    if (ownerId) {
      await supabase.from("notificacoes").insert({
        user_id: ownerId,
        tipo: "novo_lead_webhook",
        titulo: `Novo lead capturado via site: ${nome}`,
        descricao: empresa ?? email,
        link: "/crm",
        metadata: { lead_id: newLead.id },
      });
    }

    return ok();
  } catch (err) {
    console.error("capture-lead-website error:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
