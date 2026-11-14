import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret do Meta).
// Sem META_APP_SECRET configurado, aceita com aviso no log: o leadgen_id ainda é
// conferido na Graph API com o token da página, então ID inventado não vira lead.
async function assinaturaMetaValida(req: Request, raw: string): Promise<boolean> {
  const segredo = Deno.env.get("META_APP_SECRET");
  if (!segredo) {
    console.warn("META_APP_SECRET não configurado — webhook do Meta aceito sem verificar assinatura");
    return true;
  }
  const recebida = req.headers.get("X-Hub-Signature-256") ?? "";
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(raw)));
  const esperada = "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (recebida.length !== esperada.length) return false;
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) diff |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET: Meta webhook verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("META_VERIFY_TOKEN");

    if (mode === "subscribe" && token === expectedToken && challenge) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST: New lead notification from Meta
  if (req.method === "POST") {
    try {
      const raw = await req.text();
      if (!(await assinaturaMetaValida(req, raw))) {
        return new Response("unauthorized", { status: 401, headers: corsHeaders });
      }
      const payload = JSON.parse(raw);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const metaToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
      if (!metaToken) {
        return new Response(JSON.stringify({ error: "META_PAGE_ACCESS_TOKEN not configured" }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      const entries = payload?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          if (change?.field !== "leadgen") continue;

          const { leadgen_id, ad_id, form_id, adgroup_id } = change.value || {};
          if (!leadgen_id) continue;

          // Fetch lead data from Meta Graph API
          const graphRes = await fetch(
            `https://graph.facebook.com/v21.0/${leadgen_id}?access_token=${metaToken}`
          );
          const graphData = await graphRes.json();

          if (!graphRes.ok || graphData.error) {
            console.error("Meta Graph API error:", graphData.error);
            continue;
          }

          // Map field_data array to object
          const fields: Record<string, string> = {};
          for (const field of graphData.field_data || []) {
            fields[field.name] = field.values?.[0] || "";
          }

          const nome = fields["full_name"] || fields["nome"] || "Lead Meta";
          const email = fields["email"] || "";
          const telefone = fields["phone_number"] || fields["telefone"] || null;
          const empresa = fields["company_name"] || fields["empresa"] || null;

          if (!email) {
            console.warn("Lead without email, skipping:", leadgen_id);
            continue;
          }

          const metadata = { ad_id, form_id, adgroup_id, leadgen_id };

          // Check duplicate
          const { data: existing } = await supabase
            .from("leads")
            .select("id")
            .eq("email", email.toLowerCase().trim())
            .maybeSingle();

          let leadId: string;

          if (existing) {
            leadId = existing.id;
            await supabase.from("leads").update({
              atualizado_em: new Date().toISOString(),
            }).eq("id", leadId);
          } else {
            const { data: newLead, error } = await supabase
              .from("leads")
              .insert({
                nome: nome.trim(),
                email: email.toLowerCase().trim(),
                telefone,
                empresa,
                status: "novo",
                origem: "meta_ads",
                origem_metadata: metadata,
              })
              .select("id")
              .single();

            if (error) {
              console.error("Insert error:", error);
              continue;
            }
            leadId = newLead.id;

            // Notification
            const { data: userId } = await supabase.rpc("owner_id");
            if (userId) {
              await supabase.from("notificacoes").insert({
                user_id: userId,
                tipo: "novo_lead_webhook",
                titulo: `Novo lead via Meta Ads: ${nome.trim()}`,
                descricao: empresa || email,
                link: "/crm",
                metadata: { lead_id: leadId, ...metadata },
              });
            }
          }
        }
      }

      // Meta requires 200 response to stop retrying
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("capture-lead-meta error:", err);
      // Still return 200 so Meta doesn't retry with bad payload
      return new Response(JSON.stringify({ error: "internal error" }), {
        status: 200,
        headers: corsHeaders,
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
