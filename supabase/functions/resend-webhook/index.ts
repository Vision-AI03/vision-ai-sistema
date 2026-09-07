import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook público do Resend. Endpoint aberto na internet, então TODO request é
// verificado pela assinatura Svix (padrão Standard Webhooks) antes de tocar no banco.
// Secret necessário nos Supabase secrets: RESEND_WEBHOOK_SECRET (o "whsec_..." que
// o Resend mostra ao criar o webhook em https://resend.com/webhooks).

const SIGNING_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");
const TOLERANCIA_SEGUNDOS = 5 * 60; // janela anti-replay

function b64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesParaB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Comparação em tempo constante — evita vazar a assinatura por timing.
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// HMAC-SHA256 sobre `${id}.${timestamp}.${body}` — o body TEM que ser o texto cru
// recebido, não um JSON reserializado (qualquer diferença de bytes quebra a assinatura).
async function assinaturaValida(req: Request, corpoCru: string): Promise<boolean> {
  if (!SIGNING_SECRET) {
    console.error("RESEND_WEBHOOK_SECRET não configurado — rejeitando request");
    return false;
  }

  const h = req.headers;
  const id = h.get("svix-id") ?? h.get("webhook-id");
  const ts = h.get("svix-timestamp") ?? h.get("webhook-timestamp");
  const assinaturas = h.get("svix-signature") ?? h.get("webhook-signature");
  if (!id || !ts || !assinaturas) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > TOLERANCIA_SEGUNDOS) return false;

  const segredoB64 = SIGNING_SECRET.startsWith("whsec_")
    ? SIGNING_SECRET.slice("whsec_".length)
    : SIGNING_SECRET;

  const chave = await crypto.subtle.importKey(
    "raw",
    b64ParaBytes(segredoB64),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const conteudo = new TextEncoder().encode(`${id}.${ts}.${corpoCru}`);
  const esperada = bytesParaB64(
    new Uint8Array(await crypto.subtle.sign("HMAC", chave, conteudo)),
  );

  // Header vem como lista separada por espaço: "v1,<sig> v1,<sig-antiga>"
  return assinaturas.split(" ").some((parte) => {
    const [versao, valor] = parte.split(",");
    return versao === "v1" && !!valor && comparaSeguro(valor, esperada);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const corpoCru = await req.text();

  if (!(await assinaturaValida(req, corpoCru))) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(corpoCru);
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
