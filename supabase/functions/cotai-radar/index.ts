// Radar de clientes da COT-AI (aba "Clientes COT-AI" do CRM).
// Lê a RPC radar_vision_ai do projeto da COT-AI (anon key + segredo do Vault de lá,
// sem a service_role), classifica cada empresa num sinal e liga ao lead pelo telefone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { donoDoBearer, cronValido } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DIA = 86400000;
// Upsell: pagante com uso alto. Limiar a calibrar quando houver pagantes de verdade.
const UPSELL_COTACOES_30D = 40;

type Empresa = {
  empresa_id: string; nome: string; telefone: string | null; status: string | null; plano: string | null;
  valor_contratado: number | null; inadimplente_desde: string | null; cancelada_em: string | null;
  cotacoes_30d: number; cotacoes_7d: number; ctes_30d: number; dias_ativos_30d: number; ultimo_uso: string | null;
};

function sinal(e: Empresa): { sinal: string; motivo: string } {
  const dias = e.ultimo_uso ? Math.floor((Date.now() - new Date(e.ultimo_uso).getTime()) / DIA) : null;
  const semUso = dias === null ? "nunca usou" : `sem uso há ${dias} dia${dias === 1 ? "" : "s"}`;
  switch (e.status) {
    case "cortesia":
      return { sinal: "interna", motivo: "cortesia, demonstração ou conta de parceiro" };
    case "inadimplente":
      return { sinal: "inadimplente", motivo: e.inadimplente_desde ? `inadimplente desde ${e.inadimplente_desde.slice(0, 10)}` : "inadimplente" };
    case "suspensa":
    case "cancelada":
      return { sinal: "cancelada", motivo: e.status };
    case "trial":
      return dias === null || dias >= 7
        ? { sinal: "esfriou_trial", motivo: semUso }
        : { sinal: "ativando", motivo: `${e.dias_ativos_30d} dia(s) de uso, ${e.cotacoes_7d} cotação(ões) na semana` };
    default: // ativa
      if (dias === null || dias >= 14) return { sinal: "risco_churn", motivo: semUso };
      if (e.cotacoes_30d >= UPSELL_COTACOES_30D || e.ctes_30d > 0) {
        return { sinal: "pronto_upsell", motivo: `${e.cotacoes_30d} cotações e ${e.ctes_30d} CT-e(s) auditado(s) em 30 dias` };
      }
      return { sinal: "pagante", motivo: `${e.cotacoes_30d} cotações em 30 dias` };
  }
}

const digitos = (t: string | null) => (t ?? "").replace(/\D/g, "");

async function chaveDeServico(req: Request): Promise<boolean> {
  const chave = req.headers.get("apikey") ?? "";
  if (!chave || chave.startsWith("sb_publishable_")) return false;
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, chave).auth.admin.listUsers({ perPage: 1 });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Também aceita a service_role: é como o operário local (skill operario-ia) lê o radar.
  // O env e a CLI podem trazer formatos diferentes da chave (JWT legado ou sb_secret_),
  // então a prova é a chave conseguir uma operação de admin, não a comparação de texto.
  if (!cronValido(req) && !(await donoDoBearer(req)) && !(await chaveDeServico(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = Deno.env.get("COTAI_URL");
  const chave = Deno.env.get("COTAI_PUBLISHABLE_KEY");
  const segredo = Deno.env.get("COTAI_RADAR_SECRET");
  if (!url || !chave || !segredo) return json({ ok: false, error: "COTAI_URL/COTAI_PUBLISHABLE_KEY/COTAI_RADAR_SECRET não configurados" });

  const res = await fetch(`${url}/rest/v1/rpc/radar_vision_ai`, {
    method: "POST",
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: JSON.stringify({ p_segredo: segredo }),
  });
  if (!res.ok) {
    console.error("radar_vision_ai:", res.status, await res.text());
    return json({ ok: false, error: `COT-AI recusou a leitura (${res.status})` });
  }
  const empresas = (await res.json()) as Empresa[];

  // Liga cada empresa ao lead do CRM pelos 8 últimos dígitos do telefone
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: leads } = await supabase.from("leads").select("id, nome, telefone, status");
  const porFim = new Map<string, { id: string; nome: string; status: string | null }>();
  for (const l of leads ?? []) {
    const d = digitos(l.telefone);
    if (d.length >= 8) porFim.set(d.slice(-8), { id: l.id, nome: l.nome, status: l.status });
  }

  const radar = empresas.map((e) => {
    const d = digitos(e.telefone);
    return { ...e, ...sinal(e), lead: d.length >= 8 ? porFim.get(d.slice(-8)) ?? null : null };
  });
  return json({ ok: true, gerado_em: new Date().toISOString(), empresas: radar });
});
