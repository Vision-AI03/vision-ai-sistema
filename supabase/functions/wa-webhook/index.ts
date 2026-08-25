import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SEGREDO = Deno.env.get("WA_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  // Segredo via query param (UazAPI nem sempre permite header custom)
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== SEGREDO) {
    return new Response("unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supabase.from("wa_eventos_brutos").insert({ payload });
    if (error) console.error("insert falhou:", error.message);
    // Sempre 200: reenvio da UazAPI só duplicaria o problema.
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("payload invalido:", e);
    return new Response("ok", { status: 200 });
  }
});
