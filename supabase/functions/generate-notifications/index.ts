import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getTime() + 86400000)
      .toISOString()
      .split("T")[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const threeDaysFromNow = new Date(
      now.getTime() + 3 * 86400000
    ).toISOString();

    const notifications: {
      user_id: string;
      tipo: string;
      titulo: string;
      descricao: string;
      link: string;
      metadata: Record<string, unknown>;
    }[] = [];

    // 1. Parcelas vencendo amanhã
    const { data: parcelasAmanha } = await supabaseAdmin
      .from("parcelas")
      .select("*, contratos(cliente_nome)")
      .eq("status", "pendente")
      .eq("data_vencimento", tomorrow);

    for (const p of parcelasAmanha || []) {
      const clienteNome =
        (p.contratos as { cliente_nome?: string })?.cliente_nome || "Cliente";
      notifications.push({
        user_id: userId,
        tipo: "parcela_vencendo",
        titulo: `Parcela de R$${Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} vence amanhã`,
        descricao: `Contrato de ${clienteNome}`,
        link: "/financeiro",
        metadata: { parcela_id: p.id, contrato_id: p.contrato_id },
      });
    }

    // 2. Parcelas vencidas
    const { data: parcelasVencidas } = await supabaseAdmin
      .from("parcelas")
      .select("*, contratos(cliente_nome)")
      .eq("status", "pendente")
      .lt("data_vencimento", today);

    for (const p of parcelasVencidas || []) {
      const dias = Math.floor(
        (now.getTime() - new Date(p.data_vencimento).getTime()) / 86400000
      );
      const clienteNome =
        (p.contratos as { cliente_nome?: string })?.cliente_nome || "Cliente";
      notifications.push({
        user_id: userId,
        tipo: "parcela_vencida",
        titulo: `Parcela de R$${Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} está atrasada há ${dias} dias`,
        descricao: `Contrato de ${clienteNome}`,
        link: "/financeiro",
        metadata: { parcela_id: p.id, dias_atraso: dias },
      });
    }

    // 3. Leads parados há 7+ dias
    const { data: leadsParados } = await supabaseAdmin
      .from("leads")
      .select("id, nome, status, atualizado_em")
      .not("status", "in", '("cliente","perdido")')
      .lt("atualizado_em", sevenDaysAgo);

    for (const l of leadsParados || []) {
      const dias = Math.floor(
        (now.getTime() - new Date(l.atualizado_em).getTime()) / 86400000
      );
      notifications.push({
        user_id: userId,
        tipo: "lead_parado",
        titulo: `Lead ${l.nome} está em '${l.status}' há ${dias} dias`,
        descricao: "Considere avançar o contato",
        link: "/crm",
        metadata: { lead_id: l.id },
      });
    }

    // 4. Tarefas atrasadas
    const { data: tarefasAtrasadas } = await supabaseAdmin
      .from("tarefas")
      .select("id, titulo, data_vencimento")
      .eq("user_id", userId)
      .eq("concluida", false)
      .lt("data_vencimento", today);

    for (const t of tarefasAtrasadas || []) {
      notifications.push({
        user_id: userId,
        tipo: "tarefa_atrasada",
        titulo: `Tarefa '${t.titulo}' está atrasada`,
        descricao: `Venceu em ${t.data_vencimento}`,
        link: "/tarefas",
        metadata: { tarefa_id: t.id },
      });
    }

    // 5. Credenciais expirando em 3 dias
    const { data: credsExpirando } = await supabaseAdmin
      .from("credentials")
      .select("id, nome, servico, expira_em")
      .eq("user_id", userId)
      .eq("ativo", true)
      .lt("expira_em", threeDaysFromNow)
      .gt("expira_em", now.toISOString());

    for (const c of credsExpirando || []) {
      notifications.push({
        user_id: userId,
        tipo: "credencial_expirando",
        titulo: `${c.nome} (${c.servico}) expira em breve`,
        descricao: `Expira em ${new Date(c.expira_em).toLocaleDateString("pt-BR")}`,
        link: "/configuracoes/credenciais",
        metadata: { credential_id: c.id },
      });
    }

    // 6. Contratos pendentes de assinatura
    const { data: contratosPendentes } = await supabaseAdmin
      .from("contratos")
      .select("id, cliente_nome")
      .eq("status", "pendente_assinatura");

    for (const c of contratosPendentes || []) {
      notifications.push({
        user_id: userId,
        tipo: "contrato_pendente",
        titulo: `Contrato de ${c.cliente_nome} aguarda assinatura`,
        descricao: "",
        link: "/contratos",
        metadata: { contrato_id: c.id },
      });
    }

    // 7. Reuniões próximas (dentro de 1 hora)
    const oneHourFromNow = new Date(now.getTime() + 3600000).toISOString();
    const { data: reunioesProximas } = await supabaseAdmin
      .from("reunioes")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "agendada")
      .eq("notificacao_1h_enviada", false)
      .gte("data_hora_inicio", now.toISOString())
      .lte("data_hora_inicio", oneHourFromNow);

    for (const r of reunioesProximas || []) {
      const horario = new Date(r.data_hora_inicio).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      notifications.push({
        user_id: userId,
        tipo: "reuniao_proxima",
        titulo: `Reunião em 1 hora: ${r.titulo}`,
        descricao: `Início às ${horario}${r.local ? ` — ${r.local}` : ""}`,
        link: "/reunioes",
        metadata: { reuniao_id: r.id },
      });
      await supabaseAdmin
        .from("reunioes")
        .update({ notificacao_1h_enviada: true })
        .eq("id", r.id);
    }

    // 8. Reuniões hoje (notificação matinal — ainda não enviada, início após agora)
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setHours(23, 59, 59, 999);
    const { data: reunioesHoje } = await supabaseAdmin
      .from("reunioes")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "agendada")
      .eq("notificacao_dia_enviada", false)
      .gte("data_hora_inicio", now.toISOString())
      .lte("data_hora_inicio", startOfTomorrow.toISOString());

    for (const r of reunioesHoje || []) {
      const horario = new Date(r.data_hora_inicio).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      notifications.push({
        user_id: userId,
        tipo: "reuniao_hoje",
        titulo: `Reunião hoje às ${horario}: ${r.titulo}`,
        descricao: r.local || r.link_videoconferencia || "",
        link: "/reunioes",
        metadata: { reuniao_id: r.id },
      });
      await supabaseAdmin
        .from("reunioes")
        .update({ notificacao_dia_enviada: true })
        .eq("id", r.id);
    }

    // Clean up stale notifications referencing deleted entities
    // Delete notifications about leads that no longer exist
    const { data: allLeadNotifs } = await supabaseAdmin
      .from("notificacoes")
      .select("id, metadata")
      .eq("user_id", userId)
      .in("tipo", ["lead_parado", "novo_lead_webhook"]);

    if (allLeadNotifs && allLeadNotifs.length > 0) {
      const leadIds = [...new Set(allLeadNotifs
        .map((n) => (n.metadata as Record<string, unknown>)?.lead_id as string)
        .filter(Boolean))];
      
      if (leadIds.length > 0) {
        const { data: existingLeads } = await supabaseAdmin
          .from("leads")
          .select("id")
          .in("id", leadIds);
        
        const existingLeadIds = new Set((existingLeads || []).map((l) => l.id));
        const staleNotifIds = allLeadNotifs
          .filter((n) => {
            const lid = (n.metadata as Record<string, unknown>)?.lead_id as string;
            return lid && !existingLeadIds.has(lid);
          })
          .map((n) => n.id);
        
        if (staleNotifIds.length > 0) {
          await supabaseAdmin
            .from("notificacoes")
            .delete()
            .in("id", staleNotifIds);
        }
      }
    }

    // Deduplicate: don't create if similar notification exists in last 24h
    const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();
    const { data: recentNotifs } = await supabaseAdmin
      .from("notificacoes")
      .select("titulo, tipo")
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo);

    const existingSet = new Set(
      (recentNotifs || []).map((n) => `${n.tipo}::${n.titulo}`)
    );

    const newNotifs = notifications.filter(
      (n) => !existingSet.has(`${n.tipo}::${n.titulo}`)
    );

    if (newNotifs.length > 0) {
      await supabaseAdmin.from("notificacoes").insert(newNotifs);
    }

    return new Response(
      JSON.stringify({
        generated: newNotifs.length,
        skipped: notifications.length - newNotifs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
