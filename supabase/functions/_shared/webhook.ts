// Autenticação de webhooks externos por segredo em query param (`?k=...`).
//
// Serviços como Apify e UazAPI não permitem header customizado no callback, então
// o segredo viaja na URL — que só existe dentro da nossa própria conta nesses
// serviços. Não é assinatura (não protege contra replay nem prova integridade do
// corpo), mas fecha o endpoint para a internet aberta, que é o problema real:
// sem isso qualquer POST anônimo insere lead no CRM ou queima token de IA.
//
// Para webhooks que oferecem assinatura de verdade (Resend/Svix), use a
// verificação de assinatura em vez disto.

// Comparação em tempo constante — evita vazar o segredo por timing.
function comparaSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Lê `?k=` da URL e compara com o secret nomeado. Falha fechado: se o secret não
// estiver configurado no ambiente, nada passa.
export function segredoDaQueryValido(req: Request, nomeDoSecret: string): boolean {
  const esperado = Deno.env.get(nomeDoSecret);
  if (!esperado) {
    console.error(`${nomeDoSecret} não configurado — rejeitando request`);
    return false;
  }
  const recebido = new URL(req.url).searchParams.get("k");
  if (!recebido) return false;
  return comparaSeguro(recebido, esperado);
}

// Contraparte de quem MONTA a URL de callback: garante que o segredo existe antes
// de registrar um webhook que, sem ele, responderia 401 para sempre.
export function segredoObrigatorio(nomeDoSecret: string): string {
  const valor = Deno.env.get(nomeDoSecret);
  if (!valor) {
    throw new Error(
      `${nomeDoSecret} não configurado nos secrets do Supabase — o webhook seria registrado sem segredo e rejeitaria o callback.`,
    );
  }
  return valor;
}
