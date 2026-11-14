// Autorização central das Edge Functions.
//
// O sistema é single-tenant: só o dono (owner_id()) opera. Por isso "estar logado"
// não basta — a anon key é um JWT válido e pública (vai no bundle do front), e
// getClaims() a aceita sem erro (role=anon, sem sub). Toda função chamada pelo app
// precisa provar que o token é de um usuário real E que esse usuário é o dono.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Comparação em tempo constante — evita vazar o segredo por timing.
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// true se o id informado é o dono do sistema. Sem id (ex.: anon key) => false.
export async function ehDono(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data: dono } = await admin().rpc("owner_id");
  return !!dono && dono === userId;
}

// Valida o Bearer no servidor de auth (rejeita anon key, token forjado ou expirado)
// e exige que seja o dono. Retorna o id do dono ou null.
export async function donoDoBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await admin().auth.getUser(auth.slice(7));
  if (error || !data?.user) return null;
  return (await ehDono(data.user.id)) ? data.user.id : null;
}

// Chamadas do pg_cron: header X-Cron-Secret igual ao secret CRON_SECRET. Falha fechado.
export function cronValido(req: Request): boolean {
  const esperado = Deno.env.get("CRON_SECRET");
  const recebido = req.headers.get("X-Cron-Secret");
  return !!esperado && !!recebido && comparaSeguro(recebido, esperado);
}

// Para funções que rodam pelo cron E pelo app: aceita o segredo do cron ou o dono logado.
export async function cronOuDono(req: Request): Promise<boolean> {
  return cronValido(req) || (await donoDoBearer(req)) !== null;
}
