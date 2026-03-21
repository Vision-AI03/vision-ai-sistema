import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Resend webhook — public endpoint, validated by signature
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const tipo = payload.type as string;
  const data = payload.data as Record<string, unknown>;
  const resendMessageId = data?.email_id as string;

  if (!resendMessageId || !tipo) {
    return new Response("Missing type or email_id", { status: 400 });
  }

  // Log do evento para auditoria
  await supabase.from("resend_eventos").insert({
    resend_message_id: resendMessageId,
    tipo,
    payload,
  });

  // Atualiza status nas tabelas relevantes
  if (tipo === "email.opened") {
    await supabase
      .from("comunicacoes")
      .update({ status: "aberto", aberto_em: new Date().toISOString() })
      .eq("resend_message_id", resendMessageId);

    await supabase
      .from("email_contatos")
      .update({ status_envio: "aberto" })
      .eq("resend_message_id", resendMessageId);

  } else if (tipo === "email.clicked") {
    await supabase
      .from("comunicacoes")
      .update({ status: "clicado", clicado_em: new Date().toISOString() })
      .eq("resend_message_id", resendMessageId);

  } else if (tipo === "email.bounced") {
    await supabase
      .from("comunicacoes")
      .update({ status: "bounced" })
      .eq("resend_message_id", resendMessageId);

    await supabase
      .from("email_contatos")
      .update({ status_envio: "bounced" })
      .eq("resend_message_id", resendMessageId);

  } else if (tipo === "email.delivered") {
    await supabase
      .from("comunicacoes")
      .update({ status: "entregue" })
      .eq("resend_message_id", resendMessageId);

    await supabase
      .from("email_contatos")
      .update({ status_envio: "entregue" })
      .eq("resend_message_id", resendMessageId);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
