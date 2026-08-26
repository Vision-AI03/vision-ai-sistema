import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };
const CAP_DIARIO = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Autorização: pg_cron passa X-Cron-Secret; um usuário autenticado também pode disparar manualmente.
  const cronSecret = req.headers.get("X-Cron-Secret");
  const auth = req.headers.get("Authorization");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronOk = expectedSecret && cronSecret === expectedSecret;
  if (!cronOk) {
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Vision AI <onboarding@resend.dev>";
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500 });
  }

  try {
    // 1) Cap diário
    const { data: jaEnviadosHoje } = await supabase.rpc("emails_enviados_hoje");
    const enviadosHoje = (jaEnviadosHoje as number | null) ?? 0;
    const orcamento = CAP_DIARIO - enviadosHoje;
    if (orcamento <= 0) {
      return new Response(JSON.stringify({ sucesso: true, motivo: "cap_diario_atingido", enviadosHoje }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Pega membros pendentes com horário vencido
    const { data: pendentes } = await supabase
      .from("lista_membros")
      .select("id, lista_id, email, assunto, corpo, validado")
      .eq("status_envio", "pendente")
      .eq("validado", true)
      .lte("horario_envio", new Date().toISOString())
      .order("horario_envio", { ascending: true })
      .limit(orcamento);

    const fila = pendentes ?? [];
    const resultados: any[] = [];

    for (const m of fila) {
      try {
        const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;font-size:14px;line-height:1.55;color:#222;">
          <div style="white-space:pre-wrap;">${(m.corpo || "").replace(/</g, "&lt;")}</div>
        </div>`;

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [m.email],
            subject: m.assunto || "Conversa rápida",
            html,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message || `resend ${r.status}`);

        await supabase.from("lista_membros").update({
          status_envio: "enviado",
          enviado_em: new Date().toISOString(),
          resend_id: data.id,
        }).eq("id", m.id);

        resultados.push({ id: m.id, ok: true });
      } catch (e: any) {
        await supabase.from("lista_membros").update({ status_envio: "erro" }).eq("id", m.id);
        resultados.push({ id: m.id, ok: false, erro: e?.message });
      }
    }

    // 3) Marca listas como concluídas quando não há mais pendentes
    const listaIds = [...new Set(fila.map((f) => f.lista_id))];
    for (const lid of listaIds) {
      const { count } = await supabase
        .from("lista_membros")
        .select("*", { count: "exact", head: true })
        .eq("lista_id", lid)
        .eq("status_envio", "pendente");
      if ((count ?? 0) === 0) {
        await supabase.from("listas_email").update({ status: "concluida" }).eq("id", lid);
      }
    }

    return new Response(JSON.stringify({ sucesso: true, processados: fila.length, resultados }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-scheduled-emails error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
